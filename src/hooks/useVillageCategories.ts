import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type { VillageCategory } from "../types/database.types";

/**
 * Village Profile categories (migration 0054).
 *
 * The categories of the public Village Profile page — chip
 * label, section heading, block kind, order, published flag —
 * live in `village_categories` and are managed from Admin
 * ক্যাটাগরি পরিচালনা. The table exists only after migration
 * 0054 is applied live; until then (or if it is ever empty)
 * every consumer falls back to FALLBACK_VILLAGE_CATEGORIES —
 * the eight built-in categories exactly as the page rendered
 * them before — so nothing changes for visitors or admins.
 */

const COLUMNS = "id, key, label, title, kind, display_order, is_published, created_at";

/** The eight built-in categories, in page order, with the chip
 * labels and section headings the page has always shown. Used
 * whenever the database categories are unavailable. */
export const FALLBACK_VILLAGE_CATEGORIES: VillageCategory[] = [
  { id: "porichiti", key: "porichiti", label: "গ্রামের পরিচিতি", title: "গ্রামের পরিচিতি", kind: "text", display_order: 1, is_published: true, created_at: "" },
  { id: "obosthan", key: "obosthan", label: "অবস্থান ও ঠিকানা", title: "অবস্থান ও ঠিকানা", kind: "location", display_order: 2, is_published: true, created_at: "" },
  { id: "itihash", key: "itihash", label: "ইতিহাস", title: "গ্রামের ইতিহাস", kind: "text", display_order: 3, is_published: true, created_at: "" },
  { id: "sthan", key: "sthan", label: "গুরুত্বপূর্ণ স্থান", title: "গুরুত্বপূর্ণ স্থান ও স্থাপনা", kind: "places", display_order: 4, is_published: true, created_at: "" },
  { id: "chobi", key: "chobi", label: "গ্রামের ছবি", title: "গ্রামের ছবি", kind: "photos", display_order: 5, is_published: true, created_at: "" },
  { id: "prokriti", key: "prokriti", label: "প্রকৃতি ও পরিবেশ", title: "প্রকৃতি ও পরিবেশ", kind: "text", display_order: 6, is_published: true, created_at: "" },
  { id: "karjokrom", key: "karjokrom", label: "কার্যক্রম", title: "সামাজিক, সাংস্কৃতিক ও ক্রীড়া কার্যক্রম", kind: "text", display_order: 7, is_published: true, created_at: "" },
  { id: "songothon", key: "songothon", label: "সংগঠন পরিচিতি", title: "নগর পাড়া অগ্রগামী যুব সংঘ — পরিচিতি ও উদ্দেশ্য", kind: "text", display_order: 8, is_published: true, created_at: "" },
];

/** True when a PostgREST/Postgres error means the
 * village_categories table itself does not exist yet
 * (migration 0054 not applied). */
export function isVillageCategoriesMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "PGRST205" || e.code === "42P01") return true;
  const msg = e.message ?? "";
  return (
    msg.includes("village_categories") &&
    (/does not exist/i.test(msg) || /could not find/i.test(msg) || /schema cache/i.test(msg))
  );
}

/**
 * Public categories: published rows ordered for the page.
 * Returns null while loading, when Supabase is not connected,
 * on ANY error, or when the table is empty — the page then
 * renders FALLBACK_VILLAGE_CATEGORIES unchanged.
 */
export function useVillageCategories(): VillageCategory[] | null {
  const [rows, setRows] = useState<VillageCategory[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("village_categories")
        .select(COLUMNS)
        .eq("is_published", true)
        .order("display_order")
        .order("created_at");
      if (cancelled || error || !data || data.length === 0) return;
      setRows(data as unknown as VillageCategory[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return rows;
}

export interface VillageCategoryInput {
  key: string;
  label: string;
  title: string;
  displayOrder: number;
  isPublished: boolean;
}

const NOT_SAVED =
  "সংরক্ষণ হয়নি: কোনো তথ্য পরিবর্তিত হয়নি — আপনার Role-এর এই কাজের অনুমতি নাও থাকতে পারে (RLS), অথবা তথ্যটি আর নেই।";

type CategoryPatch = Partial<{
  label: string;
  title: string;
  display_order: number;
  is_published: boolean;
}>;

function fieldsMatch(row: VillageCategory, patch: Record<string, unknown>): boolean {
  return Object.entries(patch).every(
    ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
  );
}

/**
 * Admin data layer for village categories. Write discipline
 * matches useAdminVillageSections: a write counts as successful
 * ONLY after the row is read back by id and every submitted
 * field matches; a delete counts only after the row reads back
 * as gone. While migration 0054 is not live, `migrationPending`
 * turns true and the Admin page shows an honest notice.
 */
export function useAdminVillageCategories() {
  const [rows, setRows] = useState<VillageCategory[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await fetchAllRows((from, to) =>
        supabase!
          .from("village_categories")
          .select(COLUMNS)
          .order("display_order")
          .order("created_at")
          .range(from, to),
      );
      if (cancelled) return;
      setLoading(false);
      if (error) {
        if (isVillageCategoriesMissing({ message: error })) {
          setMigrationPending(true);
          setLoadError(null);
          setRows([]);
          return;
        }
        setLoadError(error);
        return;
      }
      setMigrationPending(false);
      setLoadError(null);
      setRows((data ?? []) as unknown as VillageCategory[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  /** Re-sync the local list from a verified read-back row. */
  const upsertLocal = useCallback((row: VillageCategory) => {
    setRows((prev) =>
      [...prev.filter((r) => r.id !== row.id), row].sort(
        (a, b) =>
          a.display_order - b.display_order || a.created_at.localeCompare(b.created_at),
      ),
    );
  }, []);

  const removeLocal = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  /** Read one row back by id (the verification step). */
  const readBack = useCallback(async (id: string): Promise<VillageCategory | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("village_categories")
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return data as unknown as VillageCategory;
  }, []);

  const createCategory = useCallback(
    async (input: VillageCategoryInput): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const payload = {
        key: input.key.trim(),
        label: input.label.trim(),
        title: input.title.trim(),
        kind: "text" as const,
        display_order: input.displayOrder,
        is_published: input.isPublished,
      };
      const { data, error } = await supabase
        .from("village_categories")
        .insert(payload)
        .select("id");
      if (error) return error.message;
      const id = (data as Array<{ id: string }> | null)?.[0]?.id;
      if (!id) return NOT_SAVED;
      const saved = await readBack(id);
      if (!saved || !fieldsMatch(saved, payload)) {
        reload();
        return "তৈরি হয়েছে কিনা যাচাই করা যায়নি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      upsertLocal(saved);
      return null;
    },
    [readBack, reload, upsertLocal],
  );

  const updateCategory = useCallback(
    async (id: string, patch: CategoryPatch): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase
        .from("village_categories")
        .update(patch)
        .eq("id", id)
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        reload();
        return NOT_SAVED;
      }
      const saved = await readBack(id);
      if (!saved || !fieldsMatch(saved, patch as Record<string, unknown>)) {
        reload();
        return "সংরক্ষণের যাচাই মেলেনি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      upsertLocal(saved);
      return null;
    },
    [readBack, reload, upsertLocal],
  );

  const editCategory = useCallback(
    (id: string, input: VillageCategoryInput) =>
      updateCategory(id, {
        label: input.label.trim(),
        title: input.title.trim(),
        display_order: input.displayOrder,
        is_published: input.isPublished,
      }),
    [updateCategory],
  );

  const setCategoryPublished = useCallback(
    (id: string, isPublished: boolean) => updateCategory(id, { is_published: isPublished }),
    [updateCategory],
  );

  const deleteCategory = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase
        .from("village_categories")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        reload();
        return NOT_SAVED;
      }
      const stillThere = await readBack(id);
      if (stillThere) {
        reload();
        return "মুছে ফেলার যাচাই মেলেনি — তথ্যটি এখনো আছে।";
      }
      removeLocal(id);
      return null;
    },
    [readBack, reload, removeLocal],
  );

  return {
    isConfigured: isSupabaseConfigured,
    rows,
    loading,
    loadError,
    migrationPending,
    reload,
    createCategory,
    editCategory,
    setCategoryPublished,
    deleteCategory,
  };
}
