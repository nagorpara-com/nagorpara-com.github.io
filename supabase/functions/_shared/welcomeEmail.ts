/**
 * Welcome email (Phase C; content source changed 2026-10-27,
 * Prompt 1 · Step 1).
 *
 * Sent ONCE, immediately after a subscription is verified (the
 * verify transition), by the verify-subscription function. The
 * send is a courtesy — it NEVER affects the verification
 * result: any failure (settings unreadable, mail not
 * configured, SMTP down) is logged by the caller and the
 * verification response stays exactly as before.
 *
 * Content NO LONGER lives in this file: the headline (subject)
 * and body come from the single `welcome_email_settings` row
 * (migration 0026), which the Admin controls. While that row's
 * is_active is false the caller sends nothing at all. This
 * module only renders: headline -> subject, body paragraphs ->
 * text/html, then the shared footer (buildEmailFooter) and the
 * same signed unsubscribe link every announcement carries —
 * in the body AND, via EmailMessage.unsubscribeUrl, in the
 * List-Unsubscribe headers (owner's rule: every email).
 */

import {
  createGmailTransport,
  readEmailConfig,
  sendEmail,
} from "./email.ts";
import type { EmailFooter } from "./emailFooter.ts";

export interface WelcomeContent {
  headline: string;
  body: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Body text -> paragraphs (blank-line separated, as the Admin
 * types it into the settings body field). */
function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function buildWelcomeEmail(
  footer: EmailFooter,
  unsubscribeLink: string,
  content: WelcomeContent,
): { subject: string; text: string; html: string } {
  // The headline becomes an email Subject header: CR/LF can
  // never reach it (header-injection defence; the settings are
  // admin-entered, but the renderer does not trust input).
  const subject = content.headline.replace(/[\r\n]+/g, " ").trim();
  const paras = paragraphs(content.body);
  const text = [
    ...paras,
    "",
    footer.text,
    "",
    "—",
    "আর ইমেইল পেতে না চাইলে এখানে ক্লিক করে আনসাবস্ক্রাইব করুন:",
    unsubscribeLink,
  ].join("\n");
  const html = [
    '<div style="font-family: sans-serif; line-height: 1.7; color: #1a1a1a;">',
    ...paras.map((p) => `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`),
    footer.html,
    `<p style="margin-top: 16px; color: #555; font-size: 13px;">আর ইমেইল পেতে না চাইলে <a href="${unsubscribeLink}">এখানে ক্লিক করে আনসাবস্ক্রাইব করুন</a>।</p>`,
    "</div>",
  ].join("");
  return { subject, text, html };
}

/**
 * Send the welcome email through the C4 Gmail mailer, carrying
 * the List-Unsubscribe headers. Throws on configuration/send
 * failure — the CALLER (verify-subscription) catches and logs;
 * verification never depends on this.
 */
export async function sendWelcomeEmail(
  env: Record<string, string | undefined>,
  to: string,
  footer: EmailFooter,
  unsubscribeLink: string,
  content: WelcomeContent,
): Promise<string | null> {
  const config = readEmailConfig(env);
  const transport = await createGmailTransport(config);
  const mail = buildWelcomeEmail(footer, unsubscribeLink, content);
  const result = await sendEmail(transport, config, {
    to,
    ...mail,
    unsubscribeUrl: unsubscribeLink,
  });
  return result.messageId;
}
