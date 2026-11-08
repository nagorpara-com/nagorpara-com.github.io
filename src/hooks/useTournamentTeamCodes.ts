import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { TournamentTeam } from "../types/database.types";

/**
 * Tournament Team IDs (owner's FINAL model, 2026-11-05;
 * migration 0056): a team's ID (A1, B2, …) lives on its
 * tournament_teams entry, unique per tournament. This hook is
 * the data layer for the Admin Teams form's tournament + Team
 * ID pickers and for the entry reads behind them.
 *
 * Fail-soft (the established 42703 ladder): the team_code
 * column of tournament_teams is probed once per session; until
 * migration 0056 is live the probe fails, `supported` is false
 * and NO Team ID UI renders anywhere — registration keeps
 * working exactly as before. Writes are verified by reading
 * the entry back (the verify_admin_writes rule).
 */
let entryCodeSupportCache: boolean | null = null;
let entryCodeSupportProbe: Promise<boolean> | null = null;

async function probeEntryCodeSupport(): Promise<boolean> {
  if (entryCodeSupportCache !== null) return entryCodeSupportCache;
  if (!isSupabaseConfigured || !supabase) return false;
  if (!entryCodeSupportProbe) {
    const client = supabase;
    entryCodeSupportProbe = (async () => {
      const { error } = await client.from("tournament_teams").select("team_code").limit(1);
      entryCodeSupportCache = !error;
      return entryCodeSupportCache;
    })();
  }
  return entryCodeSupportProbe;
}

/** A Team ID clash surfaces as a unique-violation (23505) from
 * the partial index of migration 0056 — plain wording instead
 * of the raw database message. */
function codeTakenError(code: string | undefined): string | null {
  return code === "23505"
    ? "এই Team IDটি এই টুর্নামেন্টে অন্য একটি টিম ইতিমধ্যে ব্যবহার করছে — আরেকটি ID বাছুন।"
    : null;
}

export function useTournamentTeamCodes() {
  const [supported, setSupported] = useState<boolean>(entryCodeSupportCache ?? false);

  useEffect(() => {
    let cancelled = false;
    void probeEntryCodeSupport().then((ok) => {
      if (!cancelled) setSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** All entries of one tournament, seed order. Fail-soft: []. */
  const fetchEntries = useCallback(
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

  /** All entries of one team, most recent first. Fail-soft: []. */
  const fetchTeamEntries = useCallback(
    async (teamId: string): Promise<TournamentTeam[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("tournament_teams")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (error || !data) return [];
      return data as TournamentTeam[];
    },
    [],
  );

  /**
   * Set (or clear, with code = null) a team's Team ID on its
   * entry in one tournament. A missing entry is created ONLY
   * when an ID is being assigned — with the next seed after the
   * tournament's current entries; clearing an ID never creates
   * or deletes the row, it only nulls the code. The saved entry
   * is read back and compared before success is reported.
   */
  const saveEntryCode = useCallback(
    async (
      tournamentId: string,
      teamId: string,
      code: string | null,
    ): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      if (!(await probeEntryCodeSupport())) return null;
      const client = supabase;
      const existingRes = await client
        .from("tournament_teams")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("team_id", teamId)
        .maybeSingle();
      if (existingRes.error) return existingRes.error.message;
      const existing = existingRes.data as TournamentTeam | null;

      if (!existing && !code) return null; // nothing to clear

      if (!existing && code) {
        const lastRes = await client
          .from("tournament_teams")
          .select("seed")
          .eq("tournament_id", tournamentId)
          .order("seed", { ascending: false })
          .limit(1);
        if (lastRes.error) return lastRes.error.message;
        const maxSeed =
          (lastRes.data as { seed: number }[] | null)?.[0]?.seed ?? 0;
        const ins = await client.from("tournament_teams").insert({
          tournament_id: tournamentId,
          team_id: teamId,
          seed: maxSeed + 1,
          team_code: code,
        });
        if (ins.error) return codeTakenError(ins.error.code) ?? ins.error.message;
      } else if (existing) {
        const upd = await client
          .from("tournament_teams")
          .update({ team_code: code })
          .eq("id", existing.id);
        if (upd.error) return codeTakenError(upd.error.code) ?? upd.error.message;
      }

      const backRes = await client
        .from("tournament_teams")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("team_id", teamId)
        .maybeSingle();
      if (backRes.error || !backRes.data) return "সংরক্ষণের পর যাচাই করা যায়নি।";
      const back = backRes.data as TournamentTeam;
      if ((back.team_code ?? null) !== code) {
        return "সংরক্ষিত Team ID মিলছে না — আবার চেষ্টা করুন।";
      }
      return null;
    },
    [],
  );

  return { supported, fetchEntries, fetchTeamEntries, saveEntryCode };
}
