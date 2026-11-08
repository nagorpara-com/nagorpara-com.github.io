import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type { VillagePageBanner } from "../types/database.types";

/**
 * Admin data layer for the Village Profile page banners
 * (owner's order, 2026-11-05): a banner manager inside Admin
 * গ্রামের পরিচিতি holding AT MOST THREE banner photos for the
 * public Village Profile page, mirroring the Members &
 * Committee page banners (migration 0032). The public page
 * rotates the published rows as a crossfade slider; rows can be
 * edited, published / unpublished and deleted from the panel.
 *
 * Storage is migration 0057's `village_page_banners` table.
 * Until that migration is applied live, reads report
 * `tableMissing` so the card can show an honest notice instead
 * of a raw error, and writes are refused with the same
 * explanation. The public page meanwhile keeps using the single
 * Settings banner photo (site_settings.village_banner_url).
 *
 * Per-banner TEXT (migration 0058, owner's "Complete Banner &
 * Media Enhancement" spec): heading / description / CTA text /
 * CTA link / show_text ride on the same row. Until 0058 is live
 * the reads step down to the 0057 column set (the established
 * 42703 ladder, the same pattern as village sections' video
 * column), `textSupported` stays false, no text UI renders in
 * the card and writes simply omit the text fields — everything
 * behaves exactly as in v172.
 *
 * Write discipline (verify_admin_writes skill): a write counts
 * as successful ONLY after the row is read back by id and every
 * submitted field matches; the list is always re-synced from the
 * database afterwards.
 */

export const MAX_VILLAGE_BANNERS = 3;

const BASE_COLUMNS = "id, image_url, display_order, is_published, created_at";
const FULL_COLUMNS =
  "id, image_url, display_order, is_published, created_at, heading, description, cta_text, cta_link, show_text";

const TABLE_MISSING_MSG =
  "ব্যানারের ডেটাবেস টেবিল এখনো তৈরি হয়নি — migration 0057 লাইভে চালানো বাকি। টেবিল তৈরি হলে এখান থেকে ব্যানার যোগ করা যাবে।";
const NOT_SAVED =
  "সংরক্ষণ হয়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই। আবার চেষ্টা করুন।";
const NOT_DELETED =
  "মোছা যায়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই।";

/* The missing-TABLE error (PGRST205) is told apart from the
 * missing-COLUMN error (42703, "column …heading does not
 * exist") by its own phrasing — a bare "does not exist" must
 * NOT match here, or a missing text column would be misread
 * as a missing table. */
const isMissingTable = (message: string) =>
  message.includes("village_page_banners") &&
  (message.includes("not find") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist")));

const isMissingTextColumns = (message: string) =>
  /heading|description|cta_text|cta_link|show_text|42703/.test(message);

/** Text fields treat "", whitespace and NULL as the same: none. */
const normText = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

export interface VillageBannerPayload {
  image_url: string;
  display_order: number;
  is_published: boolean;
  heading: string | null;
  description: string | null;
  cta_text: string | null;
  cta_link: string | null;
  show_text: boolean;
}

/** A row's current text, as a payload fragment (used to carry
 * text through writes that only change other fields). */
export function textOf(row: VillagePageBanner): Pick<
  VillageBannerPayload,
  "heading" | "description" | "cta_text" | "cta_link" | "show_text"
> {
  return {
    heading: normText(row.heading),
    description: normText(row.description),
    cta_text: normText(row.cta_text),
    cta_link: normText(row.cta_link),
    show_text: row.show_text !== false,
  };
}

export function useAdminVillageBanners() {
  const [rows, setRows] = useState<VillagePageBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [textSupported, setTextSupported] = useState(false);
  const columnsRef = useRef(FULL_COLUMNS);

  const fetchWith = useCallback(
    (columns: string) =>
      fetchAllRows((from, to) =>
        supabase!
          .from("village_page_banners")
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
    /* The text-column check comes FIRST: its error also names
     * the table, and only the table error's own phrasing
     * ("not find" / "schema cache") may mark the table missing. */
    if (error && columnsRef.current !== BASE_COLUMNS && isMissingTextColumns(error)) {
      columnsRef.current = BASE_COLUMNS;
      setTextSupported(false);
      ({ data, error } = await fetchWith(BASE_COLUMNS));
    } else if (!error) {
      setTextSupported(columnsRef.current === FULL_COLUMNS);
    }
    setLoading(false);
    if (error) {
      if (isMissingTable(error)) {
        setTableMissing(true);
        setLoadError(null);
        setRows([]);
      } else {
        setLoadError(error);
      }
      return;
    }
    setTableMissing(false);
    setLoadError(null);
    setRows((data ?? []) as VillagePageBanner[]);
  }, [fetchWith]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const readBannerById = useCallback(async (id: string): Promise<VillagePageBanner | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from("village_page_banners").select(columnsRef.current).eq("id", id);
    if (error || !data || data.length === 0) return null;
    return data[0] as unknown as VillagePageBanner;
  }, []);

  /** Full-match check of a read-back row against what was sent. */
  const fieldsMatch = useCallback(
    (row: VillagePageBanner, payload: VillageBannerPayload): boolean => {
      if (
        row.image_url !== payload.image_url ||
        row.display_order !== payload.display_order ||
        row.is_published !== payload.is_published
      ) {
        return false;
      }
      if (columnsRef.current !== FULL_COLUMNS) return true;
      const t = textOf(row);
      return (
        t.heading === normText(payload.heading) &&
        t.description === normText(payload.description) &&
        t.cta_text === normText(payload.cta_text) &&
        t.cta_link === normText(payload.cta_link) &&
        t.show_text === payload.show_text
      );
    },
    [],
  );

  /** The exact column set to write: text fields ride along only
   * once migration 0058's columns exist. */
  const writePayload = useCallback((payload: VillageBannerPayload) => {
    const base = {
      image_url: payload.image_url,
      display_order: payload.display_order,
      is_published: payload.is_published,
    };
    if (columnsRef.current !== FULL_COLUMNS) return base;
    return {
      ...base,
      heading: normText(payload.heading),
      description: normText(payload.description),
      cta_text: normText(payload.cta_text),
      cta_link: normText(payload.cta_link),
      show_text: payload.show_text,
    };
  }, []);

  const createBanner = useCallback(
    async (payload: VillageBannerPayload): Promise<string | null> => {
      if (!supabase) return NOT_SAVED;
      if (tableMissing) return TABLE_MISSING_MSG;
      if (rows.length >= MAX_VILLAGE_BANNERS) {
        return `সর্বোচ্চ ${MAX_VILLAGE_BANNERS}টি ব্যানার রাখা যায় — নতুন যোগ করতে আগে একটি মুছে ফেলুন।`;
      }
      const { data, error } = await supabase
        .from("village_page_banners")
        .insert(writePayload(payload))
        .select(columnsRef.current);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const created = (data ?? [])[0] as unknown as VillagePageBanner | undefined;
      if (!created) return NOT_SAVED;
      const back = await readBannerById(created.id);
      await reload();
      if (!back || !fieldsMatch(back, payload)) return NOT_SAVED;
      return null;
    },
    [reload, rows.length, tableMissing, readBannerById, fieldsMatch, writePayload],
  );

  const updateBanner = useCallback(
    async (id: string, payload: VillageBannerPayload): Promise<string | null> => {
      if (!supabase) return NOT_SAVED;
      if (tableMissing) return TABLE_MISSING_MSG;
      const { error } = await supabase
        .from("village_page_banners")
        .update({ ...writePayload(payload), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const back = await readBannerById(id);
      await reload();
      if (!back || !fieldsMatch(back, payload)) return NOT_SAVED;
      return null;
    },
    [reload, tableMissing, readBannerById, fieldsMatch, writePayload],
  );

  const setPublished = useCallback(
    async (row: VillagePageBanner, published: boolean): Promise<string | null> => {
      return updateBanner(row.id, {
        image_url: row.image_url,
        display_order: row.display_order,
        is_published: published,
        ...textOf(row),
      });
    },
    [updateBanner],
  );

  /** Clear ONLY the four text fields of a banner (the image row
   * and its publish state are never touched). */
  const clearBannerText = useCallback(
    async (row: VillagePageBanner): Promise<string | null> => {
      if (!supabase) return NOT_SAVED;
      if (tableMissing) return TABLE_MISSING_MSG;
      if (columnsRef.current !== FULL_COLUMNS) {
        return "ব্যানারের লেখার ব্যবস্থা এখনো চালু হয়নি — migration 0058 লাইভে চালানো বাকি।";
      }
      const { error } = await supabase
        .from("village_page_banners")
        .update({
          heading: null,
          description: null,
          cta_text: null,
          cta_link: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const back = await readBannerById(row.id);
      await reload();
      if (!back) return NOT_SAVED;
      const t = textOf(back);
      if (t.heading !== null || t.description !== null || t.cta_text !== null || t.cta_link !== null) {
        return NOT_SAVED;
      }
      return null;
    },
    [reload, tableMissing, readBannerById],
  );

  const deleteBanner = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return NOT_DELETED;
      if (tableMissing) return TABLE_MISSING_MSG;
      const { error } = await supabase.from("village_page_banners").delete().eq("id", id);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const back = await readBannerById(id);
      await reload();
      if (back) return NOT_DELETED;
      return null;
    },
    [reload, tableMissing, readBannerById],
  );

  return {
    isConfigured: isSupabaseConfigured,
    rows,
    loading,
    loadError,
    tableMissing,
    textSupported,
    reload,
    createBanner,
    updateBanner,
    setPublished,
    clearBannerText,
    deleteBanner,
  };
}
