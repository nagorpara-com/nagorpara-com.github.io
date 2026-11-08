import { formatDateBn } from "./format.ts";
import { ROLE_LABELS } from "./userAdmin.ts";

/**
 * General Audit Log (Section 03) — display logic for the rows of
 * `audit_logs` (migration 0020). Pure functions, unit-tested.
 *
 * The database records field-based changes: each tracked field maps
 * to either { old, new } or — for redacted fields (profile phone,
 * news content) — { changed: true } with NO value. Nothing in this
 * file can resurrect a redacted value: it is never in the data.
 */

export interface AuditLogRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: "insert" | "update" | "delete";
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  changes: Record<string, unknown>;
}

export const ENTITY_LABELS: Record<string, string> = {
  profiles: "ব্যবহারকারী প্রোফাইল",
  news_posts: "সংবাদ / নোটিশ",
  site_settings: "সাইট সেটিংস",
};

export const ACTION_LABELS: Record<string, string> = {
  insert: "তৈরি",
  update: "পরিবর্তন",
  delete: "মোছা",
};

export const FIELD_LABELS: Record<string, string> = {
  full_name: "নাম",
  phone: "ফোন",
  avatar_url: "প্রোফাইল ছবি",
  role: "Role",
  is_active: "সক্রিয় অবস্থা",
  type: "ধরন",
  title: "শিরোনাম",
  slug: "Slug",
  content: "মূল লেখা",
  cover_image_url: "কভার ছবি",
  is_published: "প্রকাশ অবস্থা",
  published_at: "প্রকাশের সময়",
  org_name_bn: "প্রতিষ্ঠানের নাম (বাংলা)",
  org_name_en: "প্রতিষ্ঠানের নাম (ইংরেজি)",
  tagline: "ট্যাগলাইন",
  logo_url: "Logo",
  established_year: "প্রতিষ্ঠার বছর",
  address: "ঠিকানা",
  email: "ইমেইল",
  facebook_url: "Facebook ঠিকানা",
  youtube_url: "YouTube ঠিকানা",
  football_team_name: "ফুটবল টিমের নাম",
  football_current_season: "ফুটবল সিজন",
  cricket_team_name: "ক্রিকেট টিমের নাম",
  cricket_current_season: "ক্রিকেট সিজন",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** A change entry is redacted when it carries only { changed: true }. */
export function isRedactedChange(change: unknown): boolean {
  if (!change || typeof change !== "object") return false;
  const c = change as Record<string, unknown>;
  return c.changed === true && !("old" in c) && !("new" in c);
}

/** Human display for one stored value; never invents data. */
export function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field === "role" && typeof value === "string") return ROLE_LABELS[value] ?? value;
  if (field === "is_active" && typeof value === "boolean") return value ? "সক্রিয়" : "নিষ্ক্রিয়";
  if (field === "is_published" && typeof value === "boolean") return value ? "প্রকাশিত" : "খসড়া";
  if (typeof value === "boolean") return value ? "হ্যাঁ" : "না";
  if (field === "published_at" && typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return formatDateBn(value);
    return value;
  }
  if (typeof value === "string") {
    return value.length > 90 ? value.slice(0, 90) + "…" : value;
  }
  return String(value);
}

export interface ChangeEntry {
  field: string;
  label: string;
  redacted: boolean;
  oldText: string;
  newText: string;
}

/** Flattens the changes JSONB into display entries, in stored order. */
export function changeEntries(changes: Record<string, unknown> | null | undefined): ChangeEntry[] {
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes).map(([field, raw]) => {
    if (isRedactedChange(raw)) {
      return { field, label: fieldLabel(field), redacted: true, oldText: "", newText: "" };
    }
    const c = (raw ?? {}) as { old?: unknown; new?: unknown };
    return {
      field,
      label: fieldLabel(field),
      redacted: false,
      oldText: formatAuditValue(field, c.old ?? null),
      newText: formatAuditValue(field, c.new ?? null),
    };
  });
}

/** Short form of a record id for the list (full id stays in detail). */
export function shortId(id: string): string {
  return id.length > 13 ? id.slice(0, 8) + "…" : id;
}
