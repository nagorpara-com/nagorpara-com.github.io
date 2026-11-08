import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { EmailSubscriber } from "../types/database.types";

export type SubscriberFilter = "all" | EmailSubscriber["status"];

/**
 * Admin subscriber list (Master Spec: Phase C2 management).
 * Reads go straight through RLS — only an Admin's session can
 * see any row at all (policy "subscribers: admin reads"); other
 * roles (and logged-out visitors) receive nothing, which the
 * page surfaces honestly. Privileged ACTIONS (delete,
 * resend) never use this read path: they call the
 * admin-subscribers function, which re-authorizes on the server
 * (see src/utils/subscription.ts).
 */
export function useAdminSubscribers(filter: SubscriberFilter, search: string) {
  const [rows, setRows] = useState<EmailSubscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    if (!isSupabaseConfigured || !supabase) {
      setRows([]);
      setTotal(0);
      setError("ডাটাবেস সংযোগ সেটআপ করা হয়নি।");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let query = supabase
      .from("email_subscribers")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") query = query.eq("status", filter);
    const term = search.trim();
    if (term) query = query.ilike("email", `%${term}%`);
    const { data, error: queryError, count } = await query;
    if (id !== requestId.current) return;
    if (queryError) {
      setError(queryError.message);
      setRows([]);
      setTotal(0);
    } else {
      setRows((data ?? []) as EmailSubscriber[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, total, loading, error, refresh };
}
