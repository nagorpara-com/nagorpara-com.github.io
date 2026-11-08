/**
 * Homepage content defaults + section control (Phase 4).
 *
 * These are DEFAULTS only. When Supabase is connected, the
 * `home_sections` table (see supabase/migrations/0003_homepage_sections.sql)
 * — edited from the Admin Panel — controls which sections show, in what
 * order, and the hero texts/image. Nothing here is duplicated elsewhere:
 * every homepage component reads from this config / the database.
 *
 * The hero title and subtitle are the organization's OWN words, taken
 * from its Reference Image (Panel 01). The hero IMAGE is intentionally
 * null: no real village/team photo has been provided yet, so the hero
 * renders on the brand-green background instead of a fabricated photo.
 * The Admin Panel will set `image_url` (Supabase Storage) later.
 */

export interface HeroConfig {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  primaryCta: { label: string; to: string };
  secondaryCta: { label: string; to: string };
}

export const HERO_DEFAULTS: HeroConfig = {
  title: "একতা, খেলা ও উন্নয়নের পথে",
  subtitle: "গ্রামের যুবসমাজের শক্তি, খেলাধুলা ও সামাজিক উন্নয়নের অঙ্গীকার!",
  imageUrl: null,
  primaryCta: { label: "আমাদের সম্পর্কে", to: "/village-profile" },
  secondaryCta: { label: "যোগাযোগ করুন", to: "/contact" },
};

export type HomeSectionKey =
  | "hero"
  | "about"
  | "village"
  | "football"
  | "cricket"
  | "matches"
  | "news"
  | "finance"
  | "members"
  | "contact";

export interface HomeSectionConfig {
  key: HomeSectionKey;
  title: string;
  enabled: boolean;
  order: number;
}

/**
 * The ORIGINAL seed titles of the `home_sections` table
 * (migration 0003). Several differ from the headings the public
 * homepage renders today — the seed labels were never updated when
 * the headings were finalised (e.g. seed "ম্যাচ" vs the rendered
 * "আসন্ন ম্যাচ ও সাম্প্রতিক ফলাফল"). v180 A1 fix: a stored title
 * counts as an owner's EDIT only when it differs from BOTH this
 * seed value and the HOME_SECTIONS default below, so wiring the
 * Admin title editor through changes nothing on the public page
 * until the owner actually edits a title in the panel.
 */
export const HOME_SECTION_SEED_TITLES: Record<HomeSectionKey, string> = {
  hero: "Hero",
  about: "সংগঠন পরিচিতি",
  village: "গ্রাম পরিচিতি",
  football: "ফুটবল দল",
  cricket: "ক্রিকেট দল",
  matches: "ম্যাচ",
  news: "সংবাদ ও কার্যক্রম",
  finance: "আর্থিক সারসংক্ষেপ",
  members: "সদস্য ও কমিটি",
  contact: "যোগাযোগ",
};

/**
 * The heading the public homepage should show for a section:
 * the owner's edited title when one exists, otherwise undefined
 * (each section component then renders its built-in heading text,
 * exactly as before v180).
 */
export function editedSectionTitle(section: HomeSectionConfig): string | undefined {
  const stored = section.title?.trim();
  if (!stored) return undefined;
  if (stored === HOME_SECTION_SEED_TITLES[section.key]) return undefined;
  const fallback = HOME_SECTIONS.find((s) => s.key === section.key)?.title;
  if (stored === fallback) return undefined;
  return stored;
}

/** Mirrors the seed rows of the `home_sections` table. */
export const HOME_SECTIONS: HomeSectionConfig[] = [
  { key: "hero", title: "Hero", enabled: true, order: 1 },
  { key: "about", title: "সংগঠন পরিচিতি", enabled: true, order: 2 },
  { key: "village", title: "গ্রাম পরিচিতি", enabled: true, order: 3 },
  { key: "football", title: "ফুটবল টিম", enabled: true, order: 4 },
  { key: "cricket", title: "ক্রিকেট টিম", enabled: true, order: 5 },
  { key: "matches", title: "আসন্ন ম্যাচ ও ফলাফল", enabled: true, order: 6 },
  { key: "news", title: "সংবাদ, কার্যক্রম ও নোটিশ", enabled: true, order: 7 },
  { key: "finance", title: "আর্থিক সারসংক্ষেপ", enabled: true, order: 9 },
  { key: "members", title: "সদস্য ও কমিটি", enabled: true, order: 10 },
  { key: "contact", title: "যোগাযোগ", enabled: true, order: 11 },
];

/**
 * Short organization intro for the homepage About preview.
 * Written only from facts the organization itself provided (name,
 * village/upazila/district from its address, and the scope in its
 * Master Prompt: football & cricket teams, social activities,
 * transparent member finance). No history or founding year is claimed.
 * Admin-editable later via the `about` home section / village profile.
 */
export const ABOUT_TEXT =
  "নগর পাড়া অগ্রগামী যুব সংঘ সিরাজগঞ্জ জেলার তাড়াশ উপজেলার নগর পাড়া গ্রামের একটি যুব সংগঠন। সংগঠনটি গ্রামের ফুটবল ও ক্রিকেট টিম পরিচালনা করে, খেলাধুলা ও সামাজিক কার্যক্রমের আয়োজন করে এবং সদস্যদের আর্থিক হিসাব স্বচ্ছভাবে পরিচালনার জন্য কাজ করে।";
