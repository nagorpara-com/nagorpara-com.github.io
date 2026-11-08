import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Player } from "../types/database.types";

export interface FootballStats {
  matches: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
}

/** One season of stats. `source` follows the no-double-counting rule
 * (migration 0004): a season computed from match performances is
 * final; stored rows cover only seasons without performance records. */
export interface SeasonStats extends FootballStats {
  season: string;
  source: "computed" | "stored";
}

export interface SquadPlayer extends Player {
  /** Totals across all seasons, or null when the player has no stats. */
  stats: FootballStats | null;
  seasons: SeasonStats[];
}

export interface MatchHistoryRow {
  matchId: string;
  opponent: string;
  matchDate: string | null;
  tournamentName: string | null;
  ourScore: string | null;
  opponentScore: string | null;
  result: string | null;
  goals: number;
  assists: number;
}

interface StatsRow extends FootballStats {
  player_id: string;
  season: string;
}

function mergeSeasons(stored: StatsRow[], computed: StatsRow[]): SeasonStats[] {
  const bySeason = new Map<string, SeasonStats>();
  for (const row of stored) {
    bySeason.set(row.season, { ...row, source: "stored" });
  }
  // Computed rows override stored rows for the same season — the same
  // season is never counted twice.
  for (const row of computed) {
    bySeason.set(row.season, { ...row, source: "computed" });
  }
  return [...bySeason.values()].sort((a, b) => b.season.localeCompare(a.season));
}

function totalsOf(seasons: SeasonStats[]): FootballStats | null {
  if (seasons.length === 0) return null;
  const total: FootballStats = { matches: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 };
  for (const s of seasons) {
    total.matches += s.matches;
    total.goals += s.goals;
    total.assists += s.assists;
    total.yellow_cards += s.yellow_cards;
    total.red_cards += s.red_cards;
  }
  return total;
}

async function loadPlayerStats(
  client: NonNullable<typeof supabase>,
  playerIds: string[],
): Promise<Map<string, SeasonStats[]>> {
  if (playerIds.length === 0) return new Map();
  const [storedRes, computedRes] = await Promise.all([
    client.from("football_player_stats").select("*").in("player_id", playerIds),
    client.from("football_season_stats").select("*").in("player_id", playerIds),
  ]);
  const group = (rows: StatsRow[]) => {
    const map = new Map<string, StatsRow[]>();
    for (const row of rows) {
      const list = map.get(row.player_id) ?? [];
      list.push(row);
      map.set(row.player_id, list);
    }
    return map;
  };
  const storedByPlayer = group((storedRes.data ?? []) as StatsRow[]);
  const computedByPlayer = group((computedRes.data ?? []) as StatsRow[]);
  const result = new Map<string, SeasonStats[]>();
  for (const id of playerIds) {
    result.set(id, mergeSeasons(storedByPlayer.get(id) ?? [], computedByPlayer.get(id) ?? []));
  }
  return result;
}

/**
 * PRIVACY (owner's Step B decision, 2026-11-03): players.phone
 * and players.address are ADMIN ONLY — public queries select an
 * explicit column list that never includes them, so the values
 * never even reach a visitor's browser. The FULL list adds the
 * migration-0051 display columns (date_of_birth, preferred_foot,
 * role); while 0051 is missing the select fails with 42703 and
 * callers retry with the BASE list, so the public site keeps
 * working unchanged. Shared by every public players query
 * (football, cricket, homepage).
 */
export const PUBLIC_PLAYER_BASE_COLUMNS =
  "id, sport, name, photo_url, jersey_no, position, bio, club, team_id, batting_style, bowling_style, is_active, display_order, status, archived_at, created_at";
export const PUBLIC_PLAYER_COLUMNS =
  PUBLIC_PLAYER_BASE_COLUMNS + ", date_of_birth, preferred_foot, role";

/** Public visibility rule (migration 0004): published + active + not archived. */
function publicPlayerQuery(client: NonNullable<typeof supabase>, columns: string) {
  return client
    .from("players")
    .select(columns)
    .eq("sport", "football")
    .eq("is_active", true)
    .eq("status", "published")
    .is("archived_at", null);
}

/**
 * Football squad (Phase 6 + management rules). Reads the existing
 * `players`, `football_player_stats` (season-wise, stored) and the
 * `football_season_stats` view (computed from match performances).
 * Until Supabase is connected the list is empty and the page shows
 * its honest empty state; no sample players exist.
 */
export function useFootballSquad(): { configured: boolean; players: SquadPlayer[] } {
  const [state, setState] = useState<{ configured: boolean; players: SquadPlayer[] }>({
    configured: false,
    players: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;

    (async () => {
      let res = await publicPlayerQuery(client, PUBLIC_PLAYER_COLUMNS).order("display_order");
      if (res.error && res.error.code === "42703") {
        res = await publicPlayerQuery(client, PUBLIC_PLAYER_BASE_COLUMNS).order("display_order");
      }
      const { data } = res;
      if (cancelled) return;
      const players = (data ?? []) as unknown as Player[];
      const statsByPlayer = await loadPlayerStats(client, players.map((p) => p.id));
      if (cancelled) return;
      setState({
        configured: true,
        players: players.map((p) => {
          const seasons = statsByPlayer.get(p.id) ?? [];
          return { ...p, seasons, stats: totalsOf(seasons) };
        }),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export type PlayerProfileStatus = "unconfigured" | "notfound" | "ok";

export interface PlayerProfile {
  status: PlayerProfileStatus;
  player: SquadPlayer | null;
  history: MatchHistoryRow[];
}

/**
 * One football player's profile: player row + season-wise stats +
 * match history from `match_performances` joined with published
 * `matches` (and tournament names). RLS enforces the same public
 * visibility rule on the database side.
 */
export function useFootballPlayer(id: string | undefined): PlayerProfile {
  const [state, setState] = useState<PlayerProfile>({
    status: isSupabaseConfigured ? "notfound" : "unconfigured",
    player: null,
    history: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !id) return;
    const client = supabase;
    let cancelled = false;

    (async () => {
      let res = await publicPlayerQuery(client, PUBLIC_PLAYER_COLUMNS).eq("id", id).single();
      if (res.error && res.error.code === "42703") {
        res = await publicPlayerQuery(client, PUBLIC_PLAYER_BASE_COLUMNS).eq("id", id).single();
      }
      const { data: playerData } = res;
      if (cancelled) return;
      if (!playerData) {
        setState({ status: "notfound", player: null, history: [] });
        return;
      }
      const player = playerData as unknown as Player;

      const [statsByPlayer, perfRes] = await Promise.all([
        loadPlayerStats(client, [id]),
        client.from("match_performances").select("goals, assists, match_id").eq("player_id", id),
      ]);
      if (cancelled) return;

      const performances = (perfRes.data ?? []) as {
        goals: number;
        assists: number;
        match_id: string;
      }[];

      let history: MatchHistoryRow[] = [];
      if (performances.length > 0) {
        const matchIds = performances.map((p) => p.match_id);
        const [matchesRes, tournamentsRes] = await Promise.all([
          client
            .from("matches")
            .select("id, opponent, match_date, our_score, opponent_score, result, tournament_id")
            .eq("is_published", true)
            .in("id", matchIds)
            .order("match_date", { ascending: false }),
          client.from("tournaments").select("id, name").eq("is_published", true),
        ]);
        if (cancelled) return;
        const tournamentNames = new Map<string, string>(
          (tournamentsRes.data ?? []).map((t: { id: string; name: string }) => [t.id, t.name]),
        );
        const perfByMatch = new Map(performances.map((p) => [p.match_id, p]));
        history = ((matchesRes.data ?? []) as {
          id: string;
          opponent: string;
          match_date: string | null;
          our_score: string | null;
          opponent_score: string | null;
          result: string | null;
          tournament_id: string | null;
        }[])
          .filter((m) => perfByMatch.has(m.id))
          .map((m) => ({
            matchId: m.id,
            opponent: m.opponent,
            matchDate: m.match_date,
            tournamentName: m.tournament_id ? (tournamentNames.get(m.tournament_id) ?? null) : null,
            ourScore: m.our_score,
            opponentScore: m.opponent_score,
            result: m.result,
            goals: perfByMatch.get(m.id)?.goals ?? 0,
            assists: perfByMatch.get(m.id)?.assists ?? 0,
          }));
      }

      const seasons = statsByPlayer.get(id) ?? [];
      setState({
        status: "ok",
        player: { ...player, seasons, stats: totalsOf(seasons) },
        history,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
