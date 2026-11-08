import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { ContactMessage } from "../types/database.types";

/**
 * Admin Contact Messages data (Phase C / C1, spec section §11).
 *
 * The database is the enforcement: `contact_messages` can be read,
 * updated and deleted ONLY when is_admin() — the anonymous role can
 * insert and nothing more. A non-admin session therefore receives
 * zero rows here, which the page explains honestly. Every write
 * below is additionally gated in the UI (delete is Admin-only), but
 * the RLS policies are what actually decide.
 */
export function useAdminMessages() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("contact_messages")
      .select("id, name, phone, subject, message, is_read, created_at")
      .order("created_at", { ascending: false });
    if (err) {
      setError("বার্তাগুলো লোড করা যায়নি — আবার চেষ্টা করুন।");
      setLoading(false);
      return;
    }
    setMessages((data ?? []) as ContactMessage[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setRead = useCallback(async (id: string, isRead: boolean): Promise<boolean> => {
    if (!supabase) return false;
    const { error: err } = await supabase
      .from("contact_messages")
      .update({ is_read: isRead })
      .eq("id", id);
    if (err) return false;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_read: isRead } : m)),
    );
    return true;
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    const { error: err } = await supabase
      .from("contact_messages")
      .delete()
      .eq("id", id);
    if (err) return false;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    return true;
  }, []);

  return {
    messages,
    loading,
    error,
    reload: load,
    setRead,
    remove,
    isConfigured: isSupabaseConfigured,
  };
}
