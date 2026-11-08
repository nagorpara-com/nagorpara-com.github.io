/**
 * "Seen notice" memory for the public Announcement Bar (Phase C /
 * C3 Step 2).
 *
 * This is a per-visitor convenience ONLY: it remembers which notice
 * ids this browser has already seen so the bar does not keep calling
 * them new. It is never an authorization or security boundary — the
 * bar only ever shows notices the public database policy already
 * allows everyone to read.
 *
 * Storage shape: one key holding a JSON array of post ids, newest
 * last, capped so it can never grow without bound. Every read and
 * write is defensive: missing storage (SSR, privacy mode), corrupted
 * JSON, or a non-array value all degrade to "nothing seen" instead
 * of throwing.
 */

export const NOTICE_SEEN_KEY = "npazs.noticeSeenIds";
export const NOTICE_SEEN_CAP = 50;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/** Parses a raw stored value into a clean id list (never throws). */
export function parseSeenIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export function readSeenIds(storage: KeyValueStorage | null = browserStorage()): string[] {
  if (!storage) return [];
  try {
    return parseSeenIds(storage.getItem(NOTICE_SEEN_KEY));
  } catch {
    return [];
  }
}

export function isNoticeSeen(id: string, seen: readonly string[]): boolean {
  return seen.includes(id);
}

/** Returns a NEW list with `id` marked seen (idempotent, capped). */
export function withNoticeSeen(seen: readonly string[], id: string): string[] {
  if (seen.includes(id)) return [...seen];
  const next = [...seen, id];
  return next.length > NOTICE_SEEN_CAP ? next.slice(next.length - NOTICE_SEEN_CAP) : next;
}

export function markNoticeSeen(id: string, storage: KeyValueStorage | null = browserStorage()): string[] {
  const next = withNoticeSeen(readSeenIds(storage), id);
  if (storage) {
    try {
      storage.setItem(NOTICE_SEEN_KEY, JSON.stringify(next));
    } catch {
      // Storage full/blocked: the in-memory list still applies for
      // this page view; nothing here is worth an error to the visitor.
    }
  }
  // Let every on-screen indicator (bar, bell, list) refresh at
  // once when any one of them marks a notice seen.
  try {
    const g = globalThis as { dispatchEvent?: (e: Event) => void; Event?: typeof Event };
    if (typeof g.dispatchEvent === "function" && typeof g.Event === "function") {
      g.dispatchEvent(new g.Event(SEEN_CHANGED_EVENT));
    }
  } catch {
    // Non-browser environment: no listeners exist anyway.
  }
  return next;
}

/** Window event fired whenever the seen set changes in this tab. */
export const SEEN_CHANGED_EVENT = "npazs:seen-changed";
