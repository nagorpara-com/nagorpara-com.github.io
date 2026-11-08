import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Match, MatchPerformance, Player } from "../types/database.types";

/**
 * Admin data layer for one match's player performances (§6 Part 3).
 *
 * - Players are loaded ONLY for the match's sport (sport integrity at
 *   the form level; the Part 1 audit found no database trigger for
 *   this, so the form + a save-time check enforce it).
 * - Duplicate (match_id, player_id) is prevented in the form (used
 *   players are not offered again) AND by the database unique
 *   constraint — a violation is reported in Bengali, never hidden.
 * - Season statistics need no syncing here: the
 *   football_season_stats / cricket_season_stats views compute from
 *   these rows (published matches only) at query time.
 * - Removing a performance is admin-only (§6 Security Fix): the UI
 *   shows the control only to admin profiles, and
 *   migration 0006 requires is_admin() for the DELETE policy. The UI
 *   confirms first because removal changes season statistics
 *   immediately.
 */
export type PerformancePlayer = Pick<
  Player,
  "id" | "name" | "jersey_no" | "sport" | "status" | "is_active"
>;

export type PerformanceDraft = Omit<MatchPerformance, "id" | "match_id">;

export interface PerformanceSaveResult {
  error: string | null;
  /** Set when the Step C fields had to be dropped (0044 not live). */
  warning?: string;
}

/** Step C performance columns (0044 draft revision, 2026-11-03). */
const STEP_C_PERF_FIELDS = [
  "appearance",
  "own_goals",
  "penalty_goals",
  "penalty_missed",
  "saves",
  "dismissal_type",
  "dismissed_by_id",
  "batting_order",
  "wides",
  "no_balls",
] as const;

const PRE_0044_PERF_WARNING =
  "মূল Performance সংরক্ষিত হয়েছে, তবে নতুন ঘরগুলো (খেলার ধরন/আত্মঘাতী/আউটের ধরন ইত্যাদি) এখনো Database-এ যোগ হয়নি — Migration 0044 লাইভ হলে এগুলোও সংরক্ষিত হবে।";

function isMissingColumnError(message: string): boolean {
  return /column|schema cache/i.test(message);
}

export function useMatchPerformances(match: Match | null) {
  const [performances, setPerformances] = useState<MatchPerformance[]>([]);
  const [players, setPlayers] = useState<PerformancePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const matchId = match?.id ?? null;
  const sport = match?.sport ?? null;

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !matchId || !sport) {
      setPerformances([]);
      setPlayers([]);
      return;
    }
    setLoading(true);
    const [perfRes, playerRes] = await Promise.all([
      supabase.from("match_performances").select("*").eq("match_id", matchId),
      supabase
        .from("players")
        .select("id, name, jersey_no, sport, status, is_active")
        .eq("sport", sport)
        .is("archived_at", null)
        .order("display_order"),
    ]);
    setLoading(false);
    if (perfRes.error || playerRes.error) {
      setLoadError((perfRes.error ?? playerRes.error)?.message ?? "তথ্য লোড করা যায়নি।");
      return;
    }
    setLoadError(null);
    setPerformances((perfRes.data ?? []) as MatchPerformance[]);
    setPlayers((playerRes.data ?? []) as PerformancePlayer[]);
  }, [matchId, sport]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Create (id = null) or update a performance. The Step C fields
   * ride the same fail-soft rule as the match saves: until the
   * revised migration 0044 is live, a missing-column error retries
   * with only the pre-0044 fields and reports a warning.
   */
  const savePerformance = useCallback(
    async (id: string | null, draft: PerformanceDraft): Promise<PerformanceSaveResult> => {
      if (!supabase || !matchId) return { error: "আগে একটি ম্যাচ বেছে নিন।" };
      // Sport integrity, re-checked at save time.
      const player = players.find((p) => p.id === draft.player_id);
      if (!player) return { error: "প্লেয়ার পাওয়া যায়নি — তালিকা থেকে আবার বেছে নিন।" };
      if (player.sport !== sport) {
        return { error: "এই প্লেয়ার এই ম্যাচের খেলার নন — একই খেলার প্লেয়ার বেছে নিন।" };
      }
      if (
        !id &&
        performances.some((p) => p.player_id === draft.player_id)
      ) {
        return { error: "এই প্লেয়ারের Performance এই ম্যাচে ইতিমধ্যে আছে — নতুন করে না যোগ করে আগেরটি সম্পাদনা করুন।" };
      }
      const payload = { ...draft, match_id: matchId };
      const client = supabase;
      const write = (body: Record<string, unknown>) =>
        id
          ? client.from("match_performances").update(body).eq("id", id)
          : client.from("match_performances").insert(body);
      const { error } = await write(payload);
      if (error) {
        if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
          return { error: "এই প্লেয়ারের Performance এই ম্যাচে ইতিমধ্যে সংরক্ষিত আছে (Duplicate)।" };
        }
        if (!isMissingColumnError(error.message)) return { error: error.message };
        const base: Record<string, unknown> = { ...payload };
        for (const key of STEP_C_PERF_FIELDS) delete base[key];
        const retry = await write(base);
        if (retry.error) return { error: retry.error.message };
        await reload();
        return { error: null, warning: PRE_0044_PERF_WARNING };
      }
      await reload();
      return { error: null };
    },
    [matchId, players, performances, reload, sport],
  );

  /** Remove a performance (DELETE policy requires is_admin — migration 0006). Returns an error or null. */
  const removePerformance = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase.from("match_performances").delete().eq("id", id);
      if (error) return error.message;
      await reload();
      return null;
    },
    [reload],
  );

  return {
    performances,
    players,
    loading,
    loadError,
    reload,
    savePerformance,
    removePerformance,
  };
}
