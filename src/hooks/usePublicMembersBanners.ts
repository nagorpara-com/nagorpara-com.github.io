import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Public banner photos for the Members & Committee page
 * (migration 0032, owner's order 2026-10-29): the PUBLISHED rows
 * of `members_page_banners`, in display order — the page rotates
 * them as a slider. Fully tolerant: until the migration is
 * applied (or when no banner is published) this returns an empty
 * list and the page falls back to the Settings banner photo /
 * the built-in default, exactly as before.
 */
export function usePublicMembersBanners(): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data, error } = await supabase
        .from("members_page_banners")
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
