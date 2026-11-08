/**
 * subscribe — public subscribe entry point.
 *
 * Model (owner's decision, 2026-10-27 evening — supersedes the
 * Prompt 2 double opt-in): subscribing activates the
 * subscription IMMEDIATELY. POST { email } creates (or flips) the
 * row as VERIFIED at once and the welcome email goes out in the
 * same call through the settings-gated, idempotency-claimed
 * routine. There is no pending state and no verification link
 * for new signups; the legacy verify endpoint remains only for
 * links already sitting in inboxes.
 *
 * Response: { ok: true, message: "subscribed", subscriberId } —
 * the id lets this browser remember WHICH subscription it holds
 * (never the email), so an admin delete can later be noticed and
 * the subscribe popup can return (owner's rule, 2026-10-27).
 * Only a malformed or disposable address gets a 400; a 503 means
 * the OWNER has not finished configuring the function.
 *
 * Deploy (owner, when approved):
 *   supabase functions deploy subscribe --no-verify-jwt
 * Secrets: see supabase/functions/README.md.
 */

import {
  corsHeaders,
  ipRateLimited,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import {
  buildFlowDeps,
  configErrorDetail,
  isConfigError,
} from "../_shared/subscriberMailer.ts";
import {
  DisposableEmailError,
  subscribeInstantFlow,
  SubscriberValidationError,
} from "../_shared/subscribers.ts";
import { sendWelcomeOnce } from "../_shared/welcomeSend.ts";
import { logEmailEvent } from "../_shared/email.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const env = Deno.env.toObject();
  const cors = corsHeaders(env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }
  // Owner's rule (2026-10-27): at most 5 subscribe calls per
  // IP per hour.
  if (ipRateLimited(req, "subscribe", 5, 60 * 60 * 1000)) {
    return jsonResponse({ ok: false, code: "RATE_LIMITED" }, 429, cors);
  }
  const body = await readJsonBody(req);
  if (!body) return jsonResponse({ ok: false, code: "BAD_REQUEST" }, 400, cors);

  // Honeypot (owner's rule, 2026-10-27): the public forms carry
  // a hidden "homepage" field no human ever fills. A filled one
  // means a bot — answer with the SAME success shape as a real
  // subscribe and do nothing at all.
  if (typeof body.homepage === "string" && body.homepage.trim() !== "") {
    logEmailEvent({ event: "subscribe_honeypot_hit" });
    return jsonResponse({ ok: true, message: "subscribed" }, 200, cors);
  }

  try {
    const { store } = buildFlowDeps(env);
    const { subscriberId, outcome } = await subscribeInstantFlow(
      {
        store,
        sendWelcome: (row) => sendWelcomeOnce(env, row),
        now: () => new Date(),
      },
      body.email,
      "website",
    );
    // Owner's rule (2026-11-01): one subscription per EMAIL —
    // and the form must SAY so when the entered address is
    // already subscribed ("অলরেডি সাবস্ক্রাইব করেছেন,
    // অভিনন্দন"). The response therefore carries a state:
    // "already-subscribed" when the address was already active
    // (nothing is created and no second welcome is sent — the
    // flow's already-verified path is a pure no-op), otherwise
    // "subscribed". This deliberately supersedes the older
    // uniform-answer rule for this one bit of information, at
    // the owner's explicit instruction.
    return jsonResponse(
      {
        ok: true,
        message: "subscribed",
        subscriberId,
        state: outcome === "already-verified" ? "already-subscribed" : "subscribed",
      },
      200,
      cors,
    );
  } catch (error) {
    if (error instanceof DisposableEmailError) {
      return jsonResponse({ ok: false, code: "DISPOSABLE_EMAIL" }, 400, cors);
    }
    if (error instanceof SubscriberValidationError) {
      return jsonResponse({ ok: false, code: "INVALID_EMAIL" }, 400, cors);
    }
    if (isConfigError(error)) {
      return jsonResponse(
        { ok: false, code: "FUNCTION_NOT_CONFIGURED", detail: configErrorDetail(error) },
        503,
        cors,
      );
    }
    logEmailEvent({ event: "subscribe_unexpected_error" });
    return jsonResponse({ ok: false, code: "INTERNAL" }, 500, cors);
  }
});
