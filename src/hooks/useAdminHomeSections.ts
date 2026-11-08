import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import {
  baselineAfterSave,
  diffSections,
  heroConfigPatch,
  heroEditOf,
  isDirty,
  moveRow,
  saveFailureMessage,
  sortedRows,
  type HeroEdit,
  type HomeSectionRow,
  type SaveOutcome,
} from "../utils/homeSectionsAdmin";

/**
 * Homepage Management data (R-12.1) — explicit-save editing of
 * the `home_sections` table, the SAME single source the
 * Settings page's display switches write (instant-save there)
 * and the public homepage reads. Two editing surfaces, one
 * table, no duplicated storage. Writes are enforced by the
 * database policy ("home_sections: admin writes", is_admin());
 * this hook adds no authority of its own.
 */
export function useAdminHomeSections() {
  const [baseline, setBaseline] = useState<HomeSectionRow[]>([]);
  const [rows, setRows] = useState<HomeSectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase সংযোগ সেট করা হয়নি — Section লোড করা যাচ্ছে না।");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("home_sections")
      .select("key, title, is_enabled, display_order, config")
      .order("display_order");
    if (id !== requestId.current) return;
    if (queryError) {
      setError(queryError.message);
      setBaseline([]);
      setRows([]);
    } else {
      // Owner decision 2026-10-27: the Gallery section is retired;
      // its home_sections row is hidden here and never written back,
      // so the database row itself stays untouched.
      const loaded = sortedRows(((data ?? []) as HomeSectionRow[]).filter((r) => r.key !== "gallery"));
      setBaseline(loaded);
      setRows(loaded);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setTitle = useCallback((key: string, title: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, title } : r)));
    setSavedAt(null);
  }, []);

  const toggleEnabled = useCallback((key: string, enabled: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, is_enabled: enabled } : r)),
    );
    setSavedAt(null);
  }, []);

  const move = useCallback((key: string, direction: -1 | 1) => {
    setRows((prev) => moveRow(prev, key, direction));
    setSavedAt(null);
  }, []);

  const setHero = useCallback((hero: HeroEdit) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === "hero" ? { ...r, config: heroConfigPatch(hero) } : r,
      ),
    );
    setSavedAt(null);
  }, []);

  /**
   * Write the diffed patches, VERIFYING each one (P1 fix):
   * every UPDATE asks for its row back via .select("key") —
   * an empty result means nothing was written (under RLS a
   * non-admin's UPDATE silently matches 0 rows and returns no
   * error), so it is reported as a failure, never as success.
   * All patches are attempted; the baseline absorbs ONLY the
   * verified writes, so a retry re-sends exactly what is still
   * unsaved. Returns an error message, or null only when every
   * patch is verified saved.
   */
  const save = useCallback(async (): Promise<string | null> => {
    if (!supabase) return "Supabase সংযুক্ত নয়।";
    const patches = diffSections(baseline, rows);
    if (patches.length === 0) return null;
    setSaving(true);
    const outcomes: SaveOutcome[] = [];
    for (const { key, patch } of patches) {
      const { data, error: updateError } = await supabase
        .from("home_sections")
        .update(patch)
        .eq("key", key)
        .select("key");
      if (updateError) {
        outcomes.push({ key, ok: false, error: updateError.message });
      } else if (!data || data.length === 0) {
        outcomes.push({ key, ok: false, noRow: true });
      } else {
        outcomes.push({ key, ok: true });
      }
    }
    setSaving(false);
    const failure = saveFailureMessage(outcomes);
    if (failure) {
      setBaseline((prev) => baselineAfterSave(prev, rows, outcomes));
      return failure;
    }
    setBaseline(rows);
    setSavedAt(new Date().toISOString());
    return null;
  }, [baseline, rows]);

  const discard = useCallback(() => {
    setRows(baseline);
    setSavedAt(null);
  }, [baseline]);

  return {
    rows,
    hero: heroEditOf(rows.find((r) => r.key === "hero")),
    loading,
    error,
    saving,
    savedAt,
    dirty: isDirty(baseline, rows),
    isConfigured: isSupabaseConfigured,
    reload,
    setTitle,
    toggleEnabled,
    move,
    setHero,
    save,
    discard,
  };
}
