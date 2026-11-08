/**
 * Shared email foundation (Phase C / C4) — SERVER-SIDE ONLY.
 *
 * This module runs inside Supabase Edge Functions (Deno). It must
 * NEVER be imported by the frontend: it reads secrets from the
 * function's environment and talks to Gmail SMTP.
 *
 * Design rules (owner's security requirements):
 * - Secrets come ONLY from environment variables set in the
 *   Supabase Dashboard (Edge Functions > Secrets). Nothing is
 *   hardcoded, and no secret is ever logged or returned.
 * - Logs contain only: event name, outcome, SMTP code and a MASKED
 *   recipient (first character + domain). Never the password,
 *   never the full address, never the subject or body.
 * - Every send has timeouts (SMTP-level + an overall guard), and
 *   failures surface as typed errors with safe codes — callers
 *   (C2 verification mail, C3 notice delivery) decide what to do;
 *   a failed email never blocks the caller's own database work.
 *
 * Feasibility basis (audited in docs/NEXT_PHASE_ROADMAP.md, Phase C
 * Revised / C4): Gmail SMTP with an App Password is the launch path
 * for sending as the organization's Gmail address. It provides NO
 * bounce/delivery webhooks, so delivery status beyond
 * sent/failed is not available on this path — callers must not
 * claim otherwise.
 */

export const EMAIL_ENV_KEYS = {
  address: "GMAIL_ADDRESS",
  appPassword: "GMAIL_APP_PASSWORD",
  internalSecret: "INTERNAL_FUNCTION_SECRET",
} as const;

export interface EmailConfig {
  /** The Gmail address mail is sent from (the organization's). */
  address: string;
  /** Gmail App Password — a secret; never logged or returned. */
  appPassword: string;
  /** Display name shown to recipients (ASCII for header safety). */
  fromName: string;
}

export class EmailNotConfiguredError extends Error {
  readonly code = "EMAIL_NOT_CONFIGURED";
  /** Names of the missing variables — names only, never values. */
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `Email is not configured on the server. Missing environment variable(s): ${missing.join(", ")}`,
    );
    this.name = "EmailNotConfiguredError";
    this.missing = missing;
  }
}

export class EmailValidationError extends Error {
  readonly code = "EMAIL_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "EmailValidationError";
  }
}

export class EmailSendError extends Error {
  readonly code: string;
  readonly smtpCode: number | null;
  constructor(code: string, smtpCode: number | null, message: string) {
    super(message);
    this.name = "EmailSendError";
    this.code = code;
    this.smtpCode = smtpCode;
  }
}

/**
 * Read and validate the email configuration from an environment
 * record (Deno.env.toObject() in the function; a plain object in
 * tests). Throws EmailNotConfiguredError listing the missing
 * variable NAMES when anything required is absent.
 */
export function readEmailConfig(
  env: Record<string, string | undefined>,
): EmailConfig {
  const address = (env[EMAIL_ENV_KEYS.address] ?? "").trim();
  const appPassword = (env[EMAIL_ENV_KEYS.appPassword] ?? "").trim();
  const missing: string[] = [];
  if (!address) missing.push(EMAIL_ENV_KEYS.address);
  if (!appPassword) missing.push(EMAIL_ENV_KEYS.appPassword);
  if (missing.length > 0) throw new EmailNotConfiguredError(missing);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new EmailNotConfiguredError([
      `${EMAIL_ENV_KEYS.address} (not a valid email address)`,
    ]);
  }
  return {
    address,
    appPassword,
    fromName: "Nagar Para Agragami Youth Sangha",
  };
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** The recipient's signed one-click unsubscribe URL. When
   * present, sendEmail emits the RFC 8058 List-Unsubscribe +
   * List-Unsubscribe-Post headers (owner's rule: EVERY
   * subscriber email carries both the in-body link and the
   * header). Absent for mail with no subscription context
   * (e.g. the admin test send). */
  unsubscribeUrl?: string;
}

const LIMITS = { subject: 200, text: 20_000, html: 50_000 } as const;

/** Validate an outgoing message; throws EmailValidationError. */
export function validateMessage(input: Partial<EmailMessage>): EmailMessage {
  const to = (input.to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new EmailValidationError("Recipient email address is invalid.");
  }
  const subject = (input.subject ?? "").trim();
  if (!subject) throw new EmailValidationError("Subject is required.");
  if (subject.length > LIMITS.subject) {
    throw new EmailValidationError("Subject is too long.");
  }
  const text = input.text ?? "";
  if (!text.trim()) throw new EmailValidationError("Message body is required.");
  if (text.length > LIMITS.text) {
    throw new EmailValidationError("Message body is too long.");
  }
  const html = input.html;
  if (html !== undefined && html.length > LIMITS.html) {
    throw new EmailValidationError("HTML body is too long.");
  }
  const unsubscribeUrl = input.unsubscribeUrl;
  if (unsubscribeUrl !== undefined && !/^https?:\/\/\S+$/.test(unsubscribeUrl)) {
    throw new EmailValidationError("Unsubscribe URL is invalid.");
  }
  return { to, subject, text, html, unsubscribeUrl };
}

/** Mask an address for logs: "n•••@gmail.com". */
/**
 * One logical delivery = up to 3 physical tries with
 * exponential backoff between them (owner's rule, 2026-10-27:
 * retry at most 3 times, then the caller records failed).
 * `delaysMs[i]` is the wait AFTER try i+1 fails; with the
 * default [1000, 3000] the tries happen at 0s, +1s, +4s.
 * `sleep` is injectable so unit tests never actually wait.
 * Returns how many tries were made so the caller can add them
 * to the delivery log's attempts counter.
 */
export async function attemptDelivery(
  send: () => Promise<string | null>,
  delaysMs: readonly number[] = [1000, 3000],
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ ok: boolean; tries: number; messageId: string | null }> {
  let tries = 0;
  for (;;) {
    tries++;
    try {
      return { ok: true, tries, messageId: await send() };
    } catch {
      const delay = delaysMs[tries - 1];
      if (delay === undefined) return { ok: false, tries, messageId: null };
      await sleep(delay);
    }
  }
}

export function maskEmail(email: string): string {  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

/**
 * Structured, secret-free logging. Only the fields built by this
 * module are ever logged — callers pass event data, never content.
 */
export function logEmailEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ scope: "email", ...event }));
}

/** Minimal transport contract (nodemailer satisfies this shape). */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId?: string }>;
  close?: () => void;
}

export interface SendResult {
  messageId: string | null;
}

const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Send one email through the given transport, with an overall
 * timeout guard. Throws EmailSendError with a safe code:
 * EMAIL_TIMEOUT, or EMAIL_SEND_FAILED (with the SMTP code when the
 * server provided one). Error text never includes credentials or
 * message content.
 */
export async function sendEmail(
  transport: MailTransport,
  config: EmailConfig,
  message: EmailMessage,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SendResult> {
  const started = Date.now();
  logEmailEvent({
    event: "send_attempt",
    to: maskEmail(message.to),
  });

  const sendPromise = transport.sendMail({
    from: `"${config.fromName}" <${config.address}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    // RFC 8058 one-click unsubscribe headers, whenever the
    // message carries the recipient's signed unsubscribe URL.
    ...(message.unsubscribeUrl
      ? {
          headers: {
            "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new EmailSendError(
          "EMAIL_TIMEOUT",
          null,
          `Email send timed out after ${timeoutMs} ms.`,
        ),
      );
    }, timeoutMs);
  });

  try {
    const info = await Promise.race([sendPromise, timeoutPromise]);
    logEmailEvent({
      event: "send_success",
      to: maskEmail(message.to),
      durationMs: Date.now() - started,
      hasMessageId: Boolean(info.messageId),
    });
    return { messageId: info.messageId ?? null };
  } catch (err) {
    if (err instanceof EmailSendError) {
      logEmailEvent({
        event: "send_failed",
        to: maskEmail(message.to),
        code: err.code,
        smtpCode: err.smtpCode,
        durationMs: Date.now() - started,
      });
      throw err;
    }
    const smtpCode =
      typeof err === "object" && err !== null && "responseCode" in err
        ? Number((err as { responseCode: unknown }).responseCode) || null
        : null;
    const wrapped = new EmailSendError(
      "EMAIL_SEND_FAILED",
      smtpCode,
      "Email could not be sent.",
    );
    logEmailEvent({
      event: "send_failed",
      to: maskEmail(message.to),
      code: wrapped.code,
      smtpCode,
      durationMs: Date.now() - started,
    });
    throw wrapped;
  } finally {
    if (timer) clearTimeout(timer);
    try {
      transport.close?.();
    } catch {
      // Closing a broken transport must never mask the real result.
    }
  }
}

/**
 * Create a Gmail SMTP transport (Deno: nodemailer via npm:).
 * Timeouts: 10s to connect, 10s greeting, 20s socket inactivity —
 * combined with sendEmail's overall guard, a send can never hang
 * a function invocation indefinitely.
 */
export async function createGmailTransport(
  config: EmailConfig,
): Promise<MailTransport> {
  // Dynamic import keeps this module loadable (and unit-testable)
  // in environments without the SMTP dependency.
  const nodemailer = (await import("npm:nodemailer@6.9.14")).default;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.address, pass: config.appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    sendMail: (msg) => transporter.sendMail(msg),
    close: () => transporter.close(),
  };
}
