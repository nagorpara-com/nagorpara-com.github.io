/**
 * Village section areas + validation (pure — unit-testable).
 *
 * The `area` keys are the Village Profile page's category keys:
 * the six built-in blocks (migrations 0022 + 0035) plus any
 * category the Admin creates (migration 0054 replaces the
 * value-list CHECK with a slug FORMAT check, so a section can be
 * routed into any village_categories row). `porichiti` is the
 * database default and the historical behaviour: every section
 * created before the column existed belongs to it.
 *
 * Validation mirrors the village_sections schema (migrations
 * 0001 + 0022 + 0035 + 0054): title is required; content and
 * image are optional; display_order is a non-negative integer;
 * area must be a valid category slug.
 */
export const VILLAGE_AREAS = [
  "porichiti",
  "itihash",
  "sthan",
  "prokriti",
  "karjokrom",
  /* 'songothon' (সংগঠন পরিচিতি) joins the list with migration
   * 0035 — before it is applied live, the database CHECK still
   * rejects this area, so an Admin save using it fails honestly
   * until then; the public block keeps its built-in text. */
  "songothon",
] as const;

export type VillageArea = (typeof VILLAGE_AREAS)[number];

export const VILLAGE_AREA_LABELS: Record<VillageArea, string> = {
  porichiti: "গ্রামের পরিচিতি",
  itihash: "গ্রামের ইতিহাস",
  sthan: "গুরুত্বপূর্ণ স্থান ও স্থাপনা",
  prokriti: "প্রকৃতি ও পরিবেশ",
  karjokrom: "সামাজিক, সাংস্কৃতিক ও ক্রীড়া কার্যক্রম",
  songothon: "সংগঠন পরিচিতি",
};

export const DEFAULT_VILLAGE_AREA: VillageArea = "porichiti";

/** Narrow an unknown value to a VillageArea (fallback: default). */
export function asVillageArea(value: unknown): VillageArea {
  return (VILLAGE_AREAS as readonly string[]).includes(value as string)
    ? (value as VillageArea)
    : DEFAULT_VILLAGE_AREA;
}

export function isVillageArea(value: unknown): value is VillageArea {
  return (VILLAGE_AREAS as readonly string[]).includes(value as string);
}

/** The category-slug shape shared by village_categories.key and
 * village_sections.area since migration 0054: a lowercase
 * English slug, at most 40 characters. */
export const VILLAGE_AREA_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isVillageAreaKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    VILLAGE_AREA_KEY_PATTERN.test(value)
  );
}

export interface VillageAreaOption {
  value: string;
  label: string;
}

/** Area options for the Admin section form from the category
 * rows (migration 0054): only 'text' and 'places' categories
 * hold village_sections rows. Callers fall back to VILLAGE_AREAS
 * + VILLAGE_AREA_LABELS when categories are unavailable. */
export function areaOptionsFromCategories(
  categories: readonly { key: string; label: string; kind: string }[],
): VillageAreaOption[] {
  return categories
    .filter((c) => c.kind === "text" || c.kind === "places")
    .map((c) => ({ value: c.key, label: c.label }));
}

export interface VillageSectionInput {
  title: string;
  content: string;
  imageUrl: string;
  /** Optional video URL (migration 0038) — set from the
   * Important Places admin page; other village forms pass the
   * stored value through untouched. */
  videoUrl: string;
  displayOrder: number;
  isPublished: boolean;
  /** A category key: one of the built-in blocks or any
   * Admin-created category slug (migration 0054). */
  area: string;
}

export function validateVillageSectionInput(input: VillageSectionInput): string | null {
  if (!input.title.trim()) return "শিরোনাম আবশ্যক।";
  if (input.title.trim().length > 200) return "শিরোনাম ২০০ অক্ষরের মধ্যে রাখুন।";
  const url = input.imageUrl.trim();
  if (url && !/^https?:\/\/.+/.test(url)) return "ছবির সঠিক URL দিন (http/https দিয়ে শুরু), অথবা ছবি Upload করুন।";
  const video = input.videoUrl.trim();
  if (video && !/^https?:\/\/.+/.test(video)) return "ভিডিওর সঠিক URL দিন (http/https দিয়ে শুরু), অথবা ভিডিও Upload করুন।";
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0)
    return "ক্রম অবশ্যই ০ বা তার বেশি পূর্ণ সংখ্যা হতে হবে।";
  if (!isVillageAreaKey(input.area)) return "সঠিক Block বেছে নিন।";
  return null;
}

/** Normalize form input into the database payload shape. */
export function villageSectionPayload(input: VillageSectionInput) {
  return {
    title: input.title.trim(),
    content: input.content.trim() || null,
    image_url: input.imageUrl.trim() || null,
    video_url: input.videoUrl.trim() || null,
    display_order: input.displayOrder,
    is_published: input.isPublished,
    area: input.area,
  };
}
