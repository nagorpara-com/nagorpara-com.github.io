import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Village Page settings (Phase VG-2D, 2026-10-25) — the two
 * site_settings columns migration 0023 added:
 *   village_gallery_album_id — which gallery album the Village
 *     Page's gallery preview shows (null = all published items);
 *   village_banner_url — the Village Page banner photo
 *     (null = the gradient-only banner).
 *
 * Reads and writes ONLY these two columns on the single
 * settings row (id = 1); the Header & Footer settings form and
 * its whole-row save are untouched. Every save is verified by
 * reading the row back and comparing both fields — a write
 * that does not come back identical is reported as a failure
 * (the project's write-verification discipline).
 */
export interface VillagePageSettingsValue {
  villageGalleryAlbumId: string | null;
  villageBannerUrl: string | null;
}

export interface VillageAlbumOption {
  id: string;
  title: string;
  isPublished: boolean;
}

const COLUMNS = "village_gallery_album_id, village_banner_url";

function toValue(row: Record<string, unknown>): VillagePageSettingsValue {
  return {
    villageGalleryAlbumId:
      typeof row.village_gallery_album_id === "string"
        ? row.village_gallery_album_id
        : null,
    villageBannerUrl:
      typeof row.village_banner_url === "string"
        ? row.village_banner_url
        : null,
  };
}

export function useVillagePageSettings() {
  const [value, setValue] = useState<VillagePageSettingsValue>({
    villageGalleryAlbumId: null,
    villageBannerUrl: null,
  });
  const [albums, setAlbums] = useState<VillageAlbumOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [settingsRes, albumsRes] = await Promise.all([
      supabase.from("site_settings").select(COLUMNS).eq("id", 1).single(),
      supabase
        .from("gallery_albums")
        .select("id, title, is_published")
        .order("created_at"),
    ]);
    setLoading(false);
    if (settingsRes.error || !settingsRes.data) {
      setLoadError("Village Page Settings পড়া যায়নি — আবার চেষ্টা করুন।");
      return;
    }
    setLoadError(null);
    setValue(toValue(settingsRes.data as Record<string, unknown>));
    if (!albumsRes.error) {
      setAlbums(
        ((albumsRes.data ?? []) as Record<string, unknown>[]).map((a) => ({
          id: String(a.id),
          title: typeof a.title === "string" ? a.title : "",
          isPublished: a.is_published === true,
        })),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Save both fields and verify by reading them back. */
  const save = useCallback(
    async (next: VillagePageSettingsValue): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false;
      const payload = {
        village_gallery_album_id: next.villageGalleryAlbumId,
        village_banner_url: next.villageBannerUrl,
      };
      const { error } = await supabase
        .from("site_settings")
        .update(payload)
        .eq("id", 1);
      if (error) return false;
      const back = await supabase
        .from("site_settings")
        .select(COLUMNS)
        .eq("id", 1)
        .single();
      if (back.error || !back.data) return false;
      const readBack = toValue(back.data as Record<string, unknown>);
      const matches =
        readBack.villageGalleryAlbumId === next.villageGalleryAlbumId &&
        readBack.villageBannerUrl === next.villageBannerUrl;
      if (matches) setValue(readBack);
      return matches;
    },
    [],
  );

  return { value, albums, loading, loadError, reload: load, save };
}
