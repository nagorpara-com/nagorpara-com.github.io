import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import {
  villageSectionPayload,
  type VillageArea,
  type VillageSectionInput,
} from "../utils/villageSection";

/**
 * Admin data layer for Village Profile sections (Phase 2, 2026-10-24).
 *
 * Uses the EXISTING `village_sections` table (migration 0001) — no
 * new schema. RLS already allows content editors to read and write
 * every row ("village_sections: editors write", FOR ALL with
 * can_edit_content()); the public reads published rows only.
 *
 * Write discipline (verify_admin_writes skill): a write counts as
 * successful ONLY after the row is read back by id and every
 * submitted field matches. An UPDATE/DELETE that affects zero rows
 * (e.g. RLS filtered it out) is reported as a failure, never as
 * success, and the local list is always re-synced from the database
 * afterwards so the UI never drifts from the stored truth.
 */

export interface VillageSectionAdminRow {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  /** Null until migration 0038 is applied live. */
  video_url: string | null;
  display_order: number;
  is_published: boolean;
  area: VillageArea;
  created_at: string;
}

const BASE_COLUMNS = "id, title, content, image_url, display_order, is_published, area, created_at";
const COLUMNS = "id, title, content, image_url, video_url, display_order, is_published, area, created_at";
const NOT_SAVED =
  "সংরক্ষণ হয়নি: কোনো তথ্য পরিবর্তিত হয়নি — আপনার Role-এর এই কাজের অনুমতি নাও থাকতে পারে (RLS), অথবা তথ্যটি আর নেই।";

type Payload = ReturnType<typeof villageSectionPayload>;

function fieldsMatch(row: VillageSectionAdminRow, payload: Partial<Payload>): boolean {
  return Object.entries(payload).every(
    ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
  );
}

export function useAdminVillageSections() {
  const [rows, setRows] = useState<VillageSectionAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** True while migration 0038 (video_url) is not live yet: the
   * base column set is used and write payloads drop video_url,
   * so every existing village feature keeps working. */
  const [videoPending, setVideoPending] = useState(false);
  const columnsRef = useRef(COLUMNS);

  const fetchWith = useCallback(
    (columns: string) =>
      fetchAllRows((from, to) =>
        supabase!
          .from("village_sections")
          .select(columns)
          .order("display_order")
          .order("created_at")
          .range(from, to),
      ),
    [],
  );

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let { data, error } = await fetchWith(columnsRef.current);
    if (error && columnsRef.current !== BASE_COLUMNS && /video_url|42703/.test(error)) {
      columnsRef.current = BASE_COLUMNS;
      setVideoPending(true);
      ({ data, error } = await fetchWith(BASE_COLUMNS));
    }
    setLoading(false);
    if (error) {
      setLoadError(error);
      return;
    }
    setLoadError(null);
    setRows(
      ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        ...(r as object),
        video_url: (r.video_url as string | null) ?? null,
      })) as VillageSectionAdminRow[],
    );
  }, [fetchWith]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Read one row back by id (the verification step for every write). */
  const readBack = useCallback(async (id: string): Promise<VillageSectionAdminRow | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("village_sections")
      .select(columnsRef.current)
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return { ...(data as object), video_url: (data as { video_url?: string | null }).video_url ?? null } as VillageSectionAdminRow;
  }, []);

  /** Drop video_url from a write payload while 0038 is not live. */
  const stripVideo = useCallback((payload: Payload): Partial<Payload> => {
    if (columnsRef.current !== BASE_COLUMNS) return payload;
    const { video_url: _dropped, ...rest } = payload;
    return rest;
  }, []);

  const createSection = useCallback(
    async (input: VillageSectionInput): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const payload = stripVideo(villageSectionPayload(input));
      const { data, error } = await supabase
        .from("village_sections")
        .insert(payload)
        .select("id");
      if (error) return error.message;
      const id = (data as Array<{ id: string }> | null)?.[0]?.id;
      if (!id) return NOT_SAVED;
      const saved = await readBack(id);
      if (!saved || !fieldsMatch(saved, payload)) {
        await reload();
        return "তৈরি হয়েছে কিনা যাচাই করা যায়নি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      await reload();
      return null;
    },
    [readBack, reload, stripVideo],
  );

  const updateSection = useCallback(
    async (id: string, patch: Partial<Payload>): Promise<string | null> => {
      patch = stripVideo(patch as Payload) as Partial<Payload>;
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase
        .from("village_sections")
        .update(patch)
        .eq("id", id)
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        await reload();
        return NOT_SAVED;
      }
      const saved = await readBack(id);
      if (!saved || !fieldsMatch(saved, patch)) {
        await reload();
        return "সংরক্ষণের যাচাই মেলেনি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      await reload();
      return null;
    },
    [readBack, reload, stripVideo],
  );

  const editSection = useCallback(
    (id: string, input: VillageSectionInput) => updateSection(id, villageSectionPayload(input)),
    [updateSection],
  );

  const setPublished = useCallback(
    (id: string, isPublished: boolean) => updateSection(id, { is_published: isPublished }),
    [updateSection],
  );

  /** Swap display_order with the neighbour in the given direction. */
  const moveSection = useCallback(
    async (id: string, direction: "up" | "down"): Promise<string | null> => {
      const index = rows.findIndex((r) => r.id === id);
      const neighbourIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || neighbourIndex < 0 || neighbourIndex >= rows.length) return null;
      const current = rows[index];
      const neighbour = rows[neighbourIndex];
      if (current.display_order === neighbour.display_order) {
        // Equal orders: nudge the moved row past its neighbour instead.
        return updateSection(id, {
          display_order: direction === "up" ? current.display_order - 1 : current.display_order + 1,
        });
      }
      const first = await updateSection(current.id, { display_order: neighbour.display_order });
      if (first) return first;
      const second = await updateSection(neighbour.id, { display_order: current.display_order });
      if (second) {
        // Best effort: put the first row back so the list is not left swapped halfway.
        await updateSection(current.id, { display_order: current.display_order });
        await reload();
        return "ক্রম বদলানো যায়নি — আগের ক্রম ফিরিয়ে দেওয়া হয়েছে।";
      }
      return null;
    },
    [rows, updateSection, reload],
  );

  const deleteSection = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase
        .from("village_sections")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        await reload();
        return NOT_SAVED;
      }
      const stillThere = await readBack(id);
      if (stillThere) {
        await reload();
        return "মুছে ফেলার যাচাই মেলেনি — তথ্যটি এখনো আছে।";
      }
      await reload();
      return null;
    },
    [readBack, reload],
  );

  return {
    isConfigured: isSupabaseConfigured,
    rows,
    loading,
    loadError,
    videoPending,
    reload,
    createSection,
    editSection,
    setPublished,
    moveSection,
    deleteSection,
  };
}
