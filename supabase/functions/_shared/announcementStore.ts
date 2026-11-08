/**
 * Supabase-backed AnnouncementStore (SERVER-SIDE ONLY).
 *
 * Uses the SERVICE ROLE key (auto-injected by Supabase; never in
 * this repo, never sent to a browser). The service role bypasses
 * RLS, which is why the send-announcement function authorizes the
 * caller itself (authorizeAdmin) before touching this store —
 * and why migration 0015 gives the API roles no write path at
 * all: this store is the ONLY writer of notice_deliveries.
 *
 * The claim is a read followed by a GUARDED update (the same
 * pattern as subscriberStore.updateGuarded): the update re-checks
 * the exact status + attempts it read, under the row lock, so of
 * two racing runs only the first matches — the second's WHERE
 * clause no longer fits once the status has flipped to 'sending'.
 * That is the atomic-claim contract of migration 0015.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { SubscriberConfigError } from "./subscribers.ts";
import type {
  AnnouncementPost,
  AnnouncementStore,
  DeliveryRow,
} from "./announcement.ts";

const POSTS_TABLE = "news_posts";
const SUBSCRIBERS_TABLE = "email_subscribers";
const DELIVERIES_TABLE = "notice_deliveries";

export function createAnnouncementStore(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): AnnouncementStore {
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
    throw new Error(`announcement-store:${context}:${error.code ?? "unknown"}`);
  };

  return {
    async getPost(postId) {
      const { data, error } = await client
        .from(POSTS_TABLE)
        .select("id, type, title, slug, content, is_published, button_text, button_url")
        .eq("id", postId)
        .maybeSingle();
      if (error) fail("getPost", error);
      return (data as AnnouncementPost) ?? null;
    },

    async listVerifiedSubscribers() {
      const { data, error } = await client
        .from(SUBSCRIBERS_TABLE)
        .select("id, email")
        .eq("status", "verified")
        .order("created_at", { ascending: true });
      if (error) fail("listVerifiedSubscribers", error);
      return (data as { id: string; email: string }[]) ?? [];
    },

    async insertPending(postId, emails) {
      if (emails.length === 0) return;
      const rows = emails.map((email) => ({
        post_id: postId,
        kind: "notification",
        recipient_kind: "subscriber",
        recipient_email: email,
        // The idempotency identity of this logical send (0026):
        // the same triple the 0015 unique constraint enforces,
        // as one key — re-running a publish can never create a
        // second row (or a second email) for the same recipient.
        idempotency_key: `notice:${postId}:${email}`,
      }));
      const { error } = await client
        .from(DELIVERIES_TABLE)
        .upsert(rows, {
          onConflict: "post_id,recipient_kind,recipient_email",
          ignoreDuplicates: true,
        });
      if (error) fail("insertPending", error);
    },

    async listDeliveries(postId) {
      const { data, error } = await client
        .from(DELIVERIES_TABLE)
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) fail("listDeliveries", error);
      return (data as DeliveryRow[]) ?? [];
    },

    async claim(id, claimable, nowIso) {
      const { data: current, error: readError } = await client
        .from(DELIVERIES_TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (readError) fail("claim:read", readError);
      const row = current as DeliveryRow | null;
      if (!row || !claimable.includes(row.status)) return null;
      const { data, error } = await client
        .from(DELIVERIES_TABLE)
        .update({
          status: "sending",
          attempts: row.attempts + 1,
          last_attempt_at: nowIso,
          error: null,
        })
        .eq("id", id)
        .eq("status", row.status)
        .eq("attempts", row.attempts)
        .select("*");
      if (error) fail("claim:update", error);
      if (!data || data.length === 0) return null; // lost the race
      return data[0] as DeliveryRow;
    },

    async recordOutcome(id, attempts, patch) {
      const { data, error } = await client
        .from(DELIVERIES_TABLE)
        .update(patch as Record<string, unknown>)
        .eq("id", id)
        .eq("status", "sending")
        .eq("attempts", attempts)
        .select("id");
      if (error) fail("recordOutcome", error);
      return (data?.length ?? 0) > 0;
    },

    async closeStaleSending(postId, cutoffIso, errorText) {
      const { data, error } = await client
        .from(DELIVERIES_TABLE)
        .update({ status: "failed", error: errorText })
        .eq("post_id", postId)
        .eq("status", "sending")
        .lt("last_attempt_at", cutoffIso)
        .select("id");
      if (error) fail("closeStaleSending", error);
      return ((data as { id: string }[]) ?? []).map((r) => r.id);
    },
  };
}
