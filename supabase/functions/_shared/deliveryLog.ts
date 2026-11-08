/**
 * Welcome settings + welcome delivery log (SERVER-SIDE ONLY,
 * Prompt 1 · Step 1, 2026-10-27).
 *
 * Two jobs, both through the SERVICE ROLE (auto-injected by
 * Supabase; never in this repo, never sent to a browser):
 *
 *  1. Read the single `welcome_email_settings` row (migration
 *     0026). service_role holds a SELECT grant on that table
 *     and nothing more — this reader is its only server-side
 *     consumer, and it can never write the settings.
 *
 *  2. Log WELCOME sends in `notice_deliveries` (kind='welcome',
 *     post_id NULL) — the one email log, per the owner's
 *     instruction (no separate email_logs table). The claim
 *     mirrors the announcement store's atomic contract: read,
 *     then a GUARDED update re-checking status + attempts, so
 *     two racing verify calls can never both send. The
 *     idempotency key is 'welcome:<subscriber id>' — one
 *     subscription can produce at most one welcome send, ever;
 *     a row already 'sent' short-circuits before any mail is
 *     attempted (the owner's no-duplicates rule).
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { SubscriberConfigError } from "./subscribers.ts";
import type { WelcomeContent } from "./welcomeEmail.ts";

const SETTINGS_TABLE = "welcome_email_settings";
const DELIVERIES_TABLE = "notice_deliveries";

export interface WelcomeSettings extends WelcomeContent {
  isActive: boolean;
}

export type WelcomeClaim =
  | { state: "claimed"; id: string; attempts: number }
  | { state: "already-sent" };

export interface DeliveryLog {
  readWelcomeSettings(): Promise<WelcomeSettings | null>;
  claimWelcome(subscriberId: string, email: string): Promise<WelcomeClaim>;
  recordWelcomeOutcome(
    id: string,
    attempts: number,
    patch:
      | { status: "sent"; providerMessageId: string | null }
      | { status: "failed"; error: string },
  ): Promise<void>;
}

export function welcomeIdempotencyKey(subscriberId: string): string {
  return `welcome:${subscriberId}`;
}

export function createDeliveryLog(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): DeliveryLog {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new SubscriberConfigError(
      `Missing server environment variable(s): ${missing.join(", ")}`,
    );
  }
  const client = createClient(url as string, serviceKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fail = (context: string, error: { code?: string }) => {
    // PostgREST error codes are safe to log; row data never is.
    throw new Error(`delivery-log:${context}:${error.code ?? "unknown"}`);
  };

  async function findByKey(key: string) {
    const { data, error } = await client
      .from(DELIVERIES_TABLE)
      .select("id, status, attempts")
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) fail("findByKey", error);
    return data as { id: string; status: string; attempts: number } | null;
  }

  return {
    async readWelcomeSettings() {
      const { data, error } = await client
        .from(SETTINGS_TABLE)
        .select("headline, body, is_active")
        .eq("id", 1)
        .maybeSingle();
      if (error) fail("readWelcomeSettings", error);
      if (!data) return null;
      const row = data as { headline: string; body: string; is_active: boolean };
      return {
        headline: row.headline,
        body: row.body,
        isActive: row.is_active,
      };
    },

    async claimWelcome(subscriberId, email) {
      const key = welcomeIdempotencyKey(subscriberId);
      let row = await findByKey(key);
      if (!row) {
        const { error } = await client.from(DELIVERIES_TABLE).insert({
          post_id: null,
          kind: "welcome",
          recipient_kind: "subscriber",
          recipient_email: email,
          idempotency_key: key,
          status: "pending",
          attempts: 0,
        });
        // A racing insert hit the unique key first: re-read and
        // continue with the winner's row.
        if (error && error.code !== "23505") fail("claimWelcome:insert", error);
        row = await findByKey(key);
        if (!row) fail("claimWelcome:reread", { code: "no-row" });
      }
      const current = row as { id: string; status: string; attempts: number };
      if (current.status === "sent") return { state: "already-sent" };
      if (current.status !== "pending" && current.status !== "failed") {
        // 'sending' — another run holds it (or died holding it).
        // Never double-send: report as already handled.
        return { state: "already-sent" };
      }
      const attempts = current.attempts + 1;
      const { data, error } = await client
        .from(DELIVERIES_TABLE)
        .update({
          status: "sending",
          attempts,
          last_attempt_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", current.id)
        .eq("status", current.status)
        .eq("attempts", current.attempts)
        .select("id");
      if (error) fail("claimWelcome:update", error);
      if (!data || data.length === 0) return { state: "already-sent" };
      return { state: "claimed", id: current.id, attempts };
    },

    async recordWelcomeOutcome(id, attempts, patch) {
      const update =
        patch.status === "sent"
          ? {
              status: "sent",
              provider_message_id: patch.providerMessageId,
              sent_at: new Date().toISOString(),
              error: null,
            }
          : {
              status: "failed",
              // The table refuses a failure without a reason and
              // caps it at 500 chars — keep it short and safe.
              error: patch.error.slice(0, 500) || "send failed",
            };
      const { error } = await client
        .from(DELIVERIES_TABLE)
        .update(update)
        .eq("id", id)
        .eq("attempts", attempts);
      if (error) fail("recordWelcomeOutcome", error);
    },
  };
}
