import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * The finance_summary view (migration 0001; security_invoker since
 * migration 0008). One row, five totals:
 *   total_income      = income + subscription + donation (combined)
 *   total_expense     = expense
 *   total_withdrawn   = withdrawal   (informational — never in balance)
 *   total_transferred = transfer     (informational — never in balance)
 *   current_balance   = total_income − total_expense
 *
 * Because the view is security_invoker, the SAME query returns the
 * full totals to finance roles and the is_public-only totals to
 * everyone else — each caller sees exactly what its RLS allows.
 * This hook distinguishes a real all-zero summary from a failed
 * fetch (error is reported, never disguised as zeros).
 */
export interface FinanceSummary {
  total_income: number;
  total_expense: number;
  total_withdrawn: number;
  total_transferred: number;
  current_balance: number;
  /** Split totals — present only after migration 0019 extends the view. */
  income_total?: number;
  subscription_total?: number;
  donation_total?: number;
  pending_inflow_total?: number;
  pending_expense_total?: number;
  /** True when the extended (0019) columns were readable. */
  hasSplit?: boolean;
}

const BASE_COLUMNS =
  "total_income, total_expense, total_withdrawn, total_transferred, current_balance";
const SPLIT_COLUMNS =
  "income_total, subscription_total, donation_total, pending_inflow_total, pending_expense_total";

export function useFinanceSummary() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  /** Refetch — the admin page calls this after every verified save/delete. */
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setError("Supabase সংযুক্ত নয়।");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
    const read = (row: Record<string, unknown>, hasSplit: boolean): FinanceSummary => ({
      total_income: num(row.total_income),
      total_expense: num(row.total_expense),
      total_withdrawn: num(row.total_withdrawn),
      total_transferred: num(row.total_transferred),
      current_balance: num(row.current_balance),
      hasSplit,
      ...(hasSplit
        ? {
            income_total: num(row.income_total),
            subscription_total: num(row.subscription_total),
            donation_total: num(row.donation_total),
            pending_inflow_total: num(row.pending_inflow_total),
            pending_expense_total: num(row.pending_expense_total),
          }
        : {}),
    });
    // Try the extended view (post-0019) first; if its columns are not
    // there yet, fall back to the original five so the page keeps
    // working against the pre-migration database.
    supabase
      .from("finance_summary")
      .select(`${BASE_COLUMNS}, ${SPLIT_COLUMNS}`)
      .single()
      .then(async ({ data, error: err }) => {
        if (cancelled) return;
        if (!err && data) {
          setLoading(false);
          setError(null);
          setSummary(read(data as unknown as Record<string, unknown>, true));
          return;
        }
        const { data: base, error: baseErr } = await supabase!
          .from("finance_summary")
          .select(BASE_COLUMNS)
          .single();
        if (cancelled) return;
        setLoading(false);
        if (baseErr || !base) {
          setError(baseErr?.message ?? err?.message ?? "হিসাব লোড করা যায়নি।");
          return;
        }
        setError(null);
        setSummary(read(base as unknown as Record<string, unknown>, false));
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { summary, loading, error, reload };
}
