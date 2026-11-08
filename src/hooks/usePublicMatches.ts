import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type {
  Match,
  MatchPerformance,
  Team,
  Tournament,
  TournamentTeam,
} from "../types/database.types";

/**
 * Public read hooks for Matches & Tournaments (§6 Part 3).
 *
 * Publishing rules come from the database itself: RLS only ever
 * returns published matches/tournaments to anonymous visitors, and
 * performances only for published players in published matches —
 * the explicit `is_published` filters here are a second, readable
 * layer, not the enforcement. Nothing is invented: when Supabase is
 * not connected yet, the pages show honest empty states.
 */

export interface PublicMatchesState {
  loading: boolean;
  error: string | null;
  matches: Match[];
  tournaments: Tournament[];
  /** Published teams + tournament entries (migration 0043/0044). */
  teams: Team[];
  tournamentTeams: TournamentTeam[];
}

// Tournament reads use an explicit column ladder (the useTeams
// pattern): migration 0053 adds ONLY banner_url ahead of the
// parked 0044, so the live table can be in a base, banner-only or
// full state. The widest set that exists wins; a 42703 steps down.
const TOURNAMENT_BASE_COLUMNS = "id, name, sport, season, status, is_published, created_at";
const TOURNAMENT_EXTRA_COLUMNS =
  "banner_url, organizer, director, venue, description, format, team_count, points_win, points_draw, points_loss, champion_team_id, start_date, end_date, director_phone, squad_size, match_minutes, cricket_overs, ball_type, runner_up_team_id";
const TOURNAMENT_COLUMN_SETS = [
  `${TOURNAMENT_BASE_COLUMNS}, ${TOURNAMENT_EXTRA_COLUMNS}`,
  `${TOURNAMENT_BASE_COLUMNS}, banner_url`,
  TOURNAMENT_BASE_COLUMNS,
];

async function fetchPublishedTournaments(
  client: NonNullable<typeof supabase>,
): Promise<{ data: Tournament[]; error: string | null }> {
  let lastError: string | null = null;
  for (const cols of TOURNAMENT_COLUMN_SETS) {
    const res = await client
      .from("tournaments")
      .select(cols)
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (!res.error) return { data: (res.data ?? []) as unknown as Tournament[], error: null };
    lastError = res.error.message;
    if (res.error.code !== "42703") break;
  }
  return { data: [], error: lastError ?? "তথ্য লোড করা যায়নি।" };
}

export function usePublicMatches(): PublicMatchesState {
  const [state, setState] = useState<PublicMatchesState>({
    loading: true,
    error: null,
    matches: [],
    tournaments: [],
    teams: [],
    tournamentTeams: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setState({
        loading: false,
        error: null,
        matches: [],
        tournaments: [],
        teams: [],
        tournamentTeams: [],
      });
      return;
    }
    const client = supabase;
    let cancelled = false;
    (async () => {
      const [mRes, tRes] = await Promise.all([
        client
          .from("matches")
          .select("*")
          .eq("is_published", true)
          .order("match_date", { ascending: false, nullsFirst: false }),
        fetchPublishedTournaments(client),
      ]);
      if (cancelled) return;
      if (mRes.error || tRes.error) {
        setState({
          loading: false,
          error: "তথ্য লোড করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।",
          matches: [],
          tournaments: [],
          teams: [],
          tournamentTeams: [],
        });
        return;
      }
      // Teams + entries are fail-soft extras: if their tables are
      // not live yet the tournament page simply shows less.
      const [teamsRes, entriesRes] = await Promise.all([
        client
          .from("teams")
          .select("*")
          .eq("is_published", true)
          .order("display_order", { ascending: true }),
        client.from("tournament_teams").select("*").order("seed", { ascending: true }),
      ]);
      if (cancelled) return;
      setState({
        loading: false,
        error: null,
        matches: (mRes.data ?? []) as Match[],
        tournaments: (tRes.data ?? []) as Tournament[],
        teams: teamsRes.error ? [] : ((teamsRes.data ?? []) as Team[]),
        tournamentTeams: entriesRes.error ? [] : ((entriesRes.data ?? []) as TournamentTeam[]),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export interface PublicMatchDetails {
  status: "loading" | "ready" | "notfound" | "error";
  match: Match | null;
  tournament: Tournament | null;
  performances: (MatchPerformance & { player_name: string })[];
}

export function usePublicMatchDetails(id: string | undefined): PublicMatchDetails {
  const [state, setState] = useState<PublicMatchDetails>({
    status: "loading",
    match: null,
    tournament: null,
    performances: [],
  });

  useEffect(() => {
    if (!id) {
      setState({ status: "notfound", match: null, tournament: null, performances: [] });
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setState({ status: "notfound", match: null, tournament: null, performances: [] });
      return;
    }
    const client = supabase;
    let cancelled = false;
    (async () => {
      const { data: matchData, error: matchError } = await client
        .from("matches")
        .select("*")
        .eq("id", id)
        .eq("is_published", true)
        .single();
      if (cancelled) return;
      if (matchError || !matchData) {
        setState({ status: "notfound", match: null, tournament: null, performances: [] });
        return;
      }
      const match = matchData as Match;

      const [perfRes, tournamentRes] = await Promise.all([
        client.from("match_performances").select("*").eq("match_id", id),
        match.tournament_id
          ? client
              .from("tournaments")
              .select("*")
              .eq("id", match.tournament_id)
              .eq("is_published", true)
              .single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const perfs = (perfRes.data ?? []) as MatchPerformance[];
      let performances: PublicMatchDetails["performances"] = [];
      if (perfs.length > 0) {
        const playerIds = [...new Set(perfs.map((p) => p.player_id))];
        const { data: playerData } = await client
          .from("players")
          .select("id, name")
          .in("id", playerIds);
        const names = new Map(
          ((playerData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
        );
        performances = perfs
          .filter((p) => names.has(p.player_id))
          .map((p) => ({ ...p, player_name: names.get(p.player_id) as string }));
      }
      if (cancelled) return;
      setState({
        status: "ready",
        match,
        tournament: (tournamentRes.data as Tournament | null) ?? null,
        performances,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
