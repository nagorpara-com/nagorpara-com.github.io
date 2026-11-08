import { useEffect } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { applyTheme, type ThemeColors } from "../utils/theme";

/**
 * Loads the admin-chosen theme colors (migration 0037) from the
 * single site_settings row and applies them to the whole app.
 *
 * Deliberately a SEPARATE, tolerant query: until migration 0037
 * is applied live the columns do not exist, the query errors,
 * and the site simply keeps its built-in brand colors — theming
 * can never break the site. Mounted once at the app root.
 */
export function useThemeColors(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data, error } = await supabase
        .from("site_settings")
        .select("theme_brand, theme_brand_dark, theme_gold, theme_brand_light")
        .eq("id", 1)
        .single();
      if (cancelled || error || !data) return;
      const row = data as unknown as Record<string, unknown>;
      const colors: ThemeColors = {
        brand: (row.theme_brand as string | null) ?? null,
        brandDark: (row.theme_brand_dark as string | null) ?? null,
        gold: (row.theme_gold as string | null) ?? null,
        brandLight: (row.theme_brand_light as string | null) ?? null,
      };
      applyTheme(colors);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
