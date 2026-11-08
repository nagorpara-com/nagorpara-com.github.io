import type { NewsPostType, NoticeCategory } from "../types/database.types";

/**
 * News / activity / notice helpers (Phase C / C3) — pure functions,
 * shared by the Admin form, the public pages and the unit tests.
 *
 * The database stores `type` as free text (the 'news | activity |
 * notice' set lives in a column comment, not a CHECK), so this module
 * is the single place that constrains the values the app will ever
 * write. Slugs are URL identifiers: ASCII words from the title when
 * it has any, plus a random suffix — Bengali titles therefore still
 * produce safe, collision-resistant slugs.
 */

export const POST_TYPES: readonly NewsPostType[] = ["news", "activity", "notice"];

export const POST_TYPE_LABELS: Record<NewsPostType, string> = {
  news: "সংবাদ",
  activity: "কার্যক্রম",
  notice: "নোটিশ",
};

export function isPostType(value: unknown): value is NewsPostType {
  return value === "news" || value === "activity" || value === "notice";
}

/** Notice categories (migration 0027) with their Bengali labels
 * — one source for the admin form/table and the public chips. */
export const NOTICE_CATEGORIES: readonly NoticeCategory[] = [
  "info",
  "offer",
  "update",
];

export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  info: "তথ্য",
  offer: "অফার",
  update: "আপডেট",
};

export function isNoticeCategory(value: unknown): value is NoticeCategory {
  return value === "info" || value === "offer" || value === "update";
}

/** A stored button URL is rendered only when it is http(s) —
 * the same rule the database CHECK enforces at write time
 * (defence in depth at render time). */
export function isSafeButtonUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function randomSuffix(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(6);
    cryptoObj.getRandomValues(bytes);
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  }
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

/**
 * Builds a slug for a post. An explicit suffix can be passed by
 * tests; real callers get a fresh random one, so two posts with the
 * same (or fully Bengali) title never collide in practice — and the
 * database UNIQUE constraint remains the final guard.
 */
export function generateSlug(title: string, suffix: string = randomSuffix()): string {
  const base = slugifyTitle(title) || "post";
  return `${base}-${suffix}`;
}

export function makeExcerpt(content: string | null | undefined, max = 160): string {
  if (!content) return "";
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export interface NewsPostInput {
  title: string;
  type: string;
  slug: string;
  cover_image_url: string;
  content: string;
  /** Notice-only extras (migration 0027); optional so existing
   * callers keep working — they apply only to type "notice". */
  notice_category?: string;
  button_text?: string;
  button_url?: string;
}

export type NewsPostFieldErrors = Partial<
  Record<
    | "title"
    | "type"
    | "slug"
    | "cover_image_url"
    | "content"
    | "notice_category"
    | "button_text"
    | "button_url",
    string
  >
>;

export interface ValidatedNewsPost {
  title: string;
  type: NewsPostType;
  /** Empty when the caller should auto-generate one. */
  slug: string;
  cover_image_url: string | null;
  content: string | null;
  notice_category: NoticeCategory;
  button_text: string | null;
  button_url: string | null;
}

export function validateNewsPostInput(input: NewsPostInput): {
  ok: boolean;
  errors: NewsPostFieldErrors;
  value: ValidatedNewsPost;
} {
  const errors: NewsPostFieldErrors = {};
  const title = input.title.trim();
  if (title.length < 3) errors.title = "শিরোনাম কমপক্ষে ৩ অক্ষরের হতে হবে।";
  else if (title.length > 200) errors.title = "শিরোনাম সর্বোচ্চ ২০০ অক্ষরের হবে।";

  if (!isPostType(input.type)) errors.type = "ধরন নির্বাচন করুন (সংবাদ, কার্যক্রম বা নোটিশ)।";

  const slug = input.slug.trim().toLowerCase();
  if (slug !== "" && (!SLUG_PATTERN.test(slug) || slug.length > 120)) {
    errors.slug = "Slug-এ শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন চলবে (সর্বোচ্চ ১২০ অক্ষর)।";
  }

  const cover = input.cover_image_url.trim();
  if (cover !== "" && !/^(https?:\/\/|\/)/.test(cover)) {
    errors.cover_image_url = "ছবির ঠিকানা http://, https:// বা / দিয়ে শুরু হতে হবে।";
  } else if (cover.length > 500) {
    errors.cover_image_url = "ছবির ঠিকানা সর্বোচ্চ ৫০০ অক্ষরের হবে।";
  }

  const content = input.content.trim();
  if (content.length > 20000) errors.content = "বিস্তারিত সর্বোচ্চ ২০,০০০ অক্ষরের হবে।";

  // Notice extras (migration 0027). Non-notice posts always
  // store the neutral defaults, so an unrelated edit on the
  // news page can never wipe a notice's button by accident —
  // the fields are only honoured for type "notice".
  let notice_category: NoticeCategory = "info";
  let button_text: string | null = null;
  let button_url: string | null = null;
  if (input.type === "notice") {
    if (
      input.notice_category !== undefined &&
      input.notice_category !== "" &&
      !isNoticeCategory(input.notice_category)
    ) {
      errors.notice_category = "ধরন নির্বাচন করুন (তথ্য, অফার বা আপডেট)।";
    } else if (isNoticeCategory(input.notice_category)) {
      notice_category = input.notice_category;
    }
    const bt = (input.button_text ?? "").trim();
    const bu = (input.button_url ?? "").trim();
    if (bt !== "" || bu !== "") {
      if (bt === "")
        errors.button_text = "বাটনের লেখা দিন — অথবা লিংকটিও মুছে ফেলুন।";
      else if (bt.length > 60)
        errors.button_text = "বাটনের লেখা সর্বোচ্চ ৬০ অক্ষরের হবে।";
      if (bu === "")
        errors.button_url = "বাটনের লিংক দিন — অথবা লেখাটিও মুছে ফেলুন।";
      else if (!isSafeButtonUrl(bu))
        errors.button_url = "লিংক http:// বা https:// দিয়ে শুরু হতে হবে।";
      else if (bu.length > 500)
        errors.button_url = "লিংক সর্বোচ্চ ৫০০ অক্ষরের হবে।";
      if (!errors.button_text && !errors.button_url) {
        button_text = bt;
        button_url = bu;
      }
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      title,
      type: isPostType(input.type) ? input.type : "news",
      slug,
      cover_image_url: cover === "" ? null : cover,
      content: content === "" ? null : content,
      notice_category,
      button_text,
      button_url,
    },
  };
}

/**
 * The publish/unpublish patch. Publishing stamps `published_at` the
 * first time only (re-publishing keeps the original date); unpublishing
 * flips the flag and keeps the date as history — public queries filter
 * on `is_published`, so a kept date is never visible while drafted.
 */
export function nextPublishPatch(
  post: { is_published: boolean; published_at: string | null },
  publish: boolean,
  nowIso: string,
): { is_published: boolean; published_at: string | null } {
  if (publish) {
    return { is_published: true, published_at: post.published_at ?? nowIso };
  }
  return { is_published: false, published_at: post.published_at };
}
