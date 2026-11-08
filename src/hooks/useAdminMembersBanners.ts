import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type { MembersPageBanner } from "../types/database.types";

/**
 * Admin data layer for the Members & Committee page banners
 * (owner's order, 2026-10-29): a "ব্যানার" table inside
 * Admin সদস্য ও কমিটি holding AT MOST THREE banner photos for
 * the public page. The public page rotates the published rows
 * as a slider; rows can be edited, published / unpublished and
 * deleted from the panel.
 *
 * Storage is migration 0032's `members_page_banners` table. Until
 * that migration is applied live, reads report `tableMissing` so
 * the page can show an honest notice instead of a raw error, and
 * writes are refused with the same explanation.
 *
 * Write discipline (verify_admin_writes skill): a write counts
 * as successful ONLY after the row is read back by id and every
 * submitted field matches; the list is always re-synced from the
 * database afterwards.
 */

export const MAX_MEMBERS_BANNERS = 3;

const COLUMNS = "id, image_url, display_order, is_published, created_at";

const TABLE_MISSING_MSG =
  "ব্যানারের ডেটাবেস টেবিল এখনো তৈরি হয়নি — migration 0032 লাইভে চালানো বাকি। টেবিল তৈরি হলে এখান থেকে ব্যানার যোগ করা যাবে।";
const NOT_SAVED =
  "সংরক্ষণ হয়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই। আবার চেষ্টা করুন।";
const NOT_DELETED =
  "মোছা যায়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই।";

const isMissingTable = (message: string) =>
  message.includes("members_page_banners") &&
  (message.includes("does not exist") || message.includes("not find") || message.includes("schema cache"));

export interface MembersBannerPayload {
  image_url: string;
  display_order: number;
  is_published: boolean;
}

function fieldsMatch(row: MembersPageBanner, payload: MembersBannerPayload): boolean {
  return (
    row.image_url === payload.image_url &&
    row.display_order === payload.display_order &&
    row.is_published === payload.is_published
  );
}

async function readBannerById(id: string): Promise<MembersPageBanner | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("members_page_banners").select(COLUMNS).eq("id", id);
  if (error || !data || data.length === 0) return null;
  return data[0] as MembersPageBanner;
}

export function useAdminMembersBanners() {
  const [rows, setRows] = useState<MembersPageBanner[]>([]);
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
        .from("members_page_banners")
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
    setRows((data ?? []) as MembersPageBanner[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createBanner = useCallback(
    async (payload: MembersBannerPayload): Promise<string | null> => {
      if (!supabase) return NOT_SAVED;
      if (tableMissing) return TABLE_MISSING_MSG;
      if (rows.length >= MAX_MEMBERS_BANNERS) {
        return `সর্বোচ্চ ${MAX_MEMBERS_BANNERS}টি ব্যানার রাখা যায় — নতুন যোগ করতে আগে একটি মুছে ফেলুন।`;
      }
      const { data, error } = await supabase
        .from("members_page_banners")
        .insert(payload)
        .select(COLUMNS);
      if (error) return isMissingTable(error.message) ? TABLE_MISSING_MSG : error.message;
      const created = (data ?? [])[0] as MembersPageBanner | undefined;
      if (!created) return NOT_SAVED;
      const back = await readBannerById(created.id);
      await reload();
      if (!back || !fieldsMatch(back, payload)) return NOT_SAVED;
      return null;
    },
    [reload, rows.length, tableMissing],
  );

  const updateBanner = useCallback(
    async (id: string, payload: MembersBannerPayload): Promise<string | null> => {
      if (!supabase) return NOT_SAVED;
      if (tableMissing) return TABLE_MISSING_MSG;
      const { error } = await supabase
        .from("members_page_banners")
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
    async (row: MembersPageBanner, published: boolean): Promise<string | null> => {
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
      const { error } = await supabase.from("members_page_banners").delete().eq("id", id);
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
