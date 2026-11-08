import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Client-side caller for the send-announcement function
 * (Phase C / C3 Step D). Every call carries the admin's session
 * token; the function re-authorizes on the server (active
 * profile, role 'admin') before doing anything — the UI hiding
 * a button is never the security.
 *
 * Delivery status here is deliberately separate from the post's
 * publication status: publishing lives on news_posts; delivery
 * lives on notice_deliveries (Migration 0015) and is reported by
 * this function only.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

/** Machine marker of an interrupted, outcome-unknown attempt.
 *  Keep in sync with supabase/functions/_shared/announcement.ts. */
export const UNCERTAIN_ERROR_PREFIX = "OUTCOME_UNKNOWN:";

export interface DeliverySummary {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  /** Subset of `failed` whose outcome is unknown (see prefix). */
  uncertain: number;
}

export interface DeliveryRunReport {
  claimed: number;
  sent: number;
  failed: number;
  skippedRace: number;
  skippedNotVerified: number;
  outcomeUnknown: number;
  staleClosed: number;
}

export type AnnouncementAction = "preview" | "report" | "send" | "retry";

export type AnnouncementResult =
  | {
      ok: true;
      summary: DeliverySummary;
      verifiedSubscribers: number;
      post?: { id: string; title: string; slug: string; isPublished: boolean };
      run?: DeliveryRunReport;
    }
  | { ok: false; code: string; detail?: string };

export async function announcementAction(
  action: AnnouncementAction,
  postId: string,
): Promise<AnnouncementResult> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !supabase) {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, code: "NO_SESSION" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-announcement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, postId }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      detail?: string;
      summary?: DeliverySummary;
      verifiedSubscribers?: number;
      post?: { id: string; title: string; slug: string; isPublished: boolean };
      run?: DeliveryRunReport;
    };
    if (!res.ok || payload.ok !== true || !payload.summary) {
      return {
        ok: false,
        code: payload.code ?? `HTTP_${res.status}`,
        detail: payload.detail,
      };
    }
    return {
      ok: true,
      summary: payload.summary,
      verifiedSubscribers: payload.verifiedSubscribers ?? 0,
      post: payload.post,
      run: payload.run,
    };
  } catch {
    return { ok: false, code: "NETWORK" };
  }
}

/** Bengali admin-facing message for a function error code. */
export function announcementErrorText(result: {
  code: string;
  detail?: string;
}): string {
  switch (result.code) {
    case "FUNCTION_NOT_CONFIGURED":
      return `সার্ভারের ইমেইল কনফিগারেশন অসম্পূর্ণ — ${result.detail ?? ""}। Supabase Dashboard Edge Functions Secrets-এ বাকি Secret বসাতে হবে।`;
    case "FORBIDDEN":
      return "অনুমতি নেই — শুধু সক্রিয় Admin এই কাজটি করতে পারে।";
    case "NOT_PUBLISHED":
      return "নোটিশটি এখনো প্রকাশিত নয় — আগে প্রকাশ করুন।";
    case "NOT_NOTICE":
      return "শুধু নোটিশ ধরনের পোস্টেই ইমেইল পাঠানো যায়।";
    case "NOT_FOUND":
      return "পোস্টটি পাওয়া যায়নি।";
    case "NO_SESSION":
      return "সেশন পাওয়া যায়নি — আবার লগইন করুন।";
    case "NOT_CONFIGURED":
      return "Supabase সংযোগ সেট করা হয়নি।";
    default:
      return `কাজটি করা যায়নি (${result.code})।`;
  }
}
