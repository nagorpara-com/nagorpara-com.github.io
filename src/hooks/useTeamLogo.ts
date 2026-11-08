import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

export type TeamLogoState = "loading" | "ready" | "unsupported" | "error";

export type TeamLogoColumn = "football_team_logo_url" | "cricket_team_logo_url";

/**
 * Team logo read/write for ONE site_settings logo column — the
 * generic form of useFootballTeamLogo (kept untouched for
 * football). Deliberately a SEPARATE narrow path: the main
 * settings queries never name the logo column, so until the
 * column's migration is applied live everything else keeps
 * working and this hook simply reports "unsupported"
 * (PostgREST 42703). Saves follow the project's
 * write-verification rule: after the UPDATE, the row is read
 * back by primary key and the stored value compared.
 */
export function useTeamLogo(column: TeamLogoColumn) {
  const [state, setState] = useState<TeamLogoState>("loading");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setState("error");
      setError("Supabase সংযুক্ত নয়।");
      return;
    }
    const { data, error: err } = await supabase
      .from("site_settings")
      .select(column)
      .eq("id", 1)
      .single();
    if (err) {
      if (err.code === "42703") {
        setState("unsupported");
      } else {
        setState("error");
        setError(err.message);
      }
      return;
    }
    const row = data as unknown as Record<string, string | null>;
    setLogoUrl(row[column] ?? null);
    setState("ready");
  }, [column]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (next: string | null) => {
      if (!supabase || state !== "ready") return;
      setBusy(true);
      setError(null);
      setSavedNote(null);
      const { error: upErr } = await supabase
        .from("site_settings")
        .update({ [column]: next })
        .eq("id", 1);
      if (upErr) {
        setBusy(false);
        setError(upErr.message);
        return;
      }
      // Read-back verification (verify_admin_writes rule).
      const { data, error: readErr } = await supabase
        .from("site_settings")
        .select(column)
        .eq("id", 1)
        .single();
      setBusy(false);
      if (readErr || !data) {
        setError("সংরক্ষণের পর যাচাই করা যায়নি — আবার চেষ্টা করুন।");
        return;
      }
      const stored = (data as unknown as Record<string, string | null>)[column] ?? null;
      if (stored !== next) {
        setError("সংরক্ষিত মান মিলছে না — আবার চেষ্টা করুন।");
        return;
      }
      setLogoUrl(stored);
      setSavedNote("সংরক্ষিত হয়েছে — Database-এ যাচাই করা হয়েছে।");
    },
    [column, state],
  );

  return { state, logoUrl, busy, error, savedNote, save, reload: load };
}
