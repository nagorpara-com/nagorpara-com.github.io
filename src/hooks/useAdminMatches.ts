import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Match, Tournament, TournamentTeam } from "../types/database.types";
import { oversToBalls, parseScore } from "../utils/tournament";

/**
 * Admin data layer for Matches & Tournaments (§6 Part 2, extended
 * by the owner's Tournament Management rules, 2026-11-02).
 *
 * Writes are enforced by RLS (`can_edit_content()`: admin /
 * editor); deletes of matches/tournaments are admin-only in the
 * database (migration 0006).
 *
 * Migration 0044 (tournament fields, tournament_teams, match team
 * links) is applied live separately. Until it is live, saves that
 * carry 0044 fields FAIL SOFT: the write is retried with only the
 * pre-0044 fields and the caller gets a warning, so the panel keeps
 * working exactly as before instead of breaking.
 *
 * Migration 0053 (tournaments.banner_url alone) can be live ahead
 * of 0044: tournament reads and saves then work at a "banner"
 * support level — base fields plus the banner — probed once per
 * session (see probeTournamentSupport below).
 */
export interface TournamentDraft {
  name: string;
  sport: Tournament["sport"];
  season: string;
  status: Tournament["status"];
  is_published: boolean;
  banner_url: string;
  organizer: string;
  director: string;
  venue: string;
  description: string;
  /** "" = not chosen yet */
  format: "" | "league" | "knockout" | "group_knockout";
  /** "" = not set */
  team_count: string;
  points_win: string;
  points_draw: string;
  points_loss: string;
  // Step C revision fields (0044 draft, 2026-11-03). The total
  // match count is NOT a field — it is counted from the matches.
  start_date: string;
  end_date: string;
  director_phone: string;
  squad_size: string;
  match_minutes: string;
  cricket_overs: string;
  ball_type: string;
  /** "" = none chosen */
  runner_up_team_id: string;
}

export interface MatchDraft {
  sport: Match["sport"];
  tournament_id: string;
  opponent: string;
  match_date: string; // ISO string or ""
  venue: string;
  our_score: string;
  opponent_score: string;
  result: string;
  status: Match["status"];
  is_published: boolean;
  team_a_id: string;
  team_b_id: string;
  match_no: string;
  round: string;
  /** "" = none chosen */
  winner_team_id: string;
  is_draw: boolean;
  tiebreaker_note: string;
  /** Optional match banner image URL (0044, Phase A) */
  banner_url: string;
  // Step C revision fields (0044 draft, 2026-11-03).
  referee_name: string;
  /** "" = none chosen */
  toss_winner_team_id: string;
  /** "" | "bat" | "field" */
  toss_decision: string;
  /** Overs in cricket notation ("19.4") — converted to balls on save. */
  overs_a: string;
  overs_b: string;
  wickets_a: string;
  wickets_b: string;
  shootout_a: string;
  shootout_b: string;
  /** "" = none chosen */
  player_of_match_id: string;
}

export interface SaveResult {
  error: string | null;
  /** Set when 0044 fields had to be dropped (migration not live). */
  warning?: string;
}

const PRE_0044_WARNING =
  "মূল তথ্য সংরক্ষিত হয়েছে, তবে নতুন ঘরগুলো (ব্যানার/ফরম্যাট/টিম/রাউন্ড ইত্যাদি) এখনো Database-এ যোগ হয়নি — Migration 0044 লাইভ হলে এগুলোও সংরক্ষিত হবে।";

function isMissingColumnError(message: string): boolean {
  return /column|schema cache|tournament_teams/i.test(message);
}

// ---- Tournament column support (0044 extras vs 0053 banner) ----
// Migration 0053 adds ONLY tournaments.banner_url, ahead of the
// parked 0044 — so the live database can sit in an in-between
// state where the banner column exists but the other 0044 fields
// do not. Saving "full extras or base" would silently drop a
// banner the Admin just uploaded in that state, so the save
// payload follows a probed support level:
//   "full"   — the 0044 extras exist (probe: the format column)
//   "banner" — only banner_url exists (0053 without 0044)
//   "base"   — neither (pre-0053, pre-0044)
// The probe runs once per page session and is cached in module
// state (the useTeams ladder pattern); the reload ladder and the
// save fallback keep the cache honest if it ever goes stale.

type TournamentColumnsSupport = "full" | "banner" | "base";

const TOURNAMENT_BASE_COLUMNS = "id, name, sport, season, status, is_published, created_at";
const TOURNAMENT_EXTRA_COLUMNS =
  "banner_url, organizer, director, venue, description, format, team_count, points_win, points_draw, points_loss, champion_team_id, start_date, end_date, director_phone, squad_size, match_minutes, cricket_overs, ball_type, runner_up_team_id";
const TOURNAMENT_COLUMNS: Record<TournamentColumnsSupport, string> = {
  full: `${TOURNAMENT_BASE_COLUMNS}, ${TOURNAMENT_EXTRA_COLUMNS}`,
  banner: `${TOURNAMENT_BASE_COLUMNS}, banner_url`,
  base: TOURNAMENT_BASE_COLUMNS,
};
const SUPPORT_LADDER: TournamentColumnsSupport[] = ["full", "banner", "base"];

let tournamentSupportCache: TournamentColumnsSupport | null = null;
let tournamentSupportProbe: Promise<TournamentColumnsSupport> | null = null;

async function probeTournamentSupport(): Promise<TournamentColumnsSupport> {
  if (tournamentSupportCache) return tournamentSupportCache;
  if (!supabase) return "base";
  if (!tournamentSupportProbe) {
    const client = supabase;
    tournamentSupportProbe = (async () => {
      const full = await client.from("tournaments").select("format").limit(1);
      if (!full.error) {
        tournamentSupportCache = "full";
        return "full";
      }
      const banner = await client.from("tournaments").select("banner_url").limit(1);
      if (!banner.error) {
        tournamentSupportCache = "banner";
        return "banner";
      }
      tournamentSupportCache = "base";
      return "base";
    })();
  }
  return tournamentSupportProbe;
}

export function useAdminMatches() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Tournaments are read through the support ladder: the widest
    // column set the database actually has (see the probe above),
    // stepping down on a missing-column error if the cached probe
    // ever goes stale mid-session.
    let support = await probeTournamentSupport();
    let tRes = await supabase
      .from("tournaments")
      .select(TOURNAMENT_COLUMNS[support])
      .order("created_at", { ascending: false });
    while (tRes.error && isMissingColumnError(tRes.error.message) && support !== "base") {
      support = SUPPORT_LADDER[SUPPORT_LADDER.indexOf(support) + 1];
      tournamentSupportCache = support;
      tRes = await supabase
        .from("tournaments")
        .select(TOURNAMENT_COLUMNS[support])
        .order("created_at", { ascending: false });
    }
    const mRes = await supabase
      .from("matches")
      .select("*")
      .order("match_date", { ascending: false, nullsFirst: false });
    setLoading(false);
    if (tRes.error || mRes.error) {
      setLoadError((tRes.error ?? mRes.error)?.message ?? "তথ্য লোড করা যায়নি।");
      return;
    }
    setLoadError(null);
    setTournaments((tRes.data ?? []) as unknown as Tournament[]);
    setMatches((mRes.data ?? []) as Match[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Create (id = null) or update a tournament. */
  const saveTournament = useCallback(
    async (id: string | null, draft: TournamentDraft): Promise<SaveResult> => {
      if (!supabase) return { error: "Supabase সংযুক্ত নয়।" };
      const base = {
        name: draft.name.trim(),
        sport: draft.sport,
        season: draft.season.trim() || null,
        status: draft.status,
        is_published: draft.is_published,
      };
      const extra = {
        banner_url: draft.banner_url.trim() || null,
        organizer: draft.organizer.trim() || null,
        director: draft.director.trim() || null,
        venue: draft.venue.trim() || null,
        description: draft.description.trim() || null,
        format: draft.format || null,
        team_count: draft.team_count ? Number(draft.team_count) : null,
        points_win: draft.points_win === "" ? 3 : Number(draft.points_win),
        points_draw: draft.points_draw === "" ? 1 : Number(draft.points_draw),
        points_loss: draft.points_loss === "" ? 0 : Number(draft.points_loss),
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        director_phone: draft.director_phone.trim() || null,
        squad_size: draft.squad_size ? Number(draft.squad_size) : null,
        match_minutes: draft.match_minutes ? Number(draft.match_minutes) : null,
        cricket_overs: draft.cricket_overs ? Number(draft.cricket_overs) : null,
        ball_type: draft.ball_type.trim() || null,
        runner_up_team_id: draft.runner_up_team_id || null,
      };
      const full = { ...base, ...extra };
      // Payload follows the probed support level: full extras
      // when 0044 is live; base + banner_url in the in-between
      // state (0053 live, 0044 parked — the banner the Admin just
      // uploaded must still save); base only before both. A
      // missing-column error steps down one level and retries, so
      // a stale probe can never lose the whole save; whenever the
      // final write dropped extra fields the caller gets the
      // honest pre-0044 warning.
      let level = await probeTournamentSupport();
      for (;;) {
        const payload =
          level === "full"
            ? full
            : level === "banner"
              ? { ...base, banner_url: extra.banner_url }
              : base;
        const { error } = id
          ? await supabase.from("tournaments").update(payload).eq("id", id)
          : await supabase.from("tournaments").insert(payload);
        if (!error) {
          await reload();
          return level === "full"
            ? { error: null }
            : { error: null, warning: PRE_0044_WARNING };
        }
        if (!isMissingColumnError(error.message)) return { error: error.message };
        if (level === "base") return { error: error.message };
        level = SUPPORT_LADDER[SUPPORT_LADDER.indexOf(level) + 1];
        tournamentSupportCache = level;
      }
    },
    [reload],
  );

  /** Create (id = null) or update a match. */
  const saveMatch = useCallback(
    async (id: string | null, draft: MatchDraft): Promise<SaveResult> => {
      if (!supabase) return { error: "Supabase সংযুক্ত নয়।" };
      // Duplicate match-number pre-check (owner's Phase A rule):
      // one number per tournament. This is a form-level check done
      // before saving — it is NOT presented as a database-level
      // guarantee; the partial unique index in migration 0044
      // becomes the database-level guard once that migration is
      // live. If the check itself cannot run (0044 not live yet,
      // so the match_no column is missing), the save proceeds —
      // the panel must keep working pre-migration.
      const matchNo = draft.match_no ? Number(draft.match_no) : null;
      if (draft.tournament_id && matchNo !== null && Number.isFinite(matchNo)) {
        let dupQuery = supabase
          .from("matches")
          .select("id, opponent")
          .eq("tournament_id", draft.tournament_id)
          .eq("match_no", matchNo)
          .limit(1);
        if (id) dupQuery = dupQuery.neq("id", id);
        const { data: dupRows, error: dupError } = await dupQuery;
        if (!dupError && dupRows && dupRows.length > 0) {
          return {
            error: `এই টুর্নামেন্টে ম্যাচ নং ${draft.match_no} ইতিমধ্যে আছে (বনাম ${(dupRows[0] as { opponent: string }).opponent})। অন্য নম্বর দিন।`,
          };
        }
      }
      const base = {
        sport: draft.sport,
        tournament_id: draft.tournament_id || null,
        opponent: draft.opponent.trim(),
        match_date: draft.match_date || null,
        venue: draft.venue.trim() || null,
        our_score: draft.our_score.trim() || null,
        opponent_score: draft.opponent_score.trim() || null,
        result: draft.result.trim() || null,
        status: draft.status,
        is_published: draft.is_published,
      };
      // Structured result: an explicitly chosen winner/draw wins;
      // otherwise a completed match between two linked teams with
      // two numeric scores derives its winner automatically.
      let winner = draft.winner_team_id || null;
      let isDraw = draft.is_draw;
      if (
        draft.status === "completed" &&
        !winner &&
        !isDraw &&
        draft.team_a_id &&
        draft.team_b_id
      ) {
        const a = parseScore(draft.our_score);
        const b = parseScore(draft.opponent_score);
        if (a !== null && b !== null) {
          if (a > b) winner = draft.team_a_id;
          else if (b > a) winner = draft.team_b_id;
          else isDraw = true;
        }
      }
      const extra = {
        team_a_id: draft.team_a_id || null,
        team_b_id: draft.team_b_id || null,
        match_no: draft.match_no ? Number(draft.match_no) : null,
        round: draft.round.trim() || null,
        winner_team_id: winner,
        is_draw: isDraw,
        tiebreaker_note: draft.tiebreaker_note.trim() || null,
        banner_url: draft.banner_url.trim() || null,
        referee_name: draft.referee_name.trim() || null,
        toss_winner_team_id: draft.toss_winner_team_id || null,
        toss_decision: draft.toss_decision || null,
        team_a_balls: oversToBalls(draft.overs_a),
        team_b_balls: oversToBalls(draft.overs_b),
        team_a_wickets: draft.wickets_a === "" ? null : Number(draft.wickets_a),
        team_b_wickets: draft.wickets_b === "" ? null : Number(draft.wickets_b),
        shootout_a: draft.shootout_a === "" ? null : Number(draft.shootout_a),
        shootout_b: draft.shootout_b === "" ? null : Number(draft.shootout_b),
        player_of_match_id: draft.player_of_match_id || null,
      };
      const full = { ...base, ...extra };
      const { error } = id
        ? await supabase.from("matches").update(full).eq("id", id)
        : await supabase.from("matches").insert(full);
      if (!error) {
        await reload();
        return { error: null };
      }
      if (!isMissingColumnError(error.message)) return { error: error.message };
      const retry = id
        ? await supabase.from("matches").update(base).eq("id", id)
        : await supabase.from("matches").insert(base);
      if (retry.error) return { error: retry.error.message };
      await reload();
      return { error: null, warning: PRE_0044_WARNING };
    },
    [reload],
  );

  const setTournamentPublished = useCallback(
    async (id: string, published: boolean): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase
        .from("tournaments")
        .update({ is_published: published })
        .eq("id", id);
      if (error) return error.message;
      setTournaments((prev) => prev.map((t) => (t.id === id ? { ...t, is_published: published } : t)));
      return null;
    },
    [],
  );

  const setMatchPublished = useCallback(
    async (id: string, published: boolean): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase.from("matches").update({ is_published: published }).eq("id", id);
      if (error) return error.message;
      setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, is_published: published } : m)));
      return null;
    },
    [],
  );

  // Deletes (owner's decision, 2026-11-02 — panel delete = database
  // delete, verified by re-reading the row). Deleting a match
  // cascades to its performances; deleting a tournament unlinks
  // its matches and cascades its team entries (0044).
  const deleteMatch = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase.from("matches").delete().eq("id", id);
      if (error) return error.message;
      const { data } = await supabase.from("matches").select("id").eq("id", id).maybeSingle();
      if (data && (data as { id: string }).id === id) return "মুছে ফেলার পরও ম্যাচটি রয়ে গেছে — আবার চেষ্টা করুন।";
      await reload();
      return null;
    },
    [reload],
  );

  const deleteTournament = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase.from("tournaments").delete().eq("id", id);
      if (error) return error.message;
      const { data } = await supabase.from("tournaments").select("id").eq("id", id).maybeSingle();
      if (data && (data as { id: string }).id === id) return "মুছে ফেলার পরও টুর্নামেন্টটি রয়ে গেছে — আবার চেষ্টা করুন।";
      await reload();
      return null;
    },
    [reload],
  );

  // ---- Tournament team entries (migration 0044) ----

  /** All entries of one tournament, seed order. Fail-soft: []. */
  const fetchTournamentTeams = useCallback(
    async (tournamentId: string): Promise<TournamentTeam[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("tournament_teams")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("seed", { ascending: true });
      if (error || !data) return [];
      return data as TournamentTeam[];
    },
    [],
  );

  /**
   * Replace a tournament's entries with exactly `teamIds` (array
   * order = seed). Verified by reading the entries back.
   *
   * Migration 0056: `codes` carries each kept team's Team ID over
   * the replace (keyed by team_id) so a panel save never loses an
   * assigned ID. Codes ride along only when at least one is set;
   * if the team_code column is not live yet (0056 pending) the
   * insert is retried without them — plain entries, as before.
   */
  const setTournamentTeams = useCallback(
    async (
      tournamentId: string,
      teamIds: string[],
      codes?: Record<string, string | null>,
    ): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const del = await supabase
        .from("tournament_teams")
        .delete()
        .eq("tournament_id", tournamentId);
      if (del.error) {
        if (isMissingColumnError(del.error.message)) {
          return "টিম নিবন্ধন এখনো Database-এ চালু হয়নি — Migration 0044 লাইভ হলে এই অংশ কাজ করবে।";
        }
        return del.error.message;
      }
      const withCodes =
        !!codes && teamIds.some((team_id) => codes[team_id]);
      let codesWritten = false;
      if (teamIds.length > 0) {
        const rows = teamIds.map((team_id, i) => ({
          tournament_id: tournamentId,
          team_id,
          seed: i + 1,
          ...(withCodes ? { team_code: codes?.[team_id] ?? null } : {}),
        }));
        const ins = await supabase.from("tournament_teams").insert(rows);
        if (!ins.error) {
          codesWritten = withCodes;
        } else if (ins.error) {
          if (withCodes && isMissingColumnError(ins.error.message)) {
            const plain = teamIds.map((team_id, i) => ({
              tournament_id: tournamentId,
              team_id,
              seed: i + 1,
            }));
            const retry = await supabase.from("tournament_teams").insert(plain);
            if (retry.error) return retry.error.message;
          } else {
            if (ins.error.code === "23505") {
              return "একটি Team ID এই টুর্নামেন্টে অন্য টিম ব্যবহার করছে — IDগুলো দেখে আবার সংরক্ষণ করুন।";
            }
            return ins.error.message;
          }
        }
      }
      const back = await fetchTournamentTeams(tournamentId);
      const backIds = back.map((e) => e.team_id).sort();
      const wantIds = [...teamIds].sort();
      if (JSON.stringify(backIds) !== JSON.stringify(wantIds)) {
        return "সংরক্ষণের পর যাচাইয়ে মিল পাওয়া যায়নি — আবার চেষ্টা করুন।";
      }
      if (codesWritten) {
        const mismatch = back.some(
          (e) => (e.team_code ?? null) !== (codes?.[e.team_id] ?? null),
        );
        if (mismatch) {
          return "টিম সংরক্ষিত হয়েছে, তবে Team ID যাচাইয়ে মিল পাওয়া যায়নি — আবার সংরক্ষণ করুন।";
        }
      }
      return null;
    },
    [fetchTournamentTeams],
  );

  /** Bulk-create generated fixtures (unpublished, upcoming). */
  const createMatchesBulk = useCallback(
    async (
      rows: {
        sport: Match["sport"];
        tournament_id: string;
        opponent: string;
        team_a_id: string;
        team_b_id: string;
        match_no: number;
        round: string;
      }[],
    ): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      if (rows.length === 0) return null;
      const payload = rows.map((r) => ({
        ...r,
        status: "upcoming" as const,
        is_published: false,
      }));
      const { error } = await supabase.from("matches").insert(payload);
      if (error) {
        if (isMissingColumnError(error.message)) {
          return "ম্যাচের সূচি তৈরি করা যায়নি — Migration 0044 লাইভ হলে এই অংশ কাজ করবে।";
        }
        return error.message;
      }
      await reload();
      return null;
    },
    [reload],
  );

  /**
   * Keep tournaments.champion_team_id in step with the final: the
   * completed final's winner becomes champion; if the final is
   * reopened or its winner removed, the champion is cleared.
   */
  const syncChampion = useCallback(
    async (tournamentId: string): Promise<void> => {
      if (!supabase) return;
      const { data } = await supabase
        .from("matches")
        .select("round, status, winner_team_id")
        .eq("tournament_id", tournamentId)
        .eq("round", "ফাইনাল");
      const final = (data ?? []).find(
        (m) => m.status === "completed" && m.winner_team_id,
      ) as { winner_team_id: string } | undefined;
      const championId = final?.winner_team_id ?? null;
      const { data: tRow } = await supabase
        .from("tournaments")
        .select("champion_team_id")
        .eq("id", tournamentId)
        .maybeSingle();
      const current = (tRow as { champion_team_id?: string | null } | null)?.champion_team_id ?? null;
      if (current === championId) return;
      const { error } = await supabase
        .from("tournaments")
        .update({ champion_team_id: championId })
        .eq("id", tournamentId);
      if (!error) {
        setTournaments((prev) =>
          prev.map((t) => (t.id === tournamentId ? { ...t, champion_team_id: championId } : t)),
        );
      }
    },
    [],
  );

  return {
    isConfigured: isSupabaseConfigured,
    loading,
    loadError,
    tournaments,
    matches,
    reload,
    saveTournament,
    saveMatch,
    setTournamentPublished,
    setMatchPublished,
    deleteMatch,
    deleteTournament,
    fetchTournamentTeams,
    setTournamentTeams,
    createMatchesBulk,
    syncChampion,
  };
}
