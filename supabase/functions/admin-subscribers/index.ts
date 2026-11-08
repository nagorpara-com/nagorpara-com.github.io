/**
 * admin-subscribers — privileged subscriber operations (C2).
 *
 * POST with the admin's Supabase session token:
 *   Authorization: Bearer <access_token>
 *   { action: "list", status?, search?, page? }
 *   { action: "delete", id }
 *   { action: "resend", id }
 *   { action: "send-welcome-test", headline, body }
 *     — sends the welcome email to the CALLER's own email only.
 *
 * Authorization is checked HERE, on the server: the token must
 * resolve to a user whose profile is ACTIVE with role 'admin'
 * (authorizeAdmin). RLS independently gives the browser no write
 * path the design depends on. DELETE is the only removal action
 * (owner's rule, 2026-10-27: a subscriber leaves by being
 * deleted — there is no unsubscribe/inactive admin action).
 *
 * Deploy (owner, when approved) — JWT verification stays ON:
 *   supabase functions deploy admin-subscribers
 */

import {
  corsHeaders,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import {
  createAdminChecker,
  createSubscriberStore,
} from "../_shared/subscriberStore.ts";
import {
  buildFlowDeps,
  configErrorDetail,
  isConfigError,
  publicSiteBase,
} from "../_shared/subscriberMailer.ts";
import {
  authorizeAdmin,
  signUnsubscribe,
  subscribeFlow,
  type SubscriberStatus,
} from "../_shared/subscribers.ts";
import { buildEmailFooter } from "../_shared/emailFooter.ts";
import { sendWelcomeEmail } from "../_shared/welcomeEmail.ts";
import { logEmailEvent, maskEmail } from "../_shared/email.ts";

const PAGE_SIZE = 50;

Deno.serve(async (req: Request): Promise<Response> => {
  const env = Deno.env.toObject();
  const cors = corsHeaders(env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  try {
    const checker = createAdminChecker(env);
    const auth = await authorizeAdmin(checker, bearer);
    if (!auth.ok) {
      return jsonResponse({ ok: false, code: "FORBIDDEN" }, 403, cors);
    }
    const body = await readJsonBody(req);
    if (!body || typeof body.action !== "string") {
      return jsonResponse({ ok: false, code: "BAD_REQUEST" }, 400, cors);
    }
    const store = createSubscriberStore(env);

    if (body.action === "list") {
      const status =
        body.status === "pending" ||
        body.status === "verified" ||
        body.status === "unsubscribed"
          ? (body.status as SubscriberStatus)
          : undefined;
      const search =
        typeof body.search === "string" && body.search.trim()
          ? body.search.trim().slice(0, 100)
          : undefined;
      const page =
        typeof body.page === "number" && body.page >= 1
          ? Math.floor(body.page)
          : 1;
      const { rows, total } = await store.list({
        status,
        search,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      return jsonResponse({ ok: true, rows, total, page, pageSize: PAGE_SIZE }, 200, cors);
    }

    if (body.action === "delete" || body.action === "resend") {
      if (typeof body.id !== "string") {
        return jsonResponse({ ok: false, code: "BAD_REQUEST" }, 400, cors);
      }
      const row = await store.findById(body.id);
      if (!row) return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404, cors);

      if (body.action === "delete") {
        // Deliveries first (owner rule 2026-11-02: a deleted
        // subscriber's address remains in NO section, including
        // every notice's recipient list). If this fails, the whole
        // delete fails loudly and nothing is removed — never a
        // silent half-delete that leaves the address behind.
        await store.removeDeliveriesByEmail(row.email);
        await store.remove(row.id);
        logEmailEvent({ event: "admin_deleted_subscriber", to: maskEmail(row.email) });
        return jsonResponse({ ok: true, state: "deleted" }, 200, cors);
      }

      // resend: only meaningful for a pending row; runs the same
      // throttled flow as the public resend, by address. The
      // outcome is reported to the admin (a trusted caller).
      if (row.status !== "pending") {
        return jsonResponse(
          { ok: false, code: "NOT_PENDING", state: row.status },
          409,
          cors,
        );
      }
      const deps = buildFlowDeps(env);
      const { outcome } = await subscribeFlow(deps, row.email, row.source);
      return jsonResponse({ ok: true, outcome }, 200, cors);
    }

    // "Send me a test email" (Welcome Email settings page,
    // owner's Prompt 3 · Step 3): renders the welcome email from
    // the headline/body IN THE REQUEST (so the admin can test
    // before saving) and sends it ONLY to the calling admin's
    // own auth email — the recipient is resolved from the JWT
    // on the server, never taken from the request, so this
    // action cannot be used as a mail relay. A banner line in
    // the body marks it as a test.
    if (body.action === "send-welcome-test") {
      const headline =
        typeof body.headline === "string" ? body.headline.trim() : "";
      const bodyText = typeof body.body === "string" ? body.body.trim() : "";
      if (!headline || headline.length > 200 || !bodyText || bodyText.length > 5000) {
        return jsonResponse({ ok: false, code: "INVALID_CONTENT" }, 400, cors);
      }
      const adminEmail = bearer
        ? await checker.getUserEmail?.(bearer)
        : null;
      if (!adminEmail) {
        return jsonResponse({ ok: false, code: "NO_ADMIN_EMAIL" }, 400, cors);
      }
      const secret = env.UNSUBSCRIBE_SIGNING_SECRET;
      if (!secret) {
        return jsonResponse(
          { ok: false, code: "FUNCTION_NOT_CONFIGURED" },
          503,
          cors,
        );
      }
      const ownRow = await store.findByEmail(adminEmail.toLowerCase());
      const linkId = ownRow?.id ?? "welcome-test";
      const signature = await signUnsubscribe(linkId, secret);
      const base = publicSiteBase(env);
      const link = `${base}/#/unsubscribe?t=${linkId}.${signature}`;
      try {
        await sendWelcomeEmail(env, adminEmail, buildEmailFooter(base), link, {
          headline,
          body: `— এটি একটি পরীক্ষামূলক ইমেইল —\n\n${bodyText}`,
        });
        logEmailEvent({ event: "welcome_test_sent", to: maskEmail(adminEmail) });
        return jsonResponse({ ok: true, state: "test-sent" }, 200, cors);
      } catch (error) {
        if (isConfigError(error)) {
          return jsonResponse(
            {
              ok: false,
              code: "FUNCTION_NOT_CONFIGURED",
              detail: configErrorDetail(error),
            },
            503,
            cors,
          );
        }
        logEmailEvent({ event: "welcome_test_failed" });
        return jsonResponse({ ok: false, code: "SEND_FAILED" }, 502, cors);
      }
    }

    return jsonResponse({ ok: false, code: "UNKNOWN_ACTION" }, 400, cors);
  } catch (error) {
    if (isConfigError(error)) {
      return jsonResponse(
        { ok: false, code: "FUNCTION_NOT_CONFIGURED", detail: configErrorDetail(error) },
        503,
        cors,
      );
    }
    logEmailEvent({ event: "admin_subscribers_unexpected_error" });
    return jsonResponse({ ok: false, code: "INTERNAL" }, 500, cors);
  }
});
