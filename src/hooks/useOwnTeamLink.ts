import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Sport } from "../types/database.types";

export type OwnTeamLinkState = "loading" | "ready" | "unsupported" | "error";

const COLUMNS = "football_team_id, cricket_team_id";
const columnFor = (sport: Sport) =>
  sport === "football" ? "football_team_id" : "cricket_team_id";

/**
 * Admin side of the own-team link (migration 0048): WHICH
 * registered team (টিম-নিবন্ধন) is the organization's own team,
 * per sport, stored as `<sport>_team_id` on the single
 * site_settings row.
 *
 * Deliberately a NARROW separate path (the useTeamLogo
 * pattern): the main admin-settings query never names these
 * columns, so until 0048 is applied live everything else
 * keeps working and this hook reports "unsupported"
 * (PostgREST 42703). Saves are VERIFIED (the
 * verify_admin_writes rule): after the UPDATE the column is
 * read back and the stored value compared.
 */
export function useOwnTeamLink() {
  const [state, setState] = useState<OwnTeamLinkState>(() =>
    isSupabaseConfigured ? "loading" : "error",
  );
  const [ids, setIds] = useState<{ football: string | null; cricket: string | null }>({
    football: null,
    cricket: null,
  });
  const [loadError, setLoadError] = useState<string | null>(() =>
    isSupabaseConfigured ? null : "Supabase সংযুক্ত নয়।",
  );
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;
    (async () => {
      const { data, error } = await client
        .from("site_settings")
        .select(COLUMNS)
        .eq("id", 1)
        .single();
      if (cancelled) return;
      if (error) {
        if (error.code === "42703") {
          setState("unsupported");
          return;
        }
        setState("error");
        setLoadError(error.message);
        return;
      }
      const row = data as unknown as {
        football_team_id: string | null;
        cricket_team_id: string | null;
      };
      setIds({
        football: row.football_team_id ?? null,
        cricket: row.cricket_team_id ?? null,
      });
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  const save = useCallback(
    async (sport: Sport, teamId: string | null): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const column = columnFor(sport);
      const { error } = await supabase
        .from("site_settings")
        .update({ [column]: teamId })
        .eq("id", 1);
      if (error) return error.message;
      const { data, error: readErr } = await supabase
        .from("site_settings")
        .select(column)
        .eq("id", 1)
        .single();
      if (readErr || !data) return "সংরক্ষণের পর যাচাই করা যায়নি।";
      const stored =
        (data as unknown as Record<string, string | null>)[column] ?? null;
      if (stored !== teamId) return "সংরক্ষিত তথ্য মিলছে না — আবার চেষ্টা করুন।";
      setIds((prev) => ({ ...prev, [sport]: teamId }));
      return null;
    },
    [],
  );

  return { state, ids, loadError, reload, save };
}
