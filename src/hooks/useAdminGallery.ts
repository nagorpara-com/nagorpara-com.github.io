import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import { galleryItemPayload, type GalleryItemInput } from "../utils/galleryItem";

/**
 * Admin data layer for the Gallery (Phase 3, 2026-10-24).
 *
 * Uses the EXISTING tables from migration 0001 — `gallery_albums`
 * and `gallery_items` — no new schema. RLS already lets content
 * editors read/write all rows ("albums/items: editors write",
 * can_edit_content()); the public reads published rows only.
 *
 * Write discipline (verify_admin_writes skill), same as the Village
 * module: every create/update/delete is confirmed by reading the
 * row back by id and comparing the submitted fields. A zero-row
 * write is a failure, never a success.
 *
 * Deleting a row does NOT delete its file from Storage — that is
 * the project's standing convention (PhotoUploadField), disclosed
 * in the admin UI. Deleting an ALBUM cascades to its items at the
 * database level (schema FK), also disclosed before confirming.
 */

export interface GalleryAlbumRow {
  id: string;
  title: string;
  cover_image_url: string | null;
  is_published: boolean;
  created_at: string;
}

export interface GalleryItemRow {
  id: string;
  album_id: string | null;
  type: string;
  file_url: string | null;
  youtube_url: string | null;
  caption: string | null;
  display_order: number;
  is_published: boolean;
  created_at: string;
}

const ALBUM_COLUMNS = "id, title, cover_image_url, is_published, created_at";
const ITEM_COLUMNS = "id, album_id, type, file_url, youtube_url, caption, display_order, is_published, created_at";
const NOT_SAVED =
  "সংরক্ষণ হয়নি: কোনো তথ্য পরিবর্তিত হয়নি — আপনার Role-এর এই কাজের অনুমতি নাও থাকতে পারে (RLS), অথবা তথ্যটি আর নেই।";

function fieldsMatch(row: object, payload: Record<string, unknown>): boolean {
  const rec = row as Record<string, unknown>;
  return Object.entries(payload).every(([key, value]) => rec[key] === value);
}

export function useAdminGallery() {
  const [albums, setAlbums] = useState<GalleryAlbumRow[]>([]);
  const [items, setItems] = useState<GalleryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [albumRes, itemRes] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase!.from("gallery_albums").select(ALBUM_COLUMNS).order("created_at").range(from, to),
      ),
      fetchAllRows((from, to) =>
        supabase!
          .from("gallery_items")
          .select(ITEM_COLUMNS)
          .order("display_order")
          .order("created_at")
          .range(from, to),
      ),
    ]);
    setLoading(false);
    if (albumRes.error || itemRes.error) {
      setLoadError(albumRes.error ?? itemRes.error);
      return;
    }
    setLoadError(null);
    setAlbums((albumRes.data ?? []) as GalleryAlbumRow[]);
    setItems((itemRes.data ?? []) as GalleryItemRow[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const readBack = useCallback(
    async (table: "gallery_albums" | "gallery_items", id: string) => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from(table)
        .select(table === "gallery_albums" ? ALBUM_COLUMNS : ITEM_COLUMNS)
        .eq("id", id)
        .single();
      if (error || !data) return null;
      return data as unknown as Record<string, unknown>;
    },
    [],
  );

  /** Shared verified write: insert or update one row, then read back. */
  const writeRow = useCallback(
    async (
      table: "gallery_albums" | "gallery_items",
      payload: Record<string, unknown>,
      id: string | null,
    ): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      let rowId = id;
      if (id) {
        const { data, error } = await supabase.from(table).update(payload).eq("id", id).select("id");
        if (error) return error.message;
        if (!data || data.length === 0) {
          await reload();
          return NOT_SAVED;
        }
      } else {
        const { data, error } = await supabase.from(table).insert(payload).select("id");
        if (error) return error.message;
        rowId = (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
        if (!rowId) return NOT_SAVED;
      }
      if (!rowId) return NOT_SAVED;
      const saved = await readBack(table, rowId);
      if (!saved || !fieldsMatch(saved, payload)) {
        await reload();
        return "সংরক্ষণের যাচাই মেলেনি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      await reload();
      return null;
    },
    [readBack, reload],
  );

  const deleteRow = useCallback(
    async (table: "gallery_albums" | "gallery_items", id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        await reload();
        return NOT_SAVED;
      }
      const stillThere = await readBack(table, id);
      if (stillThere) {
        await reload();
        return "মুছে ফেলার যাচাই মেলেনি — তথ্যটি এখনো আছে।";
      }
      await reload();
      return null;
    },
    [readBack, reload],
  );

  // ---- Albums ----
  const createAlbum = useCallback(
    (title: string, isPublished: boolean) =>
      writeRow("gallery_albums", { title: title.trim(), cover_image_url: null, is_published: isPublished }, null),
    [writeRow],
  );
  const setAlbumPublished = useCallback(
    (id: string, isPublished: boolean) =>
      writeRow("gallery_albums", { is_published: isPublished }, id),
    [writeRow],
  );
  const deleteAlbum = useCallback((id: string) => deleteRow("gallery_albums", id), [deleteRow]);

  // ---- Items ----
  const createItem = useCallback(
    (input: GalleryItemInput) => writeRow("gallery_items", galleryItemPayload(input), null),
    [writeRow],
  );
  const editItem = useCallback(
    (id: string, input: GalleryItemInput) => writeRow("gallery_items", galleryItemPayload(input), id),
    [writeRow],
  );
  const setItemPublished = useCallback(
    (id: string, isPublished: boolean) => writeRow("gallery_items", { is_published: isPublished }, id),
    [writeRow],
  );
  const deleteItem = useCallback((id: string) => deleteRow("gallery_items", id), [deleteRow]);

  const moveItem = useCallback(
    async (id: string, direction: "up" | "down"): Promise<string | null> => {
      const index = items.findIndex((r) => r.id === id);
      const neighbourIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || neighbourIndex < 0 || neighbourIndex >= items.length) return null;
      const current = items[index];
      const neighbour = items[neighbourIndex];
      if (current.display_order === neighbour.display_order) {
        return writeRow(
          "gallery_items",
          { display_order: direction === "up" ? current.display_order - 1 : current.display_order + 1 },
          id,
        );
      }
      const first = await writeRow("gallery_items", { display_order: neighbour.display_order }, current.id);
      if (first) return first;
      const second = await writeRow("gallery_items", { display_order: current.display_order }, neighbour.id);
      if (second) {
        await writeRow("gallery_items", { display_order: current.display_order }, current.id);
        await reload();
        return "ক্রম বদলানো যায়নি — আগের ক্রম ফিরিয়ে দেওয়া হয়েছে।";
      }
      return null;
    },
    [items, writeRow, reload],
  );

  return {
    isConfigured: isSupabaseConfigured,
    albums,
    items,
    loading,
    loadError,
    reload,
    createAlbum,
    setAlbumPublished,
    deleteAlbum,
    createItem,
    editItem,
    setItemPublished,
    deleteItem,
    moveItem,
  };
}
