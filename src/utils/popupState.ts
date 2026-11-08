/**
 * Popup memory for the public site (Phase 5C) — deliberately
 * SEPARATE from `noticeSeen.ts`.
 *
 * Two different meanings live here and must never be merged into
 * the seen set (owner decision D-3: closing a popup is NOT the
 * same as having seen/read the notice):
 *
 *  1. `popupShown` — ids of notices whose POPUP has already been
 *     shown in this browser. A notice gets a popup at most once
 *     per browser, whether the visitor read it or just closed it.
 *     The seen set in `noticeSeen.ts` is untouched by this file.
 *
 *  2. Subscription popup memory — the visitor-local subscription
 *     state the finalized requirements (R-18–R-24) define:
 *     when the popup was last dismissed BY THE VISITOR (the
 *     7-day cooldown starts only then — a deferral caused by
 *     popup coordination never starts it, decision D-5), when a
 *     subscription was submitted (pending), and whether
 *     verification completed in this browser.
 *
 * Privacy rule (R-24): NO email address, token or secret is ever
 * stored here — only a status, timestamps, and (since 2026-10-27)
 * the subscription's random UUID, which identifies the
 * subscription row alone and is what lets an Admin delete be
 * noticed by this browser.
 *
 * The parsing/writing style mirrors `noticeSeen.ts`: fully
 * defensive, storage problems degrade to "nothing remembered"
 * instead of throwing.
 */

export const POPUP_SHOWN_KEY = "npazs.popupShownNotices";
export const POPUP_SHOWN_CAP = 50;
export const SUBSCRIPTION_MEMORY_KEY = "npazs.subscriptionPopup";

/** Window event fired whenever the popup-shown set changes. */
export const POPUP_SHOWN_CHANGED_EVENT = "npazs:popup-shown-changed";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export function readPopupShownIds(
  storage: KeyValueStorage | null = browserStorage(),
): string[] {
  if (!storage) return [];
  try {
    return parseIdList(storage.getItem(POPUP_SHOWN_KEY));
  } catch {
    return [];
  }
}

export function isPopupShown(id: string, shown: readonly string[]): boolean {
  return shown.includes(id);
}

/** Returns a NEW list with `id` marked popup-shown (idempotent, capped). */
export function withPopupShown(shown: readonly string[], id: string): string[] {
  if (shown.includes(id)) return [...shown];
  const next = [...shown, id];
  return next.length > POPUP_SHOWN_CAP ? next.slice(next.length - POPUP_SHOWN_CAP) : next;
}

export function markPopupShown(
  id: string,
  storage: KeyValueStorage | null = browserStorage(),
): string[] {
  const next = withPopupShown(readPopupShownIds(storage), id);
  if (storage) {
    try {
      storage.setItem(POPUP_SHOWN_KEY, JSON.stringify(next));
    } catch {
      // Storage full/blocked: the in-memory list still applies for
      // this page view; nothing here is worth an error.
    }
  }
  try {
    const g = globalThis as { dispatchEvent?: (e: Event) => void; Event?: typeof Event };
    if (typeof g.dispatchEvent === "function" && typeof g.Event === "function") {
      g.dispatchEvent(new g.Event(POPUP_SHOWN_CHANGED_EVENT));
    }
  } catch {
    // Non-browser environment: no listeners exist anyway.
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Subscription popup memory (R-18–R-24)                               */
/* ------------------------------------------------------------------ */

export interface SubscriptionMemory {
  /** When the visitor last closed the subscription popup
   * themselves (ms epoch). Coordination deferrals NEVER set
   * this — the 7-day cooldown counts only from a real close. */
  dismissedAt: number | null;
  /** When a subscription was submitted from this browser
   * (verification still pending). */
  submittedAt: number | null;
  /** Verification completed in this browser. */
  verified: boolean;
  /** The subscription's random UUID, learned from the verify
   * response (never an email, token or secret — R-24 holds).
   * Lets the site notice an Admin delete (the subscription no
   * longer exists server-side) and offer the popup again —
   * owner's rule, 2026-10-27. */
  subscriberId: string | null;
}

export const EMPTY_SUBSCRIPTION_MEMORY: SubscriptionMemory = {
  dismissedAt: null,
  submittedAt: null,
  verified: false,
  subscriberId: null,
};

function asTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function parseSubscriptionMemory(raw: string | null): SubscriptionMemory {
  if (!raw) return { ...EMPTY_SUBSCRIPTION_MEMORY };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_SUBSCRIPTION_MEMORY };
    const obj = parsed as Record<string, unknown>;
    return {
      dismissedAt: asTimestamp(obj.dismissedAt),
      submittedAt: asTimestamp(obj.submittedAt),
      verified: obj.verified === true,
      subscriberId:
        typeof obj.subscriberId === "string" && obj.subscriberId.length > 0
          ? obj.subscriberId
          : null,
    };
  } catch {
    return { ...EMPTY_SUBSCRIPTION_MEMORY };
  }
}

export function readSubscriptionMemory(
  storage: KeyValueStorage | null = browserStorage(),
): SubscriptionMemory {
  if (!storage) return { ...EMPTY_SUBSCRIPTION_MEMORY };
  try {
    return parseSubscriptionMemory(storage.getItem(SUBSCRIPTION_MEMORY_KEY));
  } catch {
    return { ...EMPTY_SUBSCRIPTION_MEMORY };
  }
}

export function writeSubscriptionMemory(
  patch: Partial<SubscriptionMemory>,
  storage: KeyValueStorage | null = browserStorage(),
): SubscriptionMemory {
  const next = { ...readSubscriptionMemory(storage), ...patch };
  if (storage) {
    try {
      storage.setItem(SUBSCRIPTION_MEMORY_KEY, JSON.stringify(next));
    } catch {
      // As above: memory is a convenience, never an error source.
    }
  }
  return next;
}

/** The visitor closed the subscription popup themselves: the
 * 7-day cooldown (R-5) starts from this moment — and only from
 * this kind of close (D-5). */
export function markSubscriptionDismissed(
  nowMs: number,
  storage: KeyValueStorage | null = browserStorage(),
): SubscriptionMemory {
  return writeSubscriptionMemory({ dismissedAt: nowMs }, storage);
}

/** A subscription was submitted from this browser (pending). */
export function markSubscriptionSubmitted(
  nowMs: number,
  storage: KeyValueStorage | null = browserStorage(),
): SubscriptionMemory {
  return writeSubscriptionMemory({ submittedAt: nowMs }, storage);
}

/** Verification completed in this browser (R-18). The verify
 * response's subscription id is remembered with it when the
 * server provided one (see SubscriptionMemory.subscriberId). */
export function markSubscriptionVerified(
  subscriberId?: string,
  storage: KeyValueStorage | null = browserStorage(),
): SubscriptionMemory {
  return writeSubscriptionMemory(
    {
      verified: true,
      ...(typeof subscriberId === "string" && subscriberId
        ? { subscriberId }
        : {}),
    },
    storage,
  );
}

/** Unsubscribe completed in this browser: the local verified
 * mark must not survive it (R-23). */
export function clearSubscriptionVerified(
  storage: KeyValueStorage | null = browserStorage(),
): SubscriptionMemory {
  return writeSubscriptionMemory(
    { verified: false, submittedAt: null, subscriberId: null },
    storage,
  );
}

/** Gap between two showings of the subscription popup
 * (owner's rule, 2026-11-01: the popup returns every 5 minutes).
 * Supersedes the earlier 7-day cooldown. */
export const SUBSCRIPTION_COOLDOWN_MS = 5 * 60 * 1000;

/** Whether the subscription popup may be offered for this
 * memory (owner's rule, 2026-11-01): it may — for EVERY visitor,
 * subscribed or not — as long as the last showing ended at
 * least SUBSCRIPTION_COOLDOWN_MS ago. This supersedes the
 * earlier rules that suppressed the popup forever once this
 * browser had subscribed (R-19) or had a submission pending:
 * one subscription is per EMAIL (enforced server-side), and a
 * subscribed visitor who re-enters the same email is answered
 * by the form's already-subscribed message instead. */
export function subscriptionPopupAllowed(
  memory: SubscriptionMemory,
  nowMs: number,
): boolean {
  if (memory.dismissedAt !== null && nowMs - memory.dismissedAt < SUBSCRIPTION_COOLDOWN_MS) {
    return false;
  }
  return true;
}
