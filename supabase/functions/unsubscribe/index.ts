/**
 * unsubscribe — leaves the announcement list (Phase C / C2).
 *
 * POST { t: "<subscriberId>.<signature>" }
 *   (or { id, signature })
 *   -> 200 { ok: true, state: "unsubscribed" | "already-unsubscribed" }
 *   -> 400 { ok: false, code: "INVALID_LINK" } for any bad/missing
 *      signature or unknown id — one uniform refusal, so the
 *      endpoint never confirms whether an id exists.
 *
 * The signature is an HMAC over the subscriber id, keyed by the
 * server-only UNSUBSCRIBE_SIGNING_SECRET, compared in constant
 * time. The public page asks the visitor to confirm with a
 * button before calling this, so mail-scanner prefetching can
 * never unsubscribe anyone by itself.
 *
 * Deploy (owner, when approved):
 *   supabase functions deploy unsubscribe --no-verify-jwt
 * Extra secret: UNSUBSCRIBE_SIGNING_SECRET (owner-generated).
 */

import {
  corsHeaders,
  ipRateLimited,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import { createSubscriberStore } from "../_shared/subscriberStore.ts";
import { unsubscribeFlow } from "../_shared/subscribers.ts";
import { logEmailEvent } from "../_shared/email.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const env = Deno.env.toObject();
  const cors = corsHeaders(env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }
  if (ipRateLimited(req, "unsubscribe", 30)) {
    return jsonResponse({ ok: false, code: "RATE_LIMITED" }, 429, cors);
  }
  const secret = env.UNSUBSCRIBE_SIGNING_SECRET;
  if (!secret) {
    return jsonResponse(
      {
        ok: false,
        code: "FUNCTION_NOT_CONFIGURED",
        detail: "Missing server environment variable(s): UNSUBSCRIBE_SIGNING_SECRET",
      },
      503,
      cors,
    );
  }
  const body = await readJsonBody(req);
  if (!body) return jsonResponse({ ok: false, code: "BAD_REQUEST" }, 400, cors);

  let id: unknown = body.id;
  let signature: unknown = body.signature;
  if (typeof body.t === "string") {
    const dot = body.t.indexOf(".");
    if (dot > 0) {
      id = body.t.slice(0, dot);
      signature = body.t.slice(dot + 1);
    }
  }

  try {
    const store = createSubscriberStore(env);
    const { outcome } = await unsubscribeFlow(
      {
        store,
        sendVerificationEmail: async () => {},
        buildVerifyLink: () => "",
        now: () => new Date(),
      },
      id,
      signature,
      secret,
    );
    if (outcome === "invalid-signature") {
      return jsonResponse({ ok: false, code: "INVALID_LINK" }, 400, cors);
    }
    return jsonResponse({ ok: true, state: outcome }, 200, cors);
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === "SUBSCRIBER_NOT_CONFIGURED") {
      return jsonResponse(
        { ok: false, code: "FUNCTION_NOT_CONFIGURED", detail: (error as Error).message },
        503,
        cors,
      );
    }
    logEmailEvent({ event: "unsubscribe_unexpected_error" });
    return jsonResponse({ ok: false, code: "INTERNAL" }, 500, cors);
  }
});
