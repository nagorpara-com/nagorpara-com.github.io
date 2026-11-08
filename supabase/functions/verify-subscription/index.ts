/**
 * verify-subscription — consumes a verification token (C2).
 *
 * POST { token }
 *   -> 200 { ok: true, state: "verified" | "already-verified"
 *                             | "expired" | "invalid" }
 *
 * Returning the state is safe here: the token itself is the
 * credential, so whoever holds it may learn what it did. The
 * consume is a single guarded update (see subscribers.ts), so
 * the same token can never verify twice, even concurrently.
 *
 * Deploy (owner, when approved):
 *   supabase functions deploy verify-subscription --no-verify-jwt
 */

import {
  corsHeaders,
  ipRateLimited,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import { createSubscriberStore } from "../_shared/subscriberStore.ts";
import { sha256Hex, verifyFlow } from "../_shared/subscribers.ts";
import {
  configErrorDetail,
  isConfigError,
} from "../_shared/subscriberMailer.ts";
import { logEmailEvent } from "../_shared/email.ts";
import { sendWelcomeOnce } from "../_shared/welcomeSend.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const env = Deno.env.toObject();
  const cors = corsHeaders(env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }
  if (ipRateLimited(req, "verify", 30)) {
    return jsonResponse({ ok: false, code: "RATE_LIMITED" }, 429, cors);
  }
  const body = await readJsonBody(req);
  if (!body) return jsonResponse({ ok: false, code: "BAD_REQUEST" }, 400, cors);

  try {
    const store = createSubscriberStore(env);
    const { outcome } = await verifyFlow(
      {
        store,
        sendVerificationEmail: async () => {},
        buildVerifyLink: () => "",
        now: () => new Date(),
      },
      body.token,
    );

    // Resolve the subscriber row for the token holder. The
    // token IS the credential, so returning the row's id to its
    // holder is as safe as returning the state — and the id is
    // what lets this browser remember WHICH subscription it
    // holds (never the email), so an admin delete can later be
    // noticed and the subscribe popup can return (owner's
    // rule, 2026-10-27).
    let row: Awaited<ReturnType<typeof store.findByTokenHash>> = null;
    if (
      typeof body.token === "string" &&
      (outcome === "verified" || outcome === "already-verified")
    ) {
      row = await store
        .findByTokenHash(await sha256Hex(body.token.trim()))
        .catch(() => null);
    }

    // Welcome email: sent ONCE, only on the verify transition
    // itself, through the shared routine (settings gate +
    // idempotent claim + retry) — see _shared/welcomeSend.ts.
    if (outcome === "verified" && row) {
      await sendWelcomeOnce(env, row);
    }

    return jsonResponse(
      {
        ok: true,
        state: outcome,
        ...(row ? { subscriberId: row.id } : {}),
      },
      200,
      cors,
    );
  } catch (error) {
    if (isConfigError(error)) {
      return jsonResponse(
        { ok: false, code: "FUNCTION_NOT_CONFIGURED", detail: configErrorDetail(error) },
        503,
        cors,
      );
    }
    logEmailEvent({ event: "verify_unexpected_error" });
    return jsonResponse({ ok: false, code: "INTERNAL" }, 500, cors);
  }
});
