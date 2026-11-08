/**
 * resend-verification — public resend entry point (Phase C / C2).
 *
 * POST { email }
 *
 * Same engine and same uniform response as `subscribe`
 * (submitting the subscribe form again IS the resend flow — the
 * per-address throttles in the database decide whether a new
 * mail actually goes out). Kept as its own function so the
 * verification page's "send again" form has a clear target and
 * the two can be rate-limited independently.
 *
 * Deploy (owner, when approved):
 *   supabase functions deploy resend-verification --no-verify-jwt
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
  subscribeFlow,
  SubscriberValidationError,
} from "../_shared/subscribers.ts";
import { logEmailEvent } from "../_shared/email.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const env = Deno.env.toObject();
  const cors = corsHeaders(env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }
  if (ipRateLimited(req, "resend")) {
    return jsonResponse({ ok: false, code: "RATE_LIMITED" }, 429, cors);
  }
  const body = await readJsonBody(req);
  if (!body) return jsonResponse({ ok: false, code: "BAD_REQUEST" }, 400, cors);

  try {
    const deps = buildFlowDeps(env);
    await subscribeFlow(deps, body.email, "website");
    return jsonResponse({ ok: true, message: "check-email" }, 200, cors);
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
    logEmailEvent({ event: "resend_unexpected_error" });
    return jsonResponse({ ok: false, code: "INTERNAL" }, 500, cors);
  }
});
