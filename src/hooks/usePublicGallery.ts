import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { GalleryAlbumRow, GalleryItemRow } from "./useAdminGallery";

/**
 * Public Gallery data (Phase 3, 2026-10-24).
 *
 * Reads ONLY published rows — the RLS policies already restrict the
 * public to published albums/items. One extra care is taken here:
 * an item whose album is UNPUBLISHED is hidden too. The item policy
 * cannot see the album's state, so without this filter a published
 * item inside a draft album would still show; the filter keeps the
 * public promise ("unpublished means invisible") honest at the page
 * level. (The same item may still appear in the Homepage preview,
 * which reads items directly — a known schema-level limitation,
 * recorded in the Phase 3 report.)
 */
export function usePublicGallery() {
  const [albums, setAlbums] = useState<GalleryAlbumRow[]>([]);
  const [items, setItems] = useState<GalleryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase
        .from("gallery_albums")
        .select("id, title, cover_image_url, is_published, created_at")
        .eq("is_published", true)
        .order("created_at"),
      supabase
        .from("gallery_items")
        .select("id, album_id, type, file_url, youtube_url, caption, display_order, is_published, created_at")
        .eq("is_published", true)
        .order("display_order"),
    ]).then(([albumRes, itemRes]) => {
      if (cancelled) return;
      setLoading(false);
      if (albumRes.error || itemRes.error) setError(true);
      const publishedAlbums = (albumRes.data ?? []) as GalleryAlbumRow[];
      const publishedAlbumIds = new Set(publishedAlbums.map((a) => a.id));
      const visibleItems = ((itemRes.data ?? []) as GalleryItemRow[]).filter(
        (item) => item.album_id === null || publishedAlbumIds.has(item.album_id),
      );
      setAlbums(publishedAlbums);
      setItems(visibleItems);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { albums, items, loading, error };
}
