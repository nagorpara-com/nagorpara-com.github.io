import { useEffect, useState } from "react";
import { ORGANIZATION, ORGANIZATION_CONTACT } from "../config/organization";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

export interface SiteSettings {
  nameBn: string;
  nameEn: string;
  tagline: string | null;
  logoPath: string;
  address: string | null;
  phoneDisplay: string | null;
  phoneIntl: string | null;
  email: string | null;
  facebookUrl: string | null;
  youtubeUrl: string | null;
  /** Village Page banner photo URL (migration 0023); null = the
   *  gradient-only banner. */
  villageBannerUrl: string | null;
  /** Gallery album chosen for the Village Page preview
   *  (migration 0023); null = all published items. */
  villageGalleryAlbumId: string | null;
  /** Members & Committee page banner photo URL (migration 0029);
   *  null = the gradient-only banner. */
  membersBannerUrl: string | null;
  /** Members & Committee page headline (migration 0029);
   *  null = the default "সদস্য ও কমিটি". */
  membersPageTitle: string | null;
  /** Members & Committee page description (migration 0029);
   *  null = the default description text. */
  membersPageDescription: string | null;
}

const DEFAULTS: SiteSettings = {
  nameBn: ORGANIZATION.nameBn,
  nameEn: ORGANIZATION.nameEn,
  tagline: null,
  logoPath: ORGANIZATION.logoPath,
  address: ORGANIZATION_CONTACT.address,
  phoneDisplay: ORGANIZATION_CONTACT.phoneDisplay,
  phoneIntl: ORGANIZATION_CONTACT.phoneIntl,
  email: ORGANIZATION_CONTACT.email,
  facebookUrl: ORGANIZATION_CONTACT.facebookUrl,
  youtubeUrl: null,
  villageBannerUrl: null,
  villageGalleryAlbumId: null,
  membersBannerUrl: null,
  membersPageTitle: null,
  membersPageDescription: null,
};

/**
 * The single source the Header/Footer read organization info from.
 *
 * Phase 3: returns the organization-provided defaults from
 * `src/config/organization.ts`. When Supabase is connected, it loads the
 * single `site_settings` row (id = 1) — the row the Admin Panel edits —
 * and overrides any non-empty field. This is what makes the footer and
 * contact info admin-editable later without code changes.
 *
 * Facebook: the config default carries the organization's owner-
 * confirmed Page URL. A non-empty `facebook_url` in the settings row
 * overrides it; an empty or missing settings value KEEPS the
 * confirmed default, so the public link can never disappear
 * accidentally because the Settings field was left blank
 * (fix recorded in docs/HEADER_FOOTER_AUDIT_2026-10-24.md, P2).
 */
export function useSiteSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    supabase
      .from("site_settings")
      .select(
        "org_name_bn, org_name_en, tagline, logo_url, address, phone, email, facebook_url, youtube_url, village_banner_url, village_gallery_album_id",
      )
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const row = data as Record<string, string | null>;
        setSettings((prev) => ({
          nameBn: row.org_name_bn || prev.nameBn,
          nameEn: row.org_name_en || prev.nameEn,
          tagline: row.tagline || prev.tagline,
          logoPath: row.logo_url || prev.logoPath,
          address: row.address ?? prev.address,
          phoneDisplay: row.phone ?? prev.phoneDisplay,
          phoneIntl: row.phone
            ? row.phone.replace(/^0/, "+880")
            : prev.phoneIntl,
          email: row.email ?? prev.email,
          facebookUrl: row.facebook_url || prev.facebookUrl,
          youtubeUrl: row.youtube_url || prev.youtubeUrl,
          villageBannerUrl: row.village_banner_url || null,
          villageGalleryAlbumId: row.village_gallery_album_id || null,
          membersBannerUrl: prev.membersBannerUrl,
          membersPageTitle: prev.membersPageTitle,
          membersPageDescription: prev.membersPageDescription,
        }));
      });

    // Migration 0029 columns are fetched separately and tolerated:
    // until that migration is applied live, this query errors and
    // the banner simply keeps its defaults — the main settings
    // load above is never affected.
    supabase
      .from("site_settings")
      .select("members_banner_url, members_page_title, members_page_description")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const row = data as Record<string, string | null>;
        setSettings((prev) => ({
          ...prev,
          membersBannerUrl: row.members_banner_url || null,
          membersPageTitle: row.members_page_title || null,
          membersPageDescription: row.members_page_description || null,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
