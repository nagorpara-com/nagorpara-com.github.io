/**
 * Shared email footer (Phase C — owner's specification,
 * 2026-10-24). ONE reusable footer attached automatically to
 * both transactional templates:
 *   - the Welcome email (sent once, when a subscription is
 *     verified), and
 *   - every Notice announcement email (send-announcement).
 * Admins never type it; templates append it.
 *
 * Content sources — public facts, not secrets (server code
 * cannot import the frontend config tree, so the values are
 * mirrored here WITH their sources; if a source changes, change
 * this file in the same commit):
 *   - Organization name/message: the organization itself; the
 *     name spelling follows src/config/organization.ts and every
 *     existing email ("নগর পাড়া অগ্রগামী যুব সংঘ").
 *   - Organization Facebook URL: src/config/organization.ts
 *     (`facebookUrl` default) — the owner confirmed this page is
 *     the organization's on 2026-10-24 after being shown the
 *     page's display name. NOT guessed.
 *   - Developer block: src/config/developer.ts (name, role,
 *     Facebook, phone) — owner-provided 2026-10-24, identical
 *     values in both places by design.
 *   - Website URL: NOT mirrored anywhere — it is the runtime
 *     PUBLIC_SITE_URL the owner configures in Dashboard secrets
 *     (the same gate that already blocks all sending until it is
 *     set), so a placeholder or planned domain can never reach a
 *     production email.
 *
 * The HTML is email-client-safe: table layout, inline styles
 * only, no external assets. The developer section is visually
 * subordinate (smaller, muted, separated) — present, never
 * louder than the organization's own message.
 */

export const ORG_FACEBOOK_URL = "https://www.facebook.com/nagorpara";

export const DEVELOPER_PROMO = {
  name: "MD Sohel Rana",
  role: "Web Developer",
  facebookUrl: "https://www.facebook.com/fbsohel10",
  phoneDisplay: "01956383607",
  phoneHref: "tel:01956383607",
} as const;

export interface EmailFooter {
  text: string;
  html: string;
}

const GREEN = "#17623D";
const GOLD = "#F3C64E";

/**
 * Build the shared footer for one send. `siteUrl` is the
 * configured public site base (no trailing slash) — the caller
 * has already passed the configuration gate, so it is a real,
 * owner-set value, never a placeholder.
 */
export function buildEmailFooter(siteUrl: string): EmailFooter {
  const base = siteUrl.replace(/\/+$/, "");

  const text = [
    "————————————————————",
    "নগর পাড়া অগ্রগামী যুব সংঘ",
    "আমাদের সর্বশেষ নোটিশ, কার্যক্রম, অনুষ্ঠান ও গুরুত্বপূর্ণ আপডেট জানতে",
    "অফিসিয়াল Website ভিজিট করুন এবং Facebook পেজে যুক্ত থাকুন।",
    `Official Website: ${base}`,
    `Facebook Page: ${ORG_FACEBOOK_URL}`,
    "",
    "আপনার কি একটি প্রফেশনাল ওয়েবসাইট প্রয়োজন?",
    "আপনার ব্যবসা, প্রতিষ্ঠান বা ব্যক্তিগত ব্র্যান্ডের জন্য আধুনিক,",
    "আকর্ষণীয় ও মোবাইল-ফ্রেন্ডলি ওয়েবসাইট তৈরি করতে একজন ডেভেলপার",
    "খুঁজছেন? কাজের নমুনা দেখতে অথবা আপনার প্রজেক্ট নিয়ে আলোচনা",
    "করতে যোগাযোগ করুন।",
    `Developer: ${DEVELOPER_PROMO.name}`,
    `Role: ${DEVELOPER_PROMO.role}`,
    `Facebook: ${DEVELOPER_PROMO.facebookUrl}`,
    `Phone: ${DEVELOPER_PROMO.phoneDisplay}`,
  ].join("\n");

  const html = [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 24px;">',
    `<tr><td style="border-top: 3px solid ${GOLD}; padding: 16px 0 0 0;">`,
    `<p style="margin: 0 0 4px 0; font-family: sans-serif; font-size: 15px; font-weight: bold; color: ${GREEN};">নগর পাড়া অগ্রগামী যুব সংঘ</p>`,
    '<p style="margin: 0 0 8px 0; font-family: sans-serif; font-size: 13px; line-height: 1.6; color: #444;">আমাদের সর্বশেষ নোটিশ, কার্যক্রম, অনুষ্ঠান ও গুরুত্বপূর্ণ আপডেট জানতে অফিসিয়াল Website ভিজিট করুন এবং Facebook পেজে যুক্ত থাকুন।</p>',
    `<p style="margin: 0; font-family: sans-serif; font-size: 13px; line-height: 1.8;">` +
      `<a href="${base}" style="color: ${GREEN}; font-weight: bold;">Official Website</a>` +
      ` &nbsp;|&nbsp; ` +
      `<a href="${ORG_FACEBOOK_URL}" style="color: ${GREEN}; font-weight: bold;">Facebook Page</a></p>`,
    "</td></tr>",
    '<tr><td style="padding: 16px 0 0 0;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background-color: #f4f8f5; border: 1px solid #e0e8e2;">',
    '<tr><td style="padding: 12px 14px;">',
    `<p style="margin: 0 0 4px 0; font-family: sans-serif; font-size: 13px; font-weight: bold; color: ${GREEN};">আপনার কি একটি প্রফেশনাল ওয়েবসাইট প্রয়োজন?</p>`,
    '<p style="margin: 0 0 8px 0; font-family: sans-serif; font-size: 12px; line-height: 1.6; color: #555;">আপনার ব্যবসা, প্রতিষ্ঠান বা ব্যক্তিগত ব্র্যান্ডের জন্য আধুনিক, আকর্ষণীয় ও মোবাইল-ফ্রেন্ডলি ওয়েবসাইট তৈরি করতে একজন ডেভেলপার খুঁজছেন? কাজের নমুনা দেখতে অথবা আপনার প্রজেক্ট নিয়ে আলোচনা করতে যোগাযোগ করুন।</p>',
    `<p style="margin: 0; font-family: sans-serif; font-size: 12px; line-height: 1.7; color: #555;">` +
      `Developer: <strong style="color: #333;">${DEVELOPER_PROMO.name}</strong> (${DEVELOPER_PROMO.role})<br />` +
      `Facebook: <a href="${DEVELOPER_PROMO.facebookUrl}" style="color: ${GREEN};">${DEVELOPER_PROMO.facebookUrl}</a><br />` +
      `Phone: <a href="${DEVELOPER_PROMO.phoneHref}" style="color: ${GREEN};">${DEVELOPER_PROMO.phoneDisplay}</a></p>`,
    "</td></tr></table>",
    "</td></tr></table>",
  ].join("");

  return { text, html };
}
