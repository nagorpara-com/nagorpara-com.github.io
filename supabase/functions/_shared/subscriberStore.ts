/**
 * Supabase-backed SubscriberStore (SERVER-SIDE ONLY).
 *
 * Uses the SERVICE ROLE key, which Supabase injects into every
 * Edge Function's environment (SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY) — it is never stored in this repo
 * and never sent to a browser. The service role bypasses RLS,
 * which is exactly why ALL access rules live in the flow logic
 * (subscribers.ts) and in each function's own authorization.
 * Table-level RLS (migration 0014) independently ensures the
 * public API roles can do nothing with this table.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import type {
  SubscriberRow,
  SubscriberStore,
} from "./subscribers.ts";
import { SubscriberConfigError } from "./subscribers.ts";

const TABLE = "email_subscribers";
const DELIVERIES_TABLE = "notice_deliveries";

export function createSubscriberStore(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): SubscriberStore {
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

  const fail = (context: string, error: { code?: string; message?: string }) => {
    // PostgREST error codes are safe to log; row data never is.
    throw new Error(`store:${context}:${error.code ?? "unknown"}`);
  };

  return {
    async findByEmail(email) {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (error) fail("findByEmail", error);
      return (data as SubscriberRow) ?? null;
    },
    async findById(id) {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) fail("findById", error);
      return (data as SubscriberRow) ?? null;
    },
    async findByTokenHash(hash) {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("verification_token_hash", hash)
        .maybeSingle();
      if (error) fail("findByTokenHash", error);
      return (data as SubscriberRow) ?? null;
    },
    async insert(row) {
      const { data, error } = await client
        .from(TABLE)
        .insert(row as Record<string, unknown>)
        .select("*")
        .single();
      if (error) fail("insert", error);
      return data as SubscriberRow;
    },
    async update(id, patch) {
      const { error } = await client
        .from(TABLE)
        .update(patch as Record<string, unknown>)
        .eq("id", id);
      if (error) fail("update", error);
    },
    async updateGuarded(id, guard, patch) {
      let query = client
        .from(TABLE)
        .update(patch as Record<string, unknown>)
        .eq("id", id);
      for (const [key, value] of Object.entries(guard)) {
        query = query.eq(key, value as never);
      }
      const { data, error } = await query.select("id");
      if (error) fail("updateGuarded", error);
      return (data?.length ?? 0) > 0;
    },
    async remove(id) {
      const { error } = await client.from(TABLE).delete().eq("id", id);
      if (error) fail("remove", error);
    },
    // Owner rule (2026-11-02): deleting a subscriber removes the
    // person from EVERY section of the panel. All delivery records
    // (announcement sends and welcome sends alike) live in
    // notice_deliveries keyed by recipient_email, so the person's
    // rows there are deleted with them and the address appears in
    // no notice's recipient list again. Needs the service_role
    // DELETE grant on notice_deliveries (migration 0041).
    async removeDeliveriesByEmail(email) {
      const { error } = await client
        .from(DELIVERIES_TABLE)
        .delete()
        .eq("recipient_email", email);
      if (error) fail("removeDeliveriesByEmail", error);
    },
    async list({ status, search, limit, offset }) {
      let query = client
        .from(TABLE)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (status) query = query.eq("status", status);
      if (search) query = query.ilike("email", `%${search}%`);
      const { data, error, count } = await query;
      if (error) fail("list", error);
      return {
        rows: (data as SubscriberRow[]) ?? [],
        total: count ?? 0,
      };
    },
  };
}

/** Admin checker backed by Supabase Auth + the profiles table. */
export function createAdminChecker(
  env: Record<string, string | undefined> = Deno.env.toObject(),
) {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new SubscriberConfigError(
      `Missing server environment variable(s): ${missing.join(", ")}`,
    );
  }
  const authClient = createClient(url as string, anonKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(url as string, serviceKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async getUserId(bearerToken: string): Promise<string | null> {
      const { data, error } = await authClient.auth.getUser(bearerToken);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async getUserEmail(bearerToken: string): Promise<string | null> {
      const { data, error } = await authClient.auth.getUser(bearerToken);
      if (error || !data.user) return null;
      return data.user.email ?? null;
    },
    async getProfile(userId: string) {
      const { data, error } = await serviceClient
        .from("profiles")
        .select("role, is_active")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) return null;
      return data as { role: string; is_active: boolean };
    },
  };
}
