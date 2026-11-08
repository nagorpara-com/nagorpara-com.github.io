import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Client-side callers for the Phase C subscriber functions.
 *
 * The public functions (subscribe / resend-verification /
 * verify-subscription / unsubscribe) are deployed with
 * --no-verify-jwt: the caller's identity is not the credential —
 * the email token / HMAC signature is. The subscribe and resend
 * endpoints answer identically for every subscription state by
 * design (anti-enumeration), so this module reports only
 * transport-level outcomes.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export type FunctionCallResult =
  | { ok: true; state?: string; outcome?: string; subscriberId?: string }
  | { ok: false; code: string };

async function callFunction(
  name: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<FunctionCallResult> {
  if (!isSupabaseConfigured || !SUPABASE_URL) {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      state?: string;
      outcome?: string;
      subscriberId?: string;
    };
    if (!res.ok || data.ok !== true) {
      return { ok: false, code: data.code ?? `HTTP_${res.status}` };
    }
    return {
      ok: true,
      state: data.state,
      outcome: data.outcome,
      subscriberId: data.subscriberId,
    };
  } catch {
    return { ok: false, code: "NETWORK" };
  }
}

/**
 * Subscribe (or re-subscribe). The server answers uniformly.
 * `honeypot` is the hidden form field no human fills — when it
 * carries a value the server silently discards the call while
 * answering success (owner's rule, 2026-10-27).
 */
export function subscribeEmail(
  email: string,
  honeypot?: string,
): Promise<FunctionCallResult> {
  return callFunction("subscribe", {
    email,
    ...(honeypot ? { homepage: honeypot } : {}),
  });
}

/** Ask for a fresh verification email. Same uniform answer. */
export function resendVerification(email: string): Promise<FunctionCallResult> {
  return callFunction("resend-verification", { email });
}

/** Consume a verification token from the emailed link. */
export function verifySubscriptionToken(
  token: string,
): Promise<FunctionCallResult> {
  return callFunction("verify-subscription", { token });
}

/** Unsubscribe via the signed link token ("<id>.<signature>"). */
export function unsubscribeByToken(t: string): Promise<FunctionCallResult> {
  return callFunction("unsubscribe", { t });
}

/**
 * Does the subscription this browser remembers still exist?
 * (Owner's rule, 2026-10-27: after an Admin deletes a
 * subscriber, that browser must be offered the Subscribe Popup
 * again.) Returns true/false when the status function answers,
 * or null when it cannot be reached (not deployed yet, network)
 * — callers must treat null as "unknown" and keep the local
 * memory unchanged.
 */
export async function checkSubscriptionExists(
  id: string,
): Promise<boolean | null> {
  if (!isSupabaseConfigured || !SUPABASE_URL) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/subscription-status?id=${encodeURIComponent(id)}`,
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      exists?: boolean;
    };
    if (!res.ok || data.ok !== true || typeof data.exists !== "boolean") {
      return null;
    }
    return data.exists;
  } catch {
    return null;
  }
}

/**
 * Privileged subscriber action for the Admin Panel. Sends the
 * admin's session token; the function re-checks role + active
 * on the server before doing anything.
 */
export async function adminSubscriberAction(
  action: "delete" | "resend",
  id: string,
): Promise<FunctionCallResult> {
  if (!supabase) return { ok: false, code: "NOT_CONFIGURED" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, code: "NO_SESSION" };
  return callFunction("admin-subscribers", { action, id }, token);
}

/**
 * "আমাকে টেস্ট ইমেইল পাঠাও" (Welcome Email settings page): the
 * server sends the welcome email built from the given
 * headline/body to the signed-in admin's OWN email only — the
 * recipient is resolved from the session on the server.
 */
export async function adminSendWelcomeTest(
  headline: string,
  body: string,
): Promise<FunctionCallResult> {
  if (!supabase) return { ok: false, code: "NOT_CONFIGURED" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, code: "NO_SESSION" };
  return callFunction(
    "admin-subscribers",
    { action: "send-welcome-test", headline, body },
    token,
  );
}
