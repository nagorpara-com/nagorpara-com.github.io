import { useEffect, useState } from "react";
import { HERO_DEFAULTS, HOME_SECTIONS, type HeroConfig, type HomeSectionConfig } from "../config/homepage";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

interface HomeSectionsState {
  sections: HomeSectionConfig[];
  hero: HeroConfig;
}

const DEFAULT_STATE: HomeSectionsState = {
  sections: HOME_SECTIONS,
  hero: HERO_DEFAULTS,
};

/**
 * Section visibility/order + hero content.
 * Defaults come from `src/config/homepage.ts`; when Supabase is
 * connected, the Admin-managed `home_sections` table overrides them —
 * this is the publish/unpublish + ordering control the Admin Panel
 * will use, with no code change needed later.
 */
export function useHomeSections(): HomeSectionsState {
  const [state, setState] = useState<HomeSectionsState>(DEFAULT_STATE);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    supabase
      .from("home_sections")
      .select("key, title, is_enabled, display_order, config")
      .order("display_order")
      .then(({ data, error }) => {
        if (cancelled || error || !data || data.length === 0) return;
        const rows = data as {
          key: string;
          title: string;
          is_enabled: boolean;
          display_order: number;
          config: Record<string, unknown> | null;
        }[];

        // Owner decision 2026-10-27: no Gallery section anywhere.
        // The home_sections "gallery" row stays in the database
        // untouched; it is simply never rendered.
        const sections: HomeSectionConfig[] = rows
          .filter((row) => row.key !== "gallery")
          .map((row) => ({
            key: row.key as HomeSectionConfig["key"],
            title: row.title,
            enabled: row.is_enabled,
            order: row.display_order,
          }));

        const heroRow = rows.find((row) => row.key === "hero");
        const cfg = (heroRow?.config ?? {}) as {
          title?: string;
          subtitle?: string;
          image_url?: string | null;
        };
        const hero: HeroConfig = {
          ...HERO_DEFAULTS,
          title: cfg.title || HERO_DEFAULTS.title,
          subtitle: cfg.subtitle || HERO_DEFAULTS.subtitle,
          imageUrl: cfg.image_url ?? null,
        };

        setState({ sections, hero });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
