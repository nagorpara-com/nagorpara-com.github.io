/**
 * Organization identity used by the app shell.
 *
 * Names and contact details below were provided by the organization on
 * 2026-10-22 — they are the DEFAULT values only. Once Supabase is
 * connected, the `site_settings` table (edited from Admin > Settings)
 * overrides them at runtime; see `src/hooks/useSiteSettings.ts`.
 *
 * NOT provided by the organization, so intentionally absent everywhere:
 * establishment year and tagline — never invent them.
 * Facebook: the owner confirmed on 2026-10-24 that the existing
 * @nagorpara Page is theirs (its display name reads "Nagorpara
 * Anirban Pathagar, Chapai Nawabgonj" — he was shown this twice and
 * confirmed anyway), so `facebookUrl` below carries its real URL.
 *
 * The logo file lives at `public/logo.png` — it is the organization's
 * REAL logo, installed on 2026-10-22 byte-identical to the original
 * file the organization provided (archived at `references/logo-original.png`).
 * Never redraw, recolor or alter it without the organization's permission.
 */
export const ORGANIZATION = {
  nameBn: "নগর পাড়া অগ্রগামী যুব সংঘ",
  nameEn: "Nagar Para Agragami Youth Sangha",
  /** The village itself — the first part of the address the
   * organization provided (2026-10-22). Shown as "গ্রামের নাম"
   * on the team views. */
  villageNameBn: "নগর পাড়া",
  logoPath: "logo.png",
} as const;

/** Contact defaults given by the organization (2026-10-22).
 * Email corrected by the owner on 2026-10-23: the official
 * address is nagorpara.youth@gmail.com (the earlier
 * nagorpara@gmail.com was wrong). The similarly-named
 * nagorpara@gmail.com remains only as the Admin LOGIN account
 * identity — a different thing, not the public contact. */
export const ORGANIZATION_CONTACT = {
  address: "নগর পাড়া, তাড়াশ, সিরাজগঞ্জ, বাংলাদেশ",
  phoneDisplay: "01956383607",
  phoneIntl: "+8801956383607",
  email: "nagorpara.youth@gmail.com",
  facebookUrl: "https://www.facebook.com/nagorpara" as string | null,
} as const;

export const BRAND_COLORS = {
  green: "#17623D",
  white: "#FFFFFF",
  gold: "#F3C64E",
} as const;
