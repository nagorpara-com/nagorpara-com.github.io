/**
 * subscription-status — does this subscription still exist?
 * (Prompt 1 · Step 1, 2026-10-27.)
 *
 * GET ?id=<subscriber uuid>  ->  200 { ok: true, exists: boolean }
 *
 * Purpose (owner's rule): when an Admin DELETES a subscriber,
 * that subscriber's browser must offer the Subscribe Popup
 * again. The browser remembers only the subscription's id
 * (never the email — R-24) from its verify response; on popup
 * evaluation it asks this endpoint whether that id still
 * exists, and clears its local verified/submitted memory when
 * the answer is no.
 *
 * Safety: ids are random UUIDs (122 bits) issued only to the
 * verified mailbox holder; the endpoint answers a boolean for
 * an id the caller already holds, lists nothing, and is rate
 * limited per IP. A malformed id is answered exists:false
 * without touching the database.
 *
 * Deploy (owner, when approved):
 *   supabase functions deploy subscription-status --no-verify-jwt
 */

import { corsHeaders, ipRateLimited, jsonResponse } from "../_shared/http.ts";
import { createSubscriberStore } from "../_shared/subscriberStore.ts";
import { isConfigError } from "../_shared/subscriberMailer.ts";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  const env = Deno.env.toObject();
  const cors = corsHeaders(env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }
  if (ipRateLimited(req, "subscription-status", 30)) {
    return jsonResponse({ ok: false, code: "RATE_LIMITED" }, 429, cors);
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID_SHAPE.test(id)) {
    return jsonResponse({ ok: true, exists: false }, 200, cors);
  }
  try {
    const store = createSubscriberStore(env);
    const row = await store.findById(id);
    return jsonResponse({ ok: true, exists: row !== null }, 200, cors);
  } catch (error) {
    if (isConfigError(error)) {
      return jsonResponse({ ok: false, code: "FUNCTION_NOT_CONFIGURED" }, 503, cors);
    }
    return jsonResponse({ ok: false, code: "INTERNAL" }, 500, cors);
  }
});
