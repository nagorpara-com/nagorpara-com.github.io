import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { compressImageForUpload } from "../utils/compressImage";

/**
 * Admin data layer for Website Settings (Batch 1).
 *
 * Everything is stored in the EXISTING schema — no new tables:
 * - `site_settings` (single row, id = 1): organization info, contact,
 *   social links, logo_url, football_* and cricket_* team settings
 *   (migrations 0001, 0004, 0005). Writes are restricted by RLS to
 *   admin (`site_settings: admin writes`).
 * - `home_sections` (migration 0003): homepage section visibility
 *   and display order. Same admin-only write policy.
 *
 * Every function reports failure honestly instead of pretending a
 * save happened (e.g. when the settings row does not exist yet).
 */

export interface SiteSettingsRow {
  org_name_bn: string;
  org_name_en: string | null;
  tagline: string | null;
  logo_url: string | null;
  established_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  football_team_name: string;
  football_current_season: string;
  football_layout: string;
  football_sorting: string;
  football_card_stats: string[];
  cricket_team_name: string | null;
  cricket_current_season: string | null;
  cricket_layout: string;
  cricket_sorting: string;
  cricket_card_stats: string[];
  /** Migration 0029 — optional so rows loaded before that
   *  migration is applied still type-check. */
  members_banner_url?: string | null;
  members_page_title?: string | null;
  members_page_description?: string | null;
  /** Migration 0037 — admin-editable theme colors; NULL = the
   *  built-in brand default. Optional for the same reason. */
  theme_brand?: string | null;
  theme_brand_dark?: string | null;
  theme_gold?: string | null;
  theme_brand_light?: string | null;
  /** Migration 0039 — SEO ও মেটা page values; NULL = built-in
   *  defaults from index.html. Optional for the same reason. */
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  og_image_url?: string | null;
}

export interface HomeSectionRow {
  key: string;
  title: string;
  is_enabled: boolean;
  display_order: number;
}

const SETTINGS_COLUMNS =
  "org_name_bn, org_name_en, tagline, logo_url, established_year, address, phone, email, facebook_url, youtube_url, football_team_name, football_current_season, football_layout, football_sorting, football_card_stats, cricket_team_name, cricket_current_season, cricket_layout, cricket_sorting, cricket_card_stats";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((k): k is string => typeof k === "string")
    : [];
}

export function useAdminSettings() {
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [homeSections, setHomeSections] = useState<HomeSectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** True while migration 0037 (theme colors) is not live yet:
   *  the theme fetch 42703s and the Settings page shows an
   *  honest "database update pending" notice instead. */
  const [themeMigrationPending, setThemeMigrationPending] = useState(false);
  /** Same tolerated pattern for migration 0039 (SEO columns). */
  const [seoMigrationPending, setSeoMigrationPending] = useState(false);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [settingsRes, sectionsRes] = await Promise.all([
      supabase.from("site_settings").select(SETTINGS_COLUMNS).eq("id", 1).single(),
      supabase
        .from("home_sections")
        .select("key, title, is_enabled, display_order")
        .order("display_order"),
    ]);
    setLoading(false);
    if (settingsRes.error) {
      setLoadError(
        settingsRes.error.message.includes("0 rows") ||
          settingsRes.error.code === "PGRST116"
          ? "site_settings-এর মূল সারি (id = 1) এখনো তৈরি হয়নি। Supabase-এ Migration 0001 চালানো হলে এই সারি তৈরি হবে।"
          : settingsRes.error.message,
      );
    } else if (settingsRes.data) {
      const row = settingsRes.data as unknown as Record<string, unknown>;
      setSettings({
        ...(row as unknown as SiteSettingsRow),
        football_card_stats: asStringArray(row.football_card_stats),
        cricket_card_stats: asStringArray(row.cricket_card_stats),
      });
      // Migration 0029 columns: fetched separately and tolerated —
      // until that migration is applied live this query errors and
      // the banner fields simply stay empty; nothing else breaks.
      const extra = await supabase
        .from("site_settings")
        .select("members_banner_url, members_page_title, members_page_description")
        .eq("id", 1)
        .single();
      if (!extra.error && extra.data) {
        const erow = extra.data as unknown as Record<string, unknown>;
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                members_banner_url: (erow.members_banner_url as string | null) ?? null,
                members_page_title: (erow.members_page_title as string | null) ?? null,
                members_page_description: (erow.members_page_description as string | null) ?? null,
              }
            : prev,
        );
      }
      // Migration 0037 theme colors: same tolerated pattern.
      const theme = await supabase
        .from("site_settings")
        .select("theme_brand, theme_brand_dark, theme_gold, theme_brand_light")
        .eq("id", 1)
        .single();
      if (theme.error) {
        setThemeMigrationPending(true);
      } else if (theme.data) {
        setThemeMigrationPending(false);
        const trow = theme.data as unknown as Record<string, unknown>;
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                theme_brand: (trow.theme_brand as string | null) ?? null,
                theme_brand_dark: (trow.theme_brand_dark as string | null) ?? null,
                theme_gold: (trow.theme_gold as string | null) ?? null,
                theme_brand_light: (trow.theme_brand_light as string | null) ?? null,
              }
            : prev,
        );
      }
      // Migration 0039 SEO columns: same tolerated pattern.
      const seo = await supabase
        .from("site_settings")
        .select("meta_title, meta_description, meta_keywords, og_image_url")
        .eq("id", 1)
        .single();
      if (seo.error) {
        setSeoMigrationPending(true);
      } else if (seo.data) {
        setSeoMigrationPending(false);
        const srow = seo.data as unknown as Record<string, unknown>;
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                meta_title: (srow.meta_title as string | null) ?? null,
                meta_description: (srow.meta_description as string | null) ?? null,
                meta_keywords: (srow.meta_keywords as string | null) ?? null,
                og_image_url: (srow.og_image_url as string | null) ?? null,
              }
            : prev,
        );
      }
    }
    if (!sectionsRes.error && sectionsRes.data) {
      setHomeSections(sectionsRes.data as HomeSectionRow[]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Save a partial site_settings update. Returns an error message or null. */
  const saveSettings = useCallback(
    async (patch: Partial<SiteSettingsRow>): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase
        .from("site_settings")
        .update(patch)
        .eq("id", 1)
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        return "সংরক্ষণ হয়নি: site_settings-এর মূল সারি পাওয়া যায়নি, অথবা আপনার Role-এর সংরক্ষণের অনুমতি নেই (RLS)।";
      }
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      return null;
    },
    [],
  );

  /** Toggle/reorder one homepage section. Returns an error message or null. */
  const updateHomeSection = useCallback(
    async (key: string, patch: Partial<HomeSectionRow>): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase.from("home_sections").update(patch).eq("key", key);
      if (error) return error.message;
      setHomeSections((prev) =>
        prev
          .map((s) => (s.key === key ? { ...s, ...patch } : s))
          .sort((a, b) => a.display_order - b.display_order),
      );
      return null;
    },
    [],
  );

  /** Upload a new logo to the existing `site-assets` bucket.
   * v191: the logo is compressed in the browser first (cap
   * 1024 px) like every other Admin photo upload. */
  const uploadLogo = useCallback(async (file: File): Promise<{ url?: string; error?: string }> => {
    if (!supabase) return { error: "Supabase সংযুক্ত নয়।" };
    const uploadFile = await compressImageForUpload(file, 1024);
    const ext = uploadFile.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `branding/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("site-assets")
      .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
    if (error) return { error: error.message };
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    return { url: data.publicUrl };
  }, []);

  /** Read the four stored theme colors back (write-verification
   *  for the Settings page). Returns null when unreadable. */
  const fetchThemeColors = useCallback(async (): Promise<Record<string, string | null> | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("site_settings")
      .select("theme_brand, theme_brand_dark, theme_gold, theme_brand_light")
      .eq("id", 1)
      .single();
    if (error || !data) return null;
    return data as unknown as Record<string, string | null>;
  }, []);

  /** Read the stored SEO values back (write-verification for
   *  the SEO page). Returns null when unreadable. */
  const fetchSeoMeta = useCallback(async (): Promise<Record<string, string | null> | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("site_settings")
      .select("meta_title, meta_description, meta_keywords, og_image_url")
      .eq("id", 1)
      .single();
    if (error || !data) return null;
    return data as unknown as Record<string, string | null>;
  }, []);

  return {
    isConfigured: isSupabaseConfigured,
    loading,
    loadError,
    settings,
    homeSections,
    themeMigrationPending,
    seoMigrationPending,
    reload,
    saveSettings,
    updateHomeSection,
    uploadLogo,
    fetchThemeColors,
    fetchSeoMeta,
  };
}
