/**
 * send-announcement — notice email delivery (Phase C / C3 Step D).
 *
 * POST with the admin's Supabase session token:
 *   Authorization: Bearer <access_token>
 *   { action: "preview", postId }  — read-only: post info,
 *     verified subscriber count, current delivery summary.
 *   { action: "report", postId }   — same read model as preview
 *     (kept as a separate action so the panel's intent is clear).
 *   { action: "send", postId }     — seed + deliver to verified
 *     subscribers (published notices only).
 *   { action: "retry", postId }    — deliver failed rows only;
 *     this explicit admin action is the human retry decision the
 *     migration-0015 contract requires for uncertain rows.
 *
 * Authorization is checked HERE, on the server (authorizeAdmin:
 * active profile with role 'admin'). Hiding the button in the UI
 * is NOT the security — this check is. Delivery itself follows
 * the migration-0015 claim contract implemented in
 * _shared/announcement.ts: atomic claim, guarded outcome,
 * stale 'sending' closed as outcome-unknown, never auto-resent.
 *
 * The send/retry actions refuse to run (503) unless
 * PUBLIC_SITE_URL and UNSUBSCRIBE_SIGNING_SECRET are configured
 * and the C4 Gmail configuration is complete — checked BEFORE
 * any delivery row is created.
 *
 * Email failure never unpublishes or blocks the notice: this
 * function writes only notice_deliveries rows.
 *
 * Deploy (owner, when approved) — JWT verification stays ON,
 * like admin-subscribers:
 *   supabase functions deploy send-announcement
 */

import {
  corsHeaders,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import { createAdminChecker } from "../_shared/subscriberStore.ts";
import { authorizeAdmin, signUnsubscribe } from "../_shared/subscribers.ts";
import {
  createGmailTransport,
  logEmailEvent,
  readEmailConfig,
  sendEmail,
} from "../_shared/email.ts";
import {
  configErrorDetail,
  isConfigError,
  publicSiteBase,
} from "../_shared/subscriberMailer.ts";
import { createAnnouncementStore } from "../_shared/announcementStore.ts";
import { buildEmailFooter } from "../_shared/emailFooter.ts";
import {
  deliveryReport,
  readAnnouncementConfig,
  runDelivery,
  type AnnouncementDeps,
} from "../_shared/announcement.ts";

function buildDeps(env: Record<string, string | undefined>): AnnouncementDeps {
  const config = readAnnouncementConfig(env);
  return {
    store: createAnnouncementStore(env),
    now: () => new Date(),
    sendMail: async (to, mail) => {
      const emailConfig = readEmailConfig(env);
      const transport = await createGmailTransport(emailConfig);
      return sendEmail(transport, emailConfig, { to, ...mail });
    },
    buildViewLink: (slug) => `${config.siteUrl}/#/news/${slug}`,
    buildUnsubscribeLink: async (subscriberId) => {
      const signature = await signUnsubscribe(
        subscriberId,
        config.unsubscribeSecret,
      );
      return `${config.siteUrl}/#/unsubscribe?t=${subscriberId}.${signature}`;
    },
    footer: buildEmailFooter(config.siteUrl),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const env = Deno.env.toObject();
  const cors = corsHeaders(env);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  try {
    // Server-side authorization FIRST — before any action, config
    // check, or database write.
    const auth = await authorizeAdmin(createAdminChecker(env), bearer);
    if (!auth.ok) {
      return jsonResponse({ ok: false, code: "FORBIDDEN" }, 403, cors);
    }

    const body = await readJsonBody(req);
    if (
      !body ||
      typeof body.action !== "string" ||
      typeof body.postId !== "string"
    ) {
      return jsonResponse({ ok: false, code: "BAD_REQUEST" }, 400, cors);
    }
    const postId = body.postId;

    if (body.action === "preview" || body.action === "report") {
      // Read-only: works even before the mail configuration is
      // complete, so the admin can always see counts and status.
      const deps: AnnouncementDeps = {
        store: createAnnouncementStore(env),
        now: () => new Date(),
        sendMail: () => Promise.reject(new Error("not used in reports")),
        buildViewLink: (slug) =>
          `${publicSiteBase(env)}/#/news/${slug}`,
        buildUnsubscribeLink: () => Promise.resolve(""),
        // Reports never build an email; the footer is unused here.
        footer: { text: "", html: "" },
      };
      const report = await deliveryReport(deps, postId);
      if (!report.ok) {
        return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404, cors);
      }
      return jsonResponse(
        {
          ok: true,
          post: {
            id: report.post.id,
            title: report.post.title,
            slug: report.post.slug,
            isPublished: report.post.is_published,
          },
          verifiedSubscribers: report.verifiedSubscribers,
          summary: report.summary,
        },
        200,
        cors,
      );
    }

    if (body.action === "send" || body.action === "retry") {
      // Configuration gate BEFORE anything is seeded or sent:
      // buildDeps validates PUBLIC_SITE_URL +
      // UNSUBSCRIBE_SIGNING_SECRET; readEmailConfig validates the
      // Gmail configuration. Any gap -> 503, zero side effects.
      const deps = buildDeps(env);
      readEmailConfig(env);
      const result = await runDelivery(deps, postId, body.action);
      if (!result.ok) {
        const status = result.code === "NOT_FOUND" ? 404 : 409;
        return jsonResponse({ ok: false, code: result.code }, status, cors);
      }
      logEmailEvent({
        event: "announcement_run",
        mode: body.action,
        sent: result.run.sent,
        failed: result.run.failed,
        outcomeUnknown: result.run.outcomeUnknown,
      });
      return jsonResponse(
        {
          ok: true,
          summary: result.summary,
          verifiedSubscribers: result.verifiedSubscribers,
          run: result.run,
        },
        200,
        cors,
      );
    }

    return jsonResponse({ ok: false, code: "UNKNOWN_ACTION" }, 400, cors);
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
    logEmailEvent({ event: "send_announcement_unexpected_error" });
    return jsonResponse({ ok: false, code: "INTERNAL" }, 500, cors);
  }
});
