/**
 * send-email — internal server-side email endpoint (Phase C / C4).
 *
 * This Edge Function is the ONLY way anything in this project
 * sends email. It exists so that:
 * - the Gmail credential lives exclusively in the function's
 *   secret environment (Supabase Dashboard > Edge Functions >
 *   Secrets) — never in the frontend, the repo, or a database
 *   settings table;
 * - future features (C2 subscription verification, C3 notice
 *   delivery) share one audited sending path with validation,
 *   timeouts and safe logging (see ../_shared/email.ts).
 *
 * Authorization: callers must be server-side code (another Edge
 * Function or a trusted backend job) presenting the shared
 * internal secret in the `x-internal-secret` header. The function
 * refuses to run at all when that secret is not configured, and
 * it is NEVER callable from the public website — the browser gets
 * no credential and no endpoint contract here.
 *
 * Deploy (only when the owner approves deployment):
 *   supabase functions deploy send-email --no-verify-jwt
 * (--no-verify-jwt because authorization is the internal secret;
 * a Supabase user JWT is not meaningful for server-to-server mail.)
 *
 * Requests (POST, JSON):
 *   { "action": "ping" }                       -> { ok, configured }
 *   { "action": "send", "to", "subject",
 *     "text", "html"? }                        -> { ok, messageId }
 * Responses carry safe error codes only — no secrets, no content.
 */

import {
  createGmailTransport,
  EMAIL_ENV_KEYS,
  EmailNotConfiguredError,
  EmailSendError,
  EmailValidationError,
  logEmailEvent,
  readEmailConfig,
  sendEmail,
  validateMessage,
} from "../_shared/email.ts";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") {
    return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  // --- Server-side authorization -----------------------------------
  const expectedSecret = Deno.env.get(EMAIL_ENV_KEYS.internalSecret) ?? "";
  if (!expectedSecret) {
    // Not armed: without the internal secret configured, this
    // function must not send anything for anyone.
    logEmailEvent({ event: "function_not_configured" });
    return json({ ok: false, code: "FUNCTION_NOT_CONFIGURED" }, 503);
  }
  const presented = req.headers.get("x-internal-secret") ?? "";
  if (!safeEqual(presented, expectedSecret)) {
    logEmailEvent({ event: "auth_rejected" });
    return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  // --- Body ---------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, code: "INVALID_JSON" }, 400);
  }
  const action = typeof body.action === "string" ? body.action : "send";

  // --- Config -------------------------------------------------------
  let config;
  try {
    config = readEmailConfig(Deno.env.toObject());
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      if (action === "ping") return json({ ok: true, configured: false }, 200);
      return json(
        { ok: false, code: err.code, missing: err.missing },
        503,
      );
    }
    throw err;
  }
  if (action === "ping") return json({ ok: true, configured: true }, 200);
  if (action !== "send") {
    return json({ ok: false, code: "UNKNOWN_ACTION" }, 400);
  }

  // --- Validate + send ----------------------------------------------
  let message;
  try {
    message = validateMessage({
      to: typeof body.to === "string" ? body.to : undefined,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      text: typeof body.text === "string" ? body.text : undefined,
      html: typeof body.html === "string" ? body.html : undefined,
    });
  } catch (err) {
    if (err instanceof EmailValidationError) {
      return json({ ok: false, code: err.code, message: err.message }, 400);
    }
    throw err;
  }

  try {
    const transport = await createGmailTransport(config);
    const result = await sendEmail(transport, config, message);
    return json({ ok: true, messageId: result.messageId }, 200);
  } catch (err) {
    if (err instanceof EmailSendError) {
      const status = err.code === "EMAIL_TIMEOUT" ? 504 : 502;
      return json(
        { ok: false, code: err.code, smtpCode: err.smtpCode },
        status,
      );
    }
    logEmailEvent({ event: "unexpected_error" });
    return json({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }
});
