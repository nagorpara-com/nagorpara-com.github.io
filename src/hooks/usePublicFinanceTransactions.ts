import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type { FinanceType } from "../utils/finance";

/**
 * Public finance transactions for the redesigned public Finance
 * page (owner-approved design, 2026-10-30).
 *
 * Privacy discipline: RLS on `finance_transactions` already
 * limits an anonymous caller to rows an admin marked
 * `is_public = true` (migration 0001), and this hook selects
 * ONLY the display-safe columns — never `donor_name`,
 * `member_id`, `receipt_url` or `created_by`, so no personal
 * data can reach the public page even by accident.
 *
 * The headline totals still come from the `finance_summary`
 * view via useFinanceSummary; this list powers the income
 * split, the per-category bars and the transaction list, all
 * computed from the same public rows the totals are built on.
 */
export interface PublicFinanceTransaction {
  id: string;
  type: FinanceType;
  category: string | null;
  amount: number;
  txn_date: string;
  description: string | null;
}

interface State {
  rows: PublicFinanceTransaction[];
  loading: boolean;
  error: string | null;
}

const COLUMNS = "id, type, category, amount, txn_date, description";

export function usePublicFinanceTransactions() {
  const [state, setState] = useState<State>({ rows: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (!cancelled) setState({ rows: [], loading: false, error: "Supabase সংযুক্ত নেই।" });
        return;
      }
      const res = await fetchAllRows((from, to) =>
        supabase!
          .from("finance_transactions")
          .select(COLUMNS)
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      if (cancelled) return;
      if (res.error) {
        setState({ rows: [], loading: false, error: res.error });
        return;
      }
      const rows = ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        type: r.type as FinanceType,
        category: (r.category as string | null) ?? null,
        amount: Number(r.amount ?? 0),
        txn_date: String(r.txn_date ?? ""),
        description: (r.description as string | null) ?? null,
      }));
      setState({ rows, loading: false, error: null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Types that ADD to the balance (আয় পক্ষ). */
export const INFLOW_TYPES: ReadonlySet<FinanceType> = new Set(["income", "subscription", "donation"]);
