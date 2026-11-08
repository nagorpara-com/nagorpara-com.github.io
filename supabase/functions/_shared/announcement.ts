/**
 * Notice announcement delivery — PURE LOGIC + ENGINE (Phase C /
 * C3 Step D, server-side only). The HTTP handler
 * (send-announcement/index.ts) authorizes the caller and wires
 * this engine to the Supabase store and the C4 Gmail mailer;
 * everything testable without a network lives here.
 *
 * The delivery contract is Migration 0015's (see that file's
 * header — it is the specification this code implements):
 * - One row per (notice, recipient), inserted 'pending' with
 *   ON CONFLICT DO NOTHING semantics — a row, once 'sent', is
 *   never emailed again for that notice.
 * - Sending works by ATOMIC CLAIM: one guarded update flips a
 *   'pending'/'failed' row to 'sending' and increments attempts.
 *   Exactly one concurrent run can win a row.
 * - The outcome is recorded with a GUARDED update keyed on the
 *   claimed attempts value, so a stale process can never
 *   overwrite a newer state.
 * - A 'sending' row older than the staleness threshold is NOT
 *   auto-resent: it is closed as 'failed' with an OUTCOME_UNKNOWN
 *   error (below), because the previous run may have delivered
 *   the email and died before recording it. A human retries it
 *   from the admin report, accepting the duplicate risk. Rows
 *   closed stale in THIS run are never claimed in this run.
 * - 'sent' means "Gmail accepted the message" — never "it
 *   reached the inbox" (Gmail SMTP gives no delivery signal).
 *
 * Recipients are ONLY the currently verified subscribers
 * (email_subscribers.status = 'verified' — the one active state;
 * the table has no separate active flag). A seeded row whose
 * address is no longer verified at run time is skipped without a
 * state change.
 *
 * This module imports nothing Deno- or Supabase-specific, so the
 * whole engine is unit-testable in plain Node with fake stores.
 */

import { SubscriberConfigError } from "./subscribers.ts";
import type { EmailFooter } from "./emailFooter.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A claim older than this is treated as an interrupted run. */
export const STALE_SENDING_MS = 15 * 60 * 1000; // 15 minutes

/** Rows claimed per function invocation; the admin runs it again
 *  to continue a larger list (Gmail's daily cap is ~500 anyway). */
export const BATCH_LIMIT = 25;

/**
 * Stored as the `error` of a row closed from a stale 'sending'
 * state. The prefix is a machine-readable marker: the admin UI
 * detects it to badge the row "অনিশ্চিত" (uncertain) and to warn
 * before a retry. Keep in sync with src/utils/announcement.ts.
 */
export const UNCERTAIN_ERROR_PREFIX = "OUTCOME_UNKNOWN:";
export const UNCERTAIN_ERROR =
  `${UNCERTAIN_ERROR_PREFIX} আগের প্রচেষ্টা মাঝপথে থেমে গিয়েছিল — ` +
  "ইমেইলটি Gmail গ্রহণ করে থাকতে পারে, কিন্তু ফলাফল লিপিবদ্ধ হয়নি।";

/** True when a failed row's outcome is unknown (see above). */
export function isUncertainError(error: string | null): boolean {
  return typeof error === "string" && error.startsWith(UNCERTAIN_ERROR_PREFIX);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryStatus = "pending" | "sending" | "sent" | "failed";

export interface DeliveryRow {
  id: string;
  post_id: string;
  recipient_kind: "subscriber" | "member";
  recipient_email: string;
  status: DeliveryStatus;
  provider_message_id: string | null;
  error: string | null;
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface AnnouncementPost {
  id: string;
  type: string;
  title: string;
  slug: string;
  content: string | null;
  is_published: boolean;
  /** Optional call-to-action (migration 0027): both or neither. */
  button_text?: string | null;
  button_url?: string | null;
}

export interface VerifiedSubscriberRef {
  id: string;
  email: string;
}

export interface AnnouncementStore {
  getPost(postId: string): Promise<AnnouncementPost | null>;
  /** Subscribers whose status is 'verified' right now. */
  listVerifiedSubscribers(): Promise<VerifiedSubscriberRef[]>;
  /** Insert 'pending' rows; existing (post, kind, email) triples
   *  are ignored (the 0015 UNIQUE constraint is the backstop). */
  insertPending(postId: string, emails: string[]): Promise<void>;
  listDeliveries(postId: string): Promise<DeliveryRow[]>;
  /**
   * ATOMIC CLAIM: if the row's status is one of `claimable`, flip
   * it to 'sending', increment attempts, stamp last_attempt_at,
   * clear error — as ONE guarded update. Returns the claimed row
   * (with its NEW attempts value) or null when another run holds
   * the row or its status is not claimable.
   */
  claim(
    id: string,
    claimable: DeliveryStatus[],
    nowIso: string,
  ): Promise<DeliveryRow | null>;
  /**
   * GUARDED outcome write: applies `patch` only while the row is
   * still 'sending' with exactly `attempts` — a stale claimer's
   * late write matches nothing. Returns whether it applied.
   */
  recordOutcome(
    id: string,
    attempts: number,
    patch: Partial<
      Pick<DeliveryRow, "status" | "provider_message_id" | "error" | "sent_at">
    >,
  ): Promise<boolean>;
  /**
   * Close 'sending' rows whose last attempt is older than
   * `cutoffIso` as 'failed' with the OUTCOME_UNKNOWN error.
   * Returns the ids closed (the engine excludes them from this
   * run's claim set — they are never auto-resent).
   */
  closeStaleSending(
    postId: string,
    cutoffIso: string,
    errorText: string,
  ): Promise<string[]>;
}

export interface AnnouncementDeps {
  store: AnnouncementStore;
  now: () => Date;
  /**
   * Send one announcement email; resolves with the provider
   * message id (or null). Throws on any send failure — the
   * engine records a short, safe error either way.
   */
  sendMail: (
    to: string,
    mail: { subject: string; text: string; html: string; unsubscribeUrl?: string },
  ) => Promise<{ messageId: string | null }>;
  /** Public link to the notice on the website. */
  buildViewLink: (slug: string) => string;
  /** Signed one-click unsubscribe link for a subscriber id. */
  buildUnsubscribeLink: (subscriberId: string) => Promise<string>;
  /** The shared email footer (organization + developer blocks),
   *  built by the caller from the configured site URL — appended
   *  to every announcement email automatically. */
  footer: EmailFooter;
}

// ---------------------------------------------------------------------------
// Configuration gate (names only — values live in Dashboard secrets)
// ---------------------------------------------------------------------------

export interface AnnouncementConfig {
  siteUrl: string;
  unsubscribeSecret: string;
}

/**
 * The send path refuses to run unless BOTH the public site URL
 * (email links must be real and openable on a phone) and the
 * unsubscribe signing secret (every announcement must carry a
 * working, unforgeable unsubscribe link) are configured. Throws
 * SubscriberConfigError listing the missing variable NAMES.
 */
export function readAnnouncementConfig(
  env: Record<string, string | undefined>,
): AnnouncementConfig {
  const missing: string[] = [];
  const siteUrl = (env.PUBLIC_SITE_URL ?? "").trim();
  const unsubscribeSecret = (env.UNSUBSCRIBE_SIGNING_SECRET ?? "").trim();
  if (!siteUrl) missing.push("PUBLIC_SITE_URL");
  if (!unsubscribeSecret) missing.push("UNSUBSCRIBE_SIGNING_SECRET");
  if (missing.length > 0) {
    throw new SubscriberConfigError(
      `Missing server environment variable(s): ${missing.join(", ")}`,
    );
  }
  return { siteUrl: siteUrl.replace(/\/+$/, ""), unsubscribeSecret };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface DeliverySummary {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  /** Subset of `failed` whose outcome is unknown (stale claims). */
  uncertain: number;
}

export function summarizeDeliveries(rows: DeliveryRow[]): DeliverySummary {
  const summary: DeliverySummary = {
    total: rows.length,
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    uncertain: 0,
  };
  for (const row of rows) {
    summary[row.status] += 1;
    if (row.status === "failed" && isUncertainError(row.error)) {
      summary.uncertain += 1;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Email content
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text excerpt of the notice body for the email. */
export function announcementExcerpt(content: string | null, max = 600): string {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function buildAnnouncementEmail(
  post: AnnouncementPost,
  viewLink: string,
  unsubscribeLink: string,
  footer: EmailFooter,
): { subject: string; text: string; html: string; unsubscribeUrl: string } {
  const subject = `নোটিশ: ${post.title}`.slice(0, 200);
  const excerpt = announcementExcerpt(post.content);
  // Optional CTA button (migration 0027): rendered only when the
  // pair is complete AND the URL is http(s) — the same rule the
  // database enforces, re-checked here at render time.
  const button =
    post.button_text &&
    post.button_url &&
    /^https?:\/\//i.test(post.button_url)
      ? { text: post.button_text, url: post.button_url }
      : null;
  const text = [
    "আসসালামু আলাইকুম,",
    "",
    `নগর পাড়া অগ্রগামী যুব সংঘ-এর নতুন নোটিশ: ${post.title}`,
    ...(excerpt ? ["", excerpt] : []),
    "",
    `সম্পূর্ণ নোটিশটি ওয়েবসাইটে পড়ুন: ${viewLink}`,
    ...(button ? ["", `${button.text}: ${button.url}`] : []),
    "",
    footer.text,
    "",
    "মেইলটি Promotions বা Spam ফোল্ডারে গেলে Primary ইনবক্সে সরিয়ে নিন — পরের নোটিশগুলো সরাসরি ইনবক্সে আসবে, মোবাইলে নোটিফিকেশনও পাবেন।",
    "",
    "—",
    "এই ইমেইলটি পাঠানো হয়েছে কারণ আপনি নোটিশ ও ঘোষণা ইমেইলে পেতে",
    "সাবস্ক্রাইব করেছেন। আর ইমেইল পেতে না চাইলে এখানে ক্লিক করুন:",
    unsubscribeLink,
  ].join("\n");
  const html = [
    '<div style="font-family: sans-serif; line-height: 1.7; color: #1a1a1a;">',
    "<p>আসসালামু আলাইকুম,</p>",
    `<p>নগর পাড়া অগ্রগামী যুব সংঘ-এর নতুন নোটিশ: <strong>${escapeHtml(post.title)}</strong></p>`,
    ...(excerpt ? [`<p>${escapeHtml(excerpt)}</p>`] : []),
    `<p><a href="${viewLink}" style="color: #17623D; font-weight: bold;">সম্পূর্ণ নোটিশটি ওয়েবসাইটে পড়ুন</a></p>`,
    ...(button
      ? [
          `<p style="margin: 18px 0;"><a href="${escapeHtml(button.url)}" style="display: inline-block; background: #17623D; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">${escapeHtml(button.text)}</a></p>`,
        ]
      : []),
    footer.html,
    `<p style="color: #555; font-size: 13px;">মেইলটি Promotions বা Spam ফোল্ডারে গেলে Primary ইনবক্সে সরিয়ে নিন — পরের নোটিশগুলো সরাসরি ইনবক্সে আসবে, মোবাইলে নোটিফিকেশনও পাবেন।</p>`,
    "<hr />",
    `<p style="color: #555; font-size: 13px;">এই ইমেইলটি পাঠানো হয়েছে কারণ আপনি নোটিশ ও ঘোষণা ইমেইলে পেতে সাবস্ক্রাইব করেছেন। আর ইমেইল পেতে না চাইলে <a href="${unsubscribeLink}">এখানে ক্লিক করে আনসাবস্ক্রাইব করুন</a>।</p>`,
    "</div>",
  ].join("");
  // unsubscribeUrl rides along so sendEmail can emit the
  // List-Unsubscribe headers for this recipient (owner's rule:
  // link in the body AND the one-click header, on every email).
  return { subject, text, html, unsubscribeUrl: unsubscribeLink };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export type DeliveryRunMode = "send" | "retry";

export interface DeliveryRunReport {
  claimed: number;
  sent: number;
  failed: number;
  /** Rows another concurrent run claimed first. */
  skippedRace: number;
  /** Seeded rows whose address is no longer a verified subscriber. */
  skippedNotVerified: number;
  /** Sends whose outcome could not be recorded (row left 'sending';
   *  it will surface as uncertain after the staleness threshold). */
  outcomeUnknown: number;
  /** Stale 'sending' rows closed as uncertain in this run. */
  staleClosed: number;
}

export type DeliveryEngineResult =
  | {
      ok: true;
      summary: DeliverySummary;
      verifiedSubscribers: number;
      run: DeliveryRunReport;
    }
  | { ok: false; code: "NOT_FOUND" | "NOT_NOTICE" | "NOT_PUBLISHED" };

const OUTCOME_WRITE_ATTEMPTS = 3;

async function recordOutcomeWithRetries(
  deps: AnnouncementDeps,
  id: string,
  attempts: number,
  patch: Parameters<AnnouncementStore["recordOutcome"]>[2],
): Promise<boolean> {
  for (let i = 0; i < OUTCOME_WRITE_ATTEMPTS; i++) {
    try {
      if (await deps.store.recordOutcome(id, attempts, patch)) return true;
      return false; // guard matched nothing — a newer state owns the row
    } catch {
      // Transient store failure: retry; the caller treats a final
      // failure as outcome-unknown rather than guessing.
    }
  }
  return false;
}

/**
 * Run one delivery pass for a published notice.
 *
 * mode "send": seed pending rows for every verified subscriber
 * (idempotent), then claim pending + failed rows.
 * mode "retry": no seeding; claim failed rows only. (Uncertain
 * rows are failed rows — the ADMIN's explicit retry action is
 * the human decision the 0015 contract requires for them.)
 *
 * Email failure NEVER touches the post: publishing state is the
 * website's concern; this engine only writes delivery rows.
 */
export async function runDelivery(
  deps: AnnouncementDeps,
  postId: string,
  mode: DeliveryRunMode,
): Promise<DeliveryEngineResult> {
  const post = await deps.store.getPost(postId);
  if (!post) return { ok: false, code: "NOT_FOUND" };
  if (post.type !== "notice") return { ok: false, code: "NOT_NOTICE" };
  if (!post.is_published) return { ok: false, code: "NOT_PUBLISHED" };

  const now = deps.now();
  const cutoffIso = new Date(now.getTime() - STALE_SENDING_MS).toISOString();

  // 1) Close stale claims as outcome-unknown — never auto-resent,
  //    and excluded from this run's claim set even in retry mode
  //    (the admin's retry decision was made on the counts shown
  //    BEFORE this run; a row that only just went stale joins the
  //    NEXT decision, with its uncertain badge visible).
  const staleClosedIds = new Set(
    await deps.store.closeStaleSending(postId, cutoffIso, UNCERTAIN_ERROR),
  );

  // 2) Verified recipients snapshot for this run.
  const verified = await deps.store.listVerifiedSubscribers();
  const verifiedByEmail = new Map(verified.map((s) => [s.email, s.id]));

  // 3) Seed (send mode only) — idempotent via the UNIQUE triple.
  if (mode === "send" && verified.length > 0) {
    await deps.store.insertPending(
      postId,
      verified.map((s) => s.email),
    );
  }

  // 4) Claim send record, one row at a time.
  const claimable: DeliveryStatus[] =
    mode === "send" ? ["pending", "failed"] : ["failed"];
  const rows = await deps.store.listDeliveries(postId);
  const candidates = rows
    .filter((r) => claimable.includes(r.status) && !staleClosedIds.has(r.id))
    .slice(0, BATCH_LIMIT);

  const run: DeliveryRunReport = {
    claimed: 0,
    sent: 0,
    failed: 0,
    skippedRace: 0,
    skippedNotVerified: 0,
    outcomeUnknown: 0,
    staleClosed: staleClosedIds.size,
  };

  for (const candidate of candidates) {
    const subscriberId = verifiedByEmail.get(candidate.recipient_email);
    if (!subscriberId) {
      // No longer a verified subscriber — never email; the row
      // stays as-is (visible in the report as pending/failed).
      run.skippedNotVerified += 1;
      continue;
    }
    const claimed = await deps.store.claim(
      candidate.id,
      claimable,
      deps.now().toISOString(),
    );
    if (!claimed) {
      run.skippedRace += 1;
      continue;
    }
    run.claimed += 1;

    const unsubscribeLink = await deps.buildUnsubscribeLink(subscriberId);
    const mail = buildAnnouncementEmail(
      post,
      deps.buildViewLink(post.slug),
      unsubscribeLink,
      deps.footer,
    );

    let patch: Parameters<AnnouncementStore["recordOutcome"]>[2];
    try {
      const { messageId } = await deps.sendMail(claimed.recipient_email, mail);
      patch = {
        status: "sent",
        sent_at: deps.now().toISOString(),
        provider_message_id: messageId,
        error: null,
      };
    } catch {
      // The mailer's errors are already safe (no credentials, no
      // content); store a short generic reason regardless.
      patch = { status: "failed", error: "EMAIL_SEND_FAILED" };
    }

    const recorded = await recordOutcomeWithRetries(
      deps,
      claimed.id,
      claimed.attempts,
      patch,
    );
    if (!recorded) {
      run.outcomeUnknown += 1;
    } else if (patch.status === "sent") {
      run.sent += 1;
    } else {
      run.failed += 1;
    }
  }

  const after = await deps.store.listDeliveries(postId);
  return {
    ok: true,
    summary: summarizeDeliveries(after),
    verifiedSubscribers: verified.length,
    run,
  };
}

/** Read-only report used by preview/report actions. */
export async function deliveryReport(
  deps: AnnouncementDeps,
  postId: string,
): Promise<
  | {
      ok: true;
      post: AnnouncementPost;
      summary: DeliverySummary;
      verifiedSubscribers: number;
    }
  | { ok: false; code: "NOT_FOUND" }
> {
  const post = await deps.store.getPost(postId);
  if (!post) return { ok: false, code: "NOT_FOUND" };
  const [rows, verified] = await Promise.all([
    deps.store.listDeliveries(postId),
    deps.store.listVerifiedSubscribers(),
  ]);
  return {
    ok: true,
    post,
    summary: summarizeDeliveries(rows),
    verifiedSubscribers: verified.length,
  };
}
