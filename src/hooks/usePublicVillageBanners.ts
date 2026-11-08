import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Public banner slides for the Village Profile page
 * (migration 0057, owner's order 2026-11-05): the PUBLISHED rows
 * of `village_page_banners`, in display order — the page rotates
 * them as a crossfade slider, the same model as the Members page
 * banners (migration 0032). Fully tolerant: until the migration
 * is applied (or when no banner is published) this returns an
 * empty list and the page falls back to the single Settings
 * banner photo / the gradient-only banner, exactly as before.
 *
 * Each slide also carries its OWN text (migration 0058, owner's
 * "Complete Banner & Media Enhancement" spec 2026-11-05): a
 * heading, description, optional CTA and a visibility flag,
 * shown over that slide only. Until 0058 is live the read steps
 * down to the 0057 column set (the established 42703 ladder) and
 * every slide simply has no text — the page then shows the
 * static heading block over every slide, exactly as in v172.
 */
export interface VillageBannerSlide {
  url: string;
  heading: string | null;
  description: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  showText: boolean;
}

const FULL_COLUMNS = "image_url, heading, description, cta_text, cta_link, show_text";
const BASE_COLUMNS = "image_url";

const clean = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

export function usePublicVillageBanners(): VillageBannerSlide[] {
  const [slides, setSlides] = useState<VillageBannerSlide[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const client = supabase;
      const read = (columns: string) =>
        client
          .from("village_page_banners")
          .select(columns)
          .eq("is_published", true)
          .order("display_order")
          .order("created_at")
          .limit(3);
      let { data, error } = await read(FULL_COLUMNS);
      if (error) ({ data, error } = await read(BASE_COLUMNS));
      if (cancelled || error || !data) return;
      setSlides(
        (data as unknown as Array<Record<string, unknown>>)
          .map((r) => ({
            url: typeof r.image_url === "string" ? r.image_url : "",
            heading: clean(r.heading),
            description: clean(r.description),
            ctaText: clean(r.cta_text),
            ctaLink: clean(r.cta_link),
            showText: r.show_text !== false,
          }))
          .filter((s) => s.url.length > 0),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return slides;
}
