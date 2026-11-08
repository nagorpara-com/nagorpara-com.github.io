/**
 * Subscriber core logic (Phase C / C2) — SERVER-SIDE ONLY.
 *
 * Implements the flows designed in migration draft 0014:
 * subscribe (double opt-in), verify, resend, unsubscribe.
 * This module is storage- and mail-agnostic: the Edge Functions
 * inject a SubscriberStore (Supabase, service role) and a mail
 * sender built on ../_shared/email.ts, which keeps every rule
 * here unit-testable and keeps SQL/transport details out.
 *
 * Security invariants enforced in this file:
 * - Emails are normalized (trim + lowercase) and validated on the
 *   server; nothing trusts the browser's checks.
 * - Verification tokens are 32 random bytes; only their SHA-256
 *   hash is stored; they expire after 48 hours and are consumed
 *   by ONE guarded (compare-and-swap) update, so a token can
 *   never verify twice — even under concurrent requests.
 * - Resends are throttled (min 60s between sends, max 3 sends
 *   per 24 hours — owner's rule, 2026-10-27) and always rotate
 *   the token — issuing a new token instantly kills every
 *   older link.
 * - The public subscribe/resend outcome NEVER reveals whether
 *   an address exists or what state it is in; the outcome codes
 *   returned here are for server logs/tests only and the HTTP
 *   layer answers identically in every case.
 * - Unsubscribe links are stateless HMAC signatures over the
 *   subscriber id (see migration 0014 header for the accepted
 *   trade-off: rotating the signing secret invalidates links).
 * - Logs use masked addresses only (via email.ts) and never
 *   contain tokens, secrets, or message content.
 */

import { logEmailEvent, maskEmail } from "./email.ts";

export type SubscriberStatus = "pending" | "verified" | "unsubscribed";

export interface SubscriberRow {
  id: string;
  email: string;
  status: SubscriberStatus;
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  verification_sent_count: number;
  last_verification_sent_at: string | null;
  consent_at: string;
  verified_at: string | null;
  unsubscribed_at: string | null;
  source: "website" | "admin";
  created_at: string;
}

export interface SubscriberStore {
  findByEmail(email: string): Promise<SubscriberRow | null>;
  findById(id: string): Promise<SubscriberRow | null>;
  findByTokenHash(hash: string): Promise<SubscriberRow | null>;
  insert(row: Partial<SubscriberRow>): Promise<SubscriberRow>;
  /** Plain update by id (admin/unsubscribe paths). */
  update(id: string, patch: Partial<SubscriberRow>): Promise<void>;
  /**
   * Guarded update: applies `patch` only if the row still matches
   * every field of `guard`. Returns true iff a row changed. This
   * is the atomic token-consume primitive.
   */
  updateGuarded(
    id: string,
    guard: Partial<SubscriberRow>,
    patch: Partial<SubscriberRow>,
  ): Promise<boolean>;
  /** Hard delete by id — the ONLY way a subscriber leaves the
   * list (owner's rule, 2026-10-27: no unsubscribed/inactive
   * state is kept). */
  remove(id: string): Promise<void>;
  removeDeliveriesByEmail(email: string): Promise<void>;
  list(options: {
    status?: SubscriberStatus;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: SubscriberRow[]; total: number }>;
}

export class SubscriberValidationError extends Error {
  readonly code = "SUBSCRIBER_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "SubscriberValidationError";
  }
}

/**
 * Disposable / throwaway email domains (owner's rule,
 * 2026-10-27): subscriptions from these providers are refused
 * — the address exists for minutes, so consent given through
 * it is worthless and the announcement list fills with dead
 * addresses. Extend the block in THIS one place. The refusal
 * is a distinct error (not a validation failure) so the public
 * forms can explain it honestly; it reveals nothing about any
 * other address, only about the caller's own input.
 */
export class DisposableEmailError extends Error {
  readonly code = "DISPOSABLE_EMAIL";
  constructor(domain: string) {
    super(`Disposable email domain refused: ${domain}`);
    this.name = "DisposableEmailError";
  }
}

export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "bccto.me",
  "burnermail.io",
  "discard.email",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamailblock.com",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailinator.net",
  "mailinator2.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "mytemp.email",
  "nada.email",
  "pokemail.net",
  "sharklasers.com",
  "spamgourmet.com",
  "temp-mail.org",
  "tempmail.com",
  "tempail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

export class SubscriberConfigError extends Error {
  readonly code = "SUBSCRIBER_NOT_CONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "SubscriberConfigError";
  }
}

// ---------------------------------------------------------------------------
// Tokens & signatures (WebCrypto — available in Deno and Node)
// ---------------------------------------------------------------------------

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison for equal-length strings (hashes/signatures). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signUnsubscribe(
  subscriberId: string,
  secret: string,
): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(subscriberId),
  );
  return base64Url(new Uint8Array(sig));
}

export async function verifyUnsubscribeSignature(
  subscriberId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await signUnsubscribe(subscriberId, secret);
  return timingSafeEqual(expected, signature);
}

// ---------------------------------------------------------------------------
// Validation & constants
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
export const RESEND_MIN_INTERVAL_MS = 60 * 1000; // 60 seconds
/** Owner's rule (2026-10-27): a pending address may be sent at
 * most 3 verification emails per 24 hours. The stored counter
 * restarts once a full window has passed since the last send,
 * which makes the cap a rolling 24-hour one. */
export const RESEND_MAX_PER_DAY = 3;
export const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new SubscriberValidationError("Email is required.");
  }
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new SubscriberValidationError("Email address is invalid.");
  }
  return email;
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export interface FlowDeps {
  store: SubscriberStore;
  /** Sends the verification email; built on the C4 mail library. */
  sendVerificationEmail: (to: string, verifyLink: string) => Promise<void>;
  /** Builds the public verification link for a raw token. */
  buildVerifyLink: (rawToken: string) => string;
  now: () => Date;
}

export type SubscribeOutcome =
  | "sent-new"
  | "sent-resend"
  | "sent-resubscribed"
  | "already-verified"
  | "throttled"
  | "send-failed";

async function issueTokenAndSend(
  deps: FlowDeps,
  row: SubscriberRow,
  extraPatch: Partial<SubscriberRow>,
  baseCount: number = row.verification_sent_count,
): Promise<"sent" | "send-failed"> {
  const rawToken = generateToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = deps.now();
  await deps.store.update(row.id, {
    ...extraPatch,
    verification_token_hash: tokenHash,
    verification_expires_at: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
    verification_sent_count: baseCount + 1,
    last_verification_sent_at: now.toISOString(),
  });
  try {
    await deps.sendVerificationEmail(
      row.email,
      deps.buildVerifyLink(rawToken),
    );
    logEmailEvent({ event: "verification_sent", to: maskEmail(row.email) });
    return "sent";
  } catch {
    // The row keeps its (unreceived) token; the visitor can resend
    // after the throttle interval. Never surface mail internals.
    logEmailEvent({ event: "verification_send_failed", to: maskEmail(row.email) });
    return "send-failed";
  }
}

/**
 * Subscribe (also the engine behind resend — same public shape).
 * The returned outcome is INTERNAL (logs/tests); HTTP callers must
 * answer identically for every outcome except validation errors.
 */
export async function subscribeFlow(
  deps: FlowDeps,
  rawEmail: unknown,
  source: "website" | "admin" = "website",
): Promise<{ outcome: SubscribeOutcome }> {
  const email = normalizeEmail(rawEmail);
  if (isDisposableEmail(email)) {
    throw new DisposableEmailError(email.slice(email.lastIndexOf("@") + 1));
  }
  const now = deps.now();
  let row = await deps.store.findByEmail(email);

  if (!row) {
    const rawToken = generateToken();
    const tokenHash = await sha256Hex(rawToken);
    let inserted = false;
    try {
      row = await deps.store.insert({
        email,
        status: "pending",
        source,
        consent_at: now.toISOString(),
        verification_token_hash: tokenHash,
        verification_expires_at: new Date(
          now.getTime() + TOKEN_TTL_MS,
        ).toISOString(),
        verification_sent_count: 1,
        last_verification_sent_at: now.toISOString(),
      });
      inserted = true;
    } catch {
      // Lost a race against a concurrent subscribe for the same
      // address — the unique constraint held; continue below with
      // the row that now exists (the winner's token is the live
      // one; only the winner sends, so exactly one link works).
      row = await deps.store.findByEmail(email);
      if (!row) throw new Error("subscribe: row vanished after insert race");
    }
    if (inserted) {
      try {
        await deps.sendVerificationEmail(email, deps.buildVerifyLink(rawToken));
        logEmailEvent({ event: "verification_sent", to: maskEmail(email) });
        return { outcome: "sent-new" };
      } catch {
        logEmailEvent({ event: "verification_send_failed", to: maskEmail(email) });
        return { outcome: "send-failed" };
      }
    }
  }

  if (row.status === "verified") {
    return { outcome: "already-verified" };
  }

  if (row.status === "unsubscribed") {
    const sent = await issueTokenAndSend(
      deps,
      row,
      {
        status: "pending",
        consent_at: now.toISOString(),
        unsubscribed_at: null,
        verified_at: null,
      },
      0, // a fresh consent restarts the send allowance
    );
    return { outcome: sent === "sent" ? "sent-resubscribed" : "send-failed" };
  }

  // status === 'pending' — resend rules.
  const lastSent = row.last_verification_sent_at
    ? new Date(row.last_verification_sent_at).getTime()
    : 0;
  const sinceLast = now.getTime() - lastSent;
  // The daily allowance: sends older than the 24-hour window no
  // longer count, so the stored counter restarts from zero.
  const usedInWindow =
    sinceLast >= RESEND_WINDOW_MS ? 0 : row.verification_sent_count;
  if (
    sinceLast < RESEND_MIN_INTERVAL_MS ||
    usedInWindow >= RESEND_MAX_PER_DAY
  ) {
    logEmailEvent({ event: "verification_throttled", to: maskEmail(email) });
    return { outcome: "throttled" };
  }
  const sent = await issueTokenAndSend(deps, row, {}, usedInWindow);
  return { outcome: sent === "sent" ? "sent-resend" : "send-failed" };
}

export interface InstantFlowDeps {
  store: SubscriberStore;
  /** Sends the (once-only, settings-gated) welcome email. */
  sendWelcome: (row: SubscriberRow) => Promise<void>;
  now: () => Date;
}

export type InstantSubscribeOutcome =
  | "subscribed-new"
  | "subscribed-activated"
  | "subscribed-reactivated"
  | "already-verified";

/**
 * Instant subscribe (owner's model change, 2026-10-27 evening —
 * supersedes the Prompt 2 double opt-in decision): subscribing
 * activates the subscription IMMEDIATELY. There is no pending
 * state and no verification link for new signups; the welcome
 * email goes out at once through the injected sender (which is
 * settings-gated and idempotency-claimed, so it can never send
 * twice for the same subscriber).
 *
 * - no row        insert already-verified + welcome
 * - pending row   flip to verified + welcome (legacy signups)
 * - unsubscribed  flip to verified + welcome (the claim may
 *   already exist from a previous life — then nothing sends)
 * - verified row  nothing changes, no welcome
 *
 * The legacy verify flow below remains only for verification
 * links already sitting in inboxes.
 */
export async function subscribeInstantFlow(
  deps: InstantFlowDeps,
  rawEmail: unknown,
  source: "website" | "admin" = "website",
): Promise<{ outcome: InstantSubscribeOutcome; subscriberId: string }> {
  const email = normalizeEmail(rawEmail);
  if (isDisposableEmail(email)) {
    throw new DisposableEmailError(email.slice(email.lastIndexOf("@") + 1));
  }
  const now = deps.now();
  let row = await deps.store.findByEmail(email);

  if (!row) {
    try {
      row = await deps.store.insert({
        email,
        status: "verified",
        source,
        consent_at: now.toISOString(),
        verified_at: now.toISOString(),
        verification_token_hash: null,
        verification_expires_at: null,
        verification_sent_count: 0,
        last_verification_sent_at: null,
      });
    } catch {
      // Lost a race against a concurrent subscribe — continue
      // with the row that now exists; the welcome claim is
      // idempotent, so exactly one welcome can ever go out.
      row = await deps.store.findByEmail(email);
      if (!row) throw new Error("subscribe: row vanished after insert race");
      if (row.status === "verified") {
        return { outcome: "already-verified", subscriberId: row.id };
      }
    }
    if (row.status === "verified" && row.email === email) {
      await deps.sendWelcome(row).catch(() => {
        // The welcome is a courtesy layered AFTER activation:
        // its failure never un-verifies the subscriber (the
        // sender logs its own masked failure event).
        logEmailEvent({ event: "welcome_dispatch_failed", to: maskEmail(email) });
      });
      logEmailEvent({ event: "subscriber_activated", to: maskEmail(email) });
      return { outcome: "subscribed-new", subscriberId: row.id };
    }
  }

  if (row.status === "verified") {
    return { outcome: "already-verified", subscriberId: row.id };
  }

  const wasUnsubscribed = row.status === "unsubscribed";
  await deps.store.update(row.id, {
    status: "verified",
    verified_at: now.toISOString(),
    consent_at: now.toISOString(),
    unsubscribed_at: null,
    verification_token_hash: null,
    verification_expires_at: null,
  });
  const activated: SubscriberRow = {
    ...row,
    status: "verified",
    verified_at: now.toISOString(),
  };
  await deps.sendWelcome(activated).catch(() => {
    logEmailEvent({ event: "welcome_dispatch_failed", to: maskEmail(email) });
  });
  logEmailEvent({ event: "subscriber_activated", to: maskEmail(email) });
  return {
    outcome: wasUnsubscribed ? "subscribed-reactivated" : "subscribed-activated",
    subscriberId: row.id,
  };
}

export type VerifyOutcome =
  | "verified"
  | "already-verified"
  | "expired"
  | "invalid";

/** Verify an email token. Atomic: the consume is a guarded update. */
export async function verifyFlow(
  deps: FlowDeps,
  rawToken: unknown,
): Promise<{ outcome: VerifyOutcome }> {
  if (typeof rawToken !== "string" || rawToken.trim().length < 20) {
    return { outcome: "invalid" };
  }
  const tokenHash = await sha256Hex(rawToken.trim());
  const row = await deps.store.findByTokenHash(tokenHash);
  if (!row) return { outcome: "invalid" };
  if (row.status === "verified") return { outcome: "already-verified" };
  if (row.status !== "pending") return { outcome: "invalid" };

  const expires = row.verification_expires_at
    ? new Date(row.verification_expires_at).getTime()
    : 0;
  if (deps.now().getTime() > expires) return { outcome: "expired" };

  const consumed = await deps.store.updateGuarded(
    row.id,
    { status: "pending", verification_token_hash: tokenHash },
    {
      status: "verified",
      verified_at: deps.now().toISOString(),
      verification_expires_at: null,
      // The hash is RETAINED, inert: the status guard above makes
      // reuse impossible, and keeping it lets a repeat click on
      // the same link be answered "already verified" instead of
      // the misleading "invalid". It is cleared on unsubscribe
      // and overwritten on any re-subscription.
    },
  );
  if (consumed) {
    logEmailEvent({ event: "subscription_verified", to: maskEmail(row.email) });
    return { outcome: "verified" };
  }
  // Lost a race (a double-click, or two tabs): if the row is now
  // verified, that is the friendly answer; anything else is invalid.
  const fresh = await deps.store.findById(row.id);
  return {
    outcome: fresh?.status === "verified" ? "already-verified" : "invalid",
  };
}

export type UnsubscribeOutcome =
  | "unsubscribed"
  | "already-unsubscribed"
  | "invalid-signature";

/**
 * Unsubscribe via the HMAC-signed link token.
 *
 * Since 2026-10-27 (owner's rule) leaving the list DELETES the
 * row — there is no kept 'unsubscribed' state. A validly-signed
 * click for an id whose row is already gone (a second click on
 * the same link) is answered "already-unsubscribed": the signed
 * link itself proves the holder was entitled to ask, so this
 * confirms nothing an attacker could use — a bad signature is
 * still refused uniformly as "invalid-signature".
 */
export async function unsubscribeFlow(
  deps: FlowDeps,
  subscriberId: unknown,
  signature: unknown,
  signingSecret: string,
): Promise<{ outcome: UnsubscribeOutcome }> {
  if (
    typeof subscriberId !== "string" ||
    typeof signature !== "string" ||
    !signingSecret
  ) {
    return { outcome: "invalid-signature" };
  }
  const valid = await verifyUnsubscribeSignature(
    subscriberId,
    signature,
    signingSecret,
  );
  if (!valid) return { outcome: "invalid-signature" };
  const row = await deps.store.findById(subscriberId);
  if (!row) return { outcome: "already-unsubscribed" };
  // Same rule as the admin delete (2026-11-02): once a subscriber
  // is removed, their delivery records go too — the address
  // remains in no section of the panel.
  await deps.store.removeDeliveriesByEmail(row.email);
  await deps.store.remove(row.id);
  logEmailEvent({ event: "unsubscribed", to: maskEmail(row.email) });
  return { outcome: "unsubscribed" };
}

// ---------------------------------------------------------------------------
// Admin authorization (server-side, for the admin function)
// ---------------------------------------------------------------------------

export interface AdminChecker {
  /** Resolves the caller's auth user id from a bearer token. */
  getUserId(bearerToken: string): Promise<string | null>;
  /** Reads the caller's profile (role + active) by user id. */
  getProfile(
    userId: string,
  ): Promise<{ role: string; is_active: boolean } | null>;
  /** Optional: the caller's own auth email (used only to send
   * the admin a test email addressed to themselves). */
  getUserEmail?(bearerToken: string): Promise<string | null>;
}

/**
 * A caller is an authorized admin only with a valid session whose
 * profile is ACTIVE and has role 'admin'. Anything else — no
 * token, unknown user, missing/inactive profile, other role —
 * is refused. (RLS independently restricts table access; this is
 * the function-level gate the owner required.)
 */
export async function authorizeAdmin(
  checker: AdminChecker,
  bearerToken: string | null,
): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (!bearerToken) return { ok: false };
  const userId = await checker.getUserId(bearerToken);
  if (!userId) return { ok: false };
  const profile = await checker.getProfile(userId);
  if (!profile || !profile.is_active || profile.role !== "admin") {
    return { ok: false };
  }
  return { ok: true, userId };
}
