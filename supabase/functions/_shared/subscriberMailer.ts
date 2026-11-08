/**
 * Wires the subscriber flows to the real world (SERVER-SIDE
 * ONLY): the Supabase store, the C4 Gmail mailer, and the public
 * site's link base. Used by the subscribe / resend /
 * admin-subscribers functions.
 *
 * Configuration (Supabase function secrets — names only, values
 * are set by the owner in the Dashboard, never in this repo):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
 *   PUBLIC_SITE_URL   e.g. https://nagarparayouthsangha.org
 *   GMAIL_ADDRESS, GMAIL_APP_PASSWORD        (from Phase C4)
 */

import {
  createGmailTransport,
  readEmailConfig,
  sendEmail,
} from "./email.ts";
import {
  type FlowDeps,
  SubscriberConfigError,
} from "./subscribers.ts";
import { createSubscriberStore } from "./subscriberStore.ts";

const VERIFY_PATH = "#/verify-subscription?token=";

export function publicSiteBase(
  env: Record<string, string | undefined>,
): string {
  const base = env.PUBLIC_SITE_URL;
  if (!base) {
    throw new SubscriberConfigError(
      "Missing server environment variable(s): PUBLIC_SITE_URL",
    );
  }
  return base.replace(/\/+$/, "");
}

export function buildVerifyLink(
  env: Record<string, string | undefined>,
  rawToken: string,
): string {
  return `${publicSiteBase(env)}/${VERIFY_PATH}${encodeURIComponent(rawToken)}`;
}

export function verificationEmail(link: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "ইমেইল যাচাই করুন — নগর পাড়া অগ্রগামী যুব সংঘ";
  const text = [
    "আসসালামু আলাইকুম,",
    "",
    "আপনি নগর পাড়া অগ্রগামী যুব সংঘ-এর নোটিশ ও ঘোষণা ইমেইলে পেতে",
    "সাবস্ক্রাইব করেছেন। সাবস্ক্রিপশন নিশ্চিত করতে নিচের লিংকে",
    "ক্লিক করুন (লিংকটির মেয়াদ ৪৮ ঘণ্টা):",
    "",
    link,
    "",
    "আপনি এই অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন —",
    "কোনো সাবস্ক্রিপশন তৈরি হবে না।",
  ].join("\n");
  const html = [
    '<div style="font-family: sans-serif; line-height: 1.7; color: #1a1a1a;">',
    "<p>আসসালামু আলাইকুম,</p>",
    "<p>আপনি <strong>নগর পাড়া অগ্রগামী যুব সংঘ</strong>-এর নোটিশ ও ঘোষণা ইমেইলে পেতে সাবস্ক্রাইব করেছেন। সাবস্ক্রিপশন নিশ্চিত করতে নিচের লিংকে ক্লিক করুন (লিংকটির মেয়াদ ৪৮ ঘণ্টা):</p>",
    `<p><a href="${link}" style="color: #17623D; font-weight: bold;">ইমেইল যাচাই করুন</a></p>`,
    `<p style="word-break: break-all; color: #555;">${link}</p>`,
    "<p>আপনি এই অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন — কোনো সাবস্ক্রিপশন তৈরি হবে না।</p>",
    "</div>",
  ].join("");
  return { subject, text, html };
}

export function buildFlowDeps(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): FlowDeps {
  const store = createSubscriberStore(env);
  // Validate the link base eagerly so a misconfigured deployment
  // fails before any row is written.
  publicSiteBase(env);
  return {
    store,
    buildVerifyLink: (rawToken) => buildVerifyLink(env, rawToken),
    now: () => new Date(),
    sendVerificationEmail: async (to, link) => {
      const config = readEmailConfig(env);
      const transport = await createGmailTransport(config);
      const mail = verificationEmail(link);
      await sendEmail(transport, config, {
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
}

/** True for "the owner has not finished configuring" errors. */
export function isConfigError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === "EMAIL_NOT_CONFIGURED" || code === "SUBSCRIBER_NOT_CONFIGURED";
}

/** Names of the missing variables from a config error (safe to show). */
export function configErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "not configured";
}
