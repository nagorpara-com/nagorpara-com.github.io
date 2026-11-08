import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client — PREPARATION ONLY (Phase 2).
 *
 * No real project is connected yet, and no fake credentials are used.
 * When the organization creates its Supabase project, copy `.env.example`
 * to `.env` and fill in:
 *   VITE_SUPABASE_URL       — Project Settings > API > Project URL
 *   VITE_SUPABASE_ANON_KEY  — Project Settings > API > anon public key
 *
 * These two values are the ONLY keys allowed in the frontend, and they are
 * safe only because every table is protected by Row Level Security (RLS).
 * The service_role key and the database password must NEVER be placed in
 * this project, in the frontend, or in the GitHub repository.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

/** True only when both public values are present in `.env`. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * The client, or `null` when Supabase is not configured yet.
 * Code must check `isSupabaseConfigured` / handle `null` instead of
 * crashing — the public site shell must still render without a backend.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
