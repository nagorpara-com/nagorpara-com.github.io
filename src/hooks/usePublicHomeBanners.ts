import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Public banner photos for the homepage hero (migration 0033,
 * owner's order 2026-10-29): the PUBLISHED rows of
 * `home_page_banners`, in display order — the hero rotates them
 * as a slider behind the headline. Fully tolerant: until the
 * migration is applied (or when no banner is published) this
 * returns an empty list and the hero falls back to the single
 * Hero background photo (home_sections config) / plain brand
 * green, exactly as before.
 */
export function usePublicHomeBanners(): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data, error } = await supabase
        .from("home_page_banners")
        .select("image_url")
        .eq("is_published", true)
        .order("display_order")
        .order("created_at")
        .limit(3);
      if (cancelled || error || !data) return;
      setUrls(
        data
          .map((r) => (r as { image_url: string }).image_url)
          .filter((u) => typeof u === "string" && u.length > 0),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return urls;
}
