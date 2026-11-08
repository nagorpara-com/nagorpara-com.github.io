import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type { HomePageBanner } from "../types/database.types";

/**
 * Admin data layer for the Homepage banners
 * (owner's order, 2026-10-29): a "ব্যানার" table inside
 * Admin ওয়েবসাইট কনটেন্ট হোমপেজ ব্যানার holding the
 * banner photos for the public homepage hero. There is NO
 * count cap (owner's correction, 2026-10-29: with 3 banners
 * saved, the add form vanished behind a cap message and he
 * ordered the add option to stay available), so banners can
 * be added from the panel at any time. The
 * homepage rotates the published rows as a slider behind the
 * hero headline; rows can be edited, published / unpublished
 * and deleted from the panel.
 *
 * Storage is migration 0033's `home_page_banners` table. Until
 * that migration is applied live, reads report `tableMissing` so
 * the page can show an honest notice instead of a raw error, and
 * writes are refused with the same explanation.
 *
 * Write discipline (verify_admin_writes skill): a write counts
 * as successful ONLY after the row is read back by id and every
 * submitted field matches; the list is always re-synced from the
 * database afterwards.
 */

const COLUMNS = "id, image_url, display_order, is_published, created_at";

const TABLE_MISSING_MSG =
  "ব্যানারের ডেটাবেস টেবিল এখনো তৈরি হয়নি — migration 0033 লাইভে চালানো বাকি। টেবিল তৈরি হলে এখান থেকে ব্যানার যোগ করা যাবে।";
const NOT_SAVED =
  "সংরক্ষণ হয়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই। আবার চেষ্টা করুন।";
const NOT_DELETED =
  "মোছা যায়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই।";

const isMissingTable = (message: string) =>
  message.includes("home_page_banners") &&
  (message.includes("does not exist") || message.includes("not find") || message.includes("schema cache"));

export interface HomeBannerPayload {
  image_url: string;
  display_order: number;
  is_published: boolean;
}

function fieldsMatch(row: HomePageBanner, payload: HomeBannerPayload): boolean {
  return (
    row.image_url === payload.image_url &&
    row.display_order === payload.display_order &&
    row.is_published === payload.is_published
  );
}

async function readBannerById(id: string): Promise<HomePageBanner | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("home_page_banners").select(COLUMNS).eq("id", id);
  if (error || !data || data.length === 0) return null;
  return data[0] as HomePageBanner;
}

export function useAdminHomeBanners() {
  const [rows, setRows] = useState<HomePageBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await fetchAllRows((from, to) =>
      supabase!
        .from("home_page_banners")
        .select(COLUMNS)
        .order("display_order")
        .order("created_at")
        .range(from, to),
    );
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
    setRows((data ?? []) as HomePageBanner[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createBanner = useCallback(
    async (payload: HomeBannerPayload): Promise<string | null> => {
      if (!supabase) return NOT_SAVED;
      if (tableMissing) return TABLE_MISSING_MSG;
      const { data, error } = await supabase
        .from("home_page_banners")
        .insert(payload)
        .select(COLUMNS);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const created = (data ?? [])[0] as HomePageBanner | undefined;
      if (!created) return NOT_SAVED;
      const back = await readBannerById(created.id);
      await reload();
      if (!back || !fieldsMatch(back, payload)) return NOT_SAVED;
      return null;
    },
    [reload, rows.length, tableMissing],
  );

  const updateBanner = useCallback(
    async (id: string, payload: HomeBannerPayload): Promise<string | null> => {
      if (!supabase) return NOT_SAVED;
      if (tableMissing) return TABLE_MISSING_MSG;
      const { error } = await supabase
        .from("home_page_banners")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const back = await readBannerById(id);
      await reload();
      if (!back || !fieldsMatch(back, payload)) return NOT_SAVED;
      return null;
    },
    [reload, tableMissing],
  );

  const setPublished = useCallback(
    async (row: HomePageBanner, published: boolean): Promise<string | null> => {
      return updateBanner(row.id, {
        image_url: row.image_url,
        display_order: row.display_order,
        is_published: published,
      });
    },
    [updateBanner],
  );

  const deleteBanner = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return NOT_DELETED;
      if (tableMissing) return TABLE_MISSING_MSG;
      const { error } = await supabase.from("home_page_banners").delete().eq("id", id);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const back = await readBannerById(id);
      await reload();
      if (back) return NOT_DELETED;
      return null;
    },
    [reload, tableMissing],
  );

  return {
    isConfigured: isSupabaseConfigured,
    rows,
    loading,
    loadError,
    tableMissing,
    reload,
    createBanner,
    updateBanner,
    setPublished,
    deleteBanner,
  };
}
