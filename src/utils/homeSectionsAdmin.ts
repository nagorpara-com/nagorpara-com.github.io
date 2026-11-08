import { HERO_DEFAULTS } from "../config/homepage";

/**
 * Pure logic for the Homepage Management admin page
 * (R-12.1, /admin/content/home).
 *
 * The ONE data source is the `home_sections` table (migration
 * 0003) — the same rows the Settings page's display switches
 * write and the public homepage reads (useHomeSections). This
 * module only shapes edits and diffs; it stores nothing.
 *
 * What is genuinely editable per section (audit, 2026-10-24):
 * - every section: title (the management label stored on the
 *   row), is_enabled, display_order;
 * - the hero row's config: title / subtitle / image_url — the
 *   ONLY config the public homepage consumes (useHomeSections).
 * Other sections' public headings are fixed in their components
 * today, so no fake "description" fields are offered for them.
 */

export interface HomeSectionRow {
  key: string;
  title: string;
  is_enabled: boolean;
  display_order: number;
  config: Record<string, unknown> | null;
}

export interface HeroEdit {
  title: string;
  subtitle: string;
  imageUrl: string;
}

/** Hero edit values from a row's config, with the same
 *  fallbacks the public hook applies. */
export function heroEditOf(row: HomeSectionRow | undefined): HeroEdit {
  const cfg = (row?.config ?? {}) as {
    title?: unknown;
    subtitle?: unknown;
    image_url?: unknown;
  };
  return {
    title: typeof cfg.title === "string" && cfg.title ? cfg.title : HERO_DEFAULTS.title,
    subtitle:
      typeof cfg.subtitle === "string" && cfg.subtitle
        ? cfg.subtitle
        : HERO_DEFAULTS.subtitle,
    imageUrl: typeof cfg.image_url === "string" ? cfg.image_url : "",
  };
}

/** The config patch written for the hero row (null = no image). */
export function heroConfigPatch(hero: HeroEdit): Record<string, unknown> {
  return {
    title: hero.title.trim(),
    subtitle: hero.subtitle.trim(),
    image_url: hero.imageUrl.trim() ? hero.imageUrl.trim() : null,
  };
}

export function sortedRows(rows: HomeSectionRow[]): HomeSectionRow[] {
  return [...rows].sort((a, b) => a.display_order - b.display_order);
}

/**
 * Move a row up/down within the sorted list and RENUMBER
 * display_order 1..n across the list, so orders stay dense and
 * unambiguous (the Settings page's pairwise swaps could leave
 * gaps after earlier edits; one numbering rule here).
 */
export function moveRow(
  rows: HomeSectionRow[],
  key: string,
  direction: -1 | 1,
): HomeSectionRow[] {
  const sorted = sortedRows(rows);
  const index = sorted.findIndex((r) => r.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return rows;
  const [moved] = sorted.splice(index, 1);
  sorted.splice(target, 0, moved);
  return sorted.map((r, i) => ({ ...r, display_order: i + 1 }));
}

function configEqual(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

export interface SectionPatch {
  key: string;
  patch: Partial<
    Pick<HomeSectionRow, "title" | "is_enabled" | "display_order" | "config">
  >;
}

/** Row-level diff between the saved baseline and the edited
 *  copy — the save writes exactly these patches, nothing else. */
export function diffSections(
  baseline: HomeSectionRow[],
  edited: HomeSectionRow[],
): SectionPatch[] {
  const patches: SectionPatch[] = [];
  for (const row of edited) {
    const base = baseline.find((r) => r.key === row.key);
    if (!base) continue;
    const patch: SectionPatch["patch"] = {};
    if (row.title !== base.title) patch.title = row.title;
    if (row.is_enabled !== base.is_enabled) patch.is_enabled = row.is_enabled;
    if (row.display_order !== base.display_order) {
      patch.display_order = row.display_order;
    }
    if (!configEqual(row.config, base.config)) patch.config = row.config;
    if (Object.keys(patch).length > 0) patches.push({ key: row.key, patch });
  }
  return patches;
}

export function isDirty(
  baseline: HomeSectionRow[],
  edited: HomeSectionRow[],
): boolean {
  return diffSections(baseline, edited).length > 0;
}

/**
 * Save integrity (P1 fix, 2026-10-24).
 *
 * A bare `.update()` cannot prove anything was written: under
 * RLS, a non-admin's UPDATE matches 0 rows and PostgREST still
 * returns success with no error. The save therefore asks for
 * the updated row back (`.select("key")`) and treats an empty
 * result as NOT saved. The helpers below keep the bookkeeping
 * pure and testable.
 */
export interface SaveOutcome {
  key: string;
  ok: boolean;
  /** PostgREST/DB error text when the write itself failed. */
  error?: string;
  /** True when the UPDATE returned no row — nothing was
   *  written (in practice: RLS refused it, i.e. no write
   *  permission for this role). */
  noRow?: boolean;
}

/**
 * The baseline after a save round: ONLY rows whose write was
 * verified take their edited values into the new baseline.
 * Unverified rows keep the old baseline, so a retry re-sends
 * exactly the still-unsaved changes — and the dirty indicator
 * stays honest about what is not yet persisted.
 */
export function baselineAfterSave(
  baseline: HomeSectionRow[],
  edited: HomeSectionRow[],
  outcomes: SaveOutcome[],
): HomeSectionRow[] {
  const savedKeys = new Set(outcomes.filter((o) => o.ok).map((o) => o.key));
  return baseline.map((base) => {
    if (!savedKeys.has(base.key)) return base;
    return edited.find((r) => r.key === base.key) ?? base;
  });
}

/**
 * The user-facing result of a save round. Success text is
 * produced ONLY by the page when this returns null (every
 * patch verified); any failure yields a precise message —
 * which sections were saved, which were not, and why.
 */
export function saveFailureMessage(outcomes: SaveOutcome[]): string | null {
  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length === 0) return null;
  const saved = outcomes.filter((o) => o.ok).map((o) => o.key);
  const parts: string[] = [];
  if (saved.length > 0) {
    parts.push(`সংরক্ষিত হয়েছে: ${saved.join(", ")}।`);
  }
  for (const f of failed) {
    parts.push(
      f.noRow
        ? `${f.key}: কোনো পরিবর্তন লেখা যায়নি — সম্ভবত আপনার সংরক্ষণের অনুমতি নেই (শুধু Admin Homepage-এর বিন্যাস সংরক্ষণ করতে পারে)।`
        : `${f.key}: সংরক্ষণ ব্যর্থ হয়েছে (${f.error ?? "অজানা ত্রুটি"})।`,
    );
  }
  if (saved.length > 0) {
    parts.push("বাকি পরিবর্তনগুলো সংরক্ষণ করতে আবার “সংরক্ষণ করুন” চাপুন।");
  }
  return parts.join(" ");
}
