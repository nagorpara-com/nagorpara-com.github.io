import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Player } from "../types/database.types";
import { EMPTY_CRICKET_RAW, type CricketRawStats } from "../utils/cricketStats";
import { PUBLIC_PLAYER_BASE_COLUMNS, PUBLIC_PLAYER_COLUMNS } from "./usePlayers";

/** One season of cricket stats (raw numbers only; averages and rates
 * are derived by utils/cricketStats). Same no-double-counting rule as
 * football: a season computed from match performances overrides the
 * stored row for that season. */
export interface CricketSeasonStats extends CricketRawStats {
  season: string;
  source: "computed" | "stored";
  /** Stored manual best-bowling text (historical seasons only). */
  best_bowling: string | null;
}

export interface CricketSquadPlayer extends Player {
  totals: CricketRawStats | null;
  seasons: CricketSeasonStats[];
}

export interface CricketMatchRow {
  matchId: string;
  opponent: string;
  matchDate: string | null;
  tournamentName: string | null;
  ourScore: string | null;
  opponentScore: string | null;
  result: string | null;
  runs: number;
  wickets: number;
  balls_bowled: number;
  runs_conceded: number;
}

interface StoredRow extends CricketRawStats {
  player_id: string;
  season: string;
  best_bowling: string | null;
}

interface ComputedRow extends CricketRawStats {
  player_id: string;
  season: string;
}

function mergeSeasons(stored: StoredRow[], computed: ComputedRow[]): CricketSeasonStats[] {
  const bySeason = new Map<string, CricketSeasonStats>();
  for (const row of stored) bySeason.set(row.season, { ...row, source: "stored" });
  for (const row of computed) {
    bySeason.set(row.season, { ...row, best_bowling: null, source: "computed" });
  }
  return [...bySeason.values()].sort((a, b) => b.season.localeCompare(a.season));
}

function totalsOf(seasons: CricketSeasonStats[]): CricketRawStats | null {
  if (seasons.length === 0) return null;
  const total: CricketRawStats = { ...EMPTY_CRICKET_RAW };
  for (const s of seasons) {
    (Object.keys(EMPTY_CRICKET_RAW) as (keyof CricketRawStats)[]).forEach((key) => {
      if (key === "highest_score") return; // a maximum, not a sum
      total[key] += s[key];
    });
    total.highest_score = Math.max(total.highest_score, s.highest_score);
  }
  return total;
}

async function loadStats(
  client: NonNullable<typeof supabase>,
  playerIds: string[],
): Promise<Map<string, CricketSeasonStats[]>> {
  if (playerIds.length === 0) return new Map();
  const [storedRes, computedRes] = await Promise.all([
    client.from("cricket_player_stats").select("*").in("player_id", playerIds),
    client.from("cricket_season_stats").select("*").in("player_id", playerIds),
  ]);
  const group = <T extends { player_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.player_id) ?? [];
      list.push(row);
      map.set(row.player_id, list);
    }
    return map;
  };
  const storedBy = group((storedRes.data ?? []) as StoredRow[]);
  const computedBy = group((computedRes.data ?? []) as ComputedRow[]);
  const result = new Map<string, CricketSeasonStats[]>();
  for (const id of playerIds) {
    result.set(id, mergeSeasons(storedBy.get(id) ?? [], computedBy.get(id) ?? []));
  }
  return result;
}

/** Public visibility rule (migration 0004): published + active + not archived.
 * Column list is the shared PRIVACY list from usePlayers — phone
 * and address are never selected on public paths. */
function publicCricketQuery(client: NonNullable<typeof supabase>, columns: string) {
  return client
    .from("players")
    .select(columns)
    .eq("sport", "cricket")
    .eq("is_active", true)
    .eq("status", "published")
    .is("archived_at", null);
}

/**
 * Cricket squad (Phase 7). Reads `players`, `cricket_player_stats`
 * (season-wise stored) and the `cricket_season_stats` view (computed
 * from match performances). Until Supabase is connected the list is
 * empty and the page shows its honest empty state.
 */
export function useCricketSquad(): { configured: boolean; players: CricketSquadPlayer[] } {
  const [state, setState] = useState<{ configured: boolean; players: CricketSquadPlayer[] }>({
    configured: false,
    players: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;

    (async () => {
      let res = await publicCricketQuery(client, PUBLIC_PLAYER_COLUMNS).order("display_order");
      if (res.error && res.error.code === "42703") {
        res = await publicCricketQuery(client, PUBLIC_PLAYER_BASE_COLUMNS).order("display_order");
      }
      const { data } = res;
      if (cancelled) return;
      const players = (data ?? []) as unknown as Player[];
      const statsByPlayer = await loadStats(client, players.map((p) => p.id));
      if (cancelled) return;
      setState({
        configured: true,
        players: players.map((p) => {
          const seasons = statsByPlayer.get(p.id) ?? [];
          return { ...p, seasons, totals: totalsOf(seasons) };
        }),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export type CricketProfileStatus = "unconfigured" | "notfound" | "ok";

export interface CricketProfile {
  status: CricketProfileStatus;
  player: CricketSquadPlayer | null;
  history: CricketMatchRow[];
}

/**
 * One cricket player's profile: player row + season-wise stats +
 * match history from `match_performances` joined with published
 * cricket `matches`. Best bowling figures are derived from the
 * history by the page (utils/cricketStats).
 */
export function useCricketPlayer(id: string | undefined): CricketProfile {
  const [state, setState] = useState<CricketProfile>({
    status: isSupabaseConfigured ? "notfound" : "unconfigured",
    player: null,
    history: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !id) return;
    const client = supabase;
    let cancelled = false;

    (async () => {
      let res = await publicCricketQuery(client, PUBLIC_PLAYER_COLUMNS).eq("id", id).single();
      if (res.error && res.error.code === "42703") {
        res = await publicCricketQuery(client, PUBLIC_PLAYER_BASE_COLUMNS).eq("id", id).single();
      }
      const { data: playerData } = res;
      if (cancelled) return;
      if (!playerData) {
        setState({ status: "notfound", player: null, history: [] });
        return;
      }
      const player = playerData as unknown as Player;

      const [statsByPlayer, perfRes] = await Promise.all([
        loadStats(client, [id]),
        client
          .from("match_performances")
          .select("runs, wickets, balls_bowled, runs_conceded, match_id")
          .eq("player_id", id),
      ]);
      if (cancelled) return;

      const performances = (perfRes.data ?? []) as {
        runs: number;
        wickets: number;
        balls_bowled: number;
        runs_conceded: number;
        match_id: string;
      }[];

      let history: CricketMatchRow[] = [];
      if (performances.length > 0) {
        const matchIds = performances.map((p) => p.match_id);
        const [matchesRes, tournamentsRes] = await Promise.all([
          client
            .from("matches")
            .select("id, opponent, match_date, our_score, opponent_score, result, tournament_id")
            .eq("is_published", true)
            .eq("sport", "cricket")
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
            runs: perfByMatch.get(m.id)?.runs ?? 0,
            wickets: perfByMatch.get(m.id)?.wickets ?? 0,
            balls_bowled: perfByMatch.get(m.id)?.balls_bowled ?? 0,
            runs_conceded: perfByMatch.get(m.id)?.runs_conceded ?? 0,
          }));
      }

      const seasons = statsByPlayer.get(id) ?? [];
      setState({
        status: "ok",
        player: { ...player, seasons, totals: totalsOf(seasons) },
        history,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
