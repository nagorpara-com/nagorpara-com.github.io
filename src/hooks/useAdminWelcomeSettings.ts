import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Welcome Email settings (Prompt 1 · Step 1 + Prompt 3 · Step 3,
 * 2026-10-27): the single `welcome_email_settings` row
 * (migration 0026) that drives the welcome email sent right
 * after a subscription is verified.
 *
 * - The table is ADMIN-ONLY at the database (RLS: is_admin());
 *   this hook runs on the admin's own session.
 * - The table exists only once migration 0026 has been applied;
 *   until then the load reports `tableMissing` and the page
 *   shows an honest notice instead of a broken form.
 * - Save writes, then READS THE ROW BACK and compares every
 *   field (verify_admin_writes rule): a write that did not
 *   actually land is reported as a failure, never as success.
 */

export interface WelcomeSettingsRow {
  headline: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

export const WELCOME_HEADLINE_MAX = 200;
export const WELCOME_BODY_MAX = 5000;

const COLUMNS = "headline, body, is_active, updated_at";

export function useAdminWelcomeSettings() {
  const [row, setRow] = useState<WelcomeSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setError("Supabase সংযুক্ত নেই।");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("welcome_email_settings")
      .select(COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    setLoading(false);
    if (err) {
      if (
        err.code === "42P01" ||
        err.code === "PGRST205" ||
        err.message.includes("welcome_email_settings")
      ) {
        setTableMissing(true);
        return;
      }
      setError("Welcome ইমেইলের তথ্য পড়া যায়নি। আবার চেষ্টা করুন।");
      return;
    }
    setRow((data as WelcomeSettingsRow | null) ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (
      headline: string,
      body: string,
      isActive: boolean,
    ): Promise<{ ok: boolean; message: string }> => {
      if (!supabase) return { ok: false, message: "Supabase সংযুক্ত নেই।" };
      const { error: updateError } = await supabase
        .from("welcome_email_settings")
        .update({ headline, body, is_active: isActive })
        .eq("id", 1);
      if (updateError) {
        return {
          ok: false,
          message:
            "সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন। (টেবিলটি এখনো তৈরি না হয়ে থাকলে Migration 0026 apply করতে হবে।)",
        };
      }
      // Read-back verification: compare every saved field.
      const { data, error: readError } = await supabase
        .from("welcome_email_settings")
        .select(COLUMNS)
        .eq("id", 1)
        .maybeSingle();
      const back = data as WelcomeSettingsRow | null;
      if (
        readError ||
        !back ||
        back.headline !== headline ||
        back.body !== body ||
        back.is_active !== isActive
      ) {
        return {
          ok: false,
          message:
            "সংরক্ষণের পর যাচাইয়ে মিল পাওয়া যায়নি — পেজটি রিফ্রেশ করে দেখুন আসলে কী সংরক্ষিত হয়েছে।",
        };
      }
      setRow(back);
      return { ok: true, message: "সংরক্ষিত হয়েছে ও যাচাই করা হয়েছে।" };
    },
    [],
  );

  return { row, loading, tableMissing, error, reload: load, save };
}
