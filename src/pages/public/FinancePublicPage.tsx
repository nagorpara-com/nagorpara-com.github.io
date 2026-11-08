import { useMemo, useState } from "react";
import SectionHeading from "../../components/home/SectionHeading";
import { useFinanceSummary } from "../../hooks/useFinanceSummary";
import {
  INFLOW_TYPES,
  usePublicFinanceTransactions,
  type PublicFinanceTransaction,
} from "../../hooks/usePublicFinanceTransactions";
import { formatBdt, formatDateBn } from "../../utils/format";
import { FINANCE_TYPE_LABELS, type FinanceType } from "../../utils/finance";

/**
 * Public Finance page — redesigned 2026-10-30 to the owner's
 * approved design (desktop + mobile mockups approved in chat):
 *
 *   1. Three summary cards — current balance first (dark green,
 *      gold figure), then total income with its split
 *      (চাঁদা / অনুদান / অন্যান্য আয়), then total expense with
 *      the informational withdrawal/transfer lines.
 *   2. খাত অনুযায়ী হিসাব — per-category bars for the income
 *      side and the expense side.
 *   3. লেনদেনের তালিকা — the public transactions, newest first,
 *      with a month filter; a table on desktop, stacked cards
 *      on mobile.
 *
 * Data discipline (unchanged from the previous page): headline
 * totals come from the `finance_summary` view — never hardcoded.
 * The split, bars and list are computed from the SAME public
 * rows (RLS limits anonymous reads to `is_public` rows, and
 * usePublicFinanceTransactions selects display-safe columns
 * only — no names or personal data). Balance rule (owner):
 * balance = (income + subscription + donation) − expense;
 * withdrawal/transfer are informational and never counted.
 * A failed summary fetch shows an error with retry — never
 * disguised as zeros.
 */
export default function FinancePublicPage() {
  const [retryKey, setRetryKey] = useState(0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10">
      <SectionHeading title="আর্থিক সারসংক্ষেপ" as="h1" />
      <p className="-mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
        সংগঠনের অর্থের হিসাব সবার জন্য উন্মুক্ত রাখা আমাদের অঙ্গীকার। নিচের হিসাবটি শুধু সেই
        লেনদেনগুলোর, যেগুলো সংগঠন প্রকাশ্য হিসেবে চিহ্নিত করেছে।
      </p>
      {/* key remounts the section so "আবার চেষ্টা করুন" really refetches */}
      <FinanceSection key={retryKey} onRetry={() => setRetryKey((k) => k + 1)} />
    </div>
  );
}

function FinanceSection({ onRetry }: { onRetry: () => void }) {
  const { summary, loading, error } = useFinanceSummary();
  const txns = usePublicFinanceTransactions();
  const [month, setMonth] = useState<string>("all");

  const derived = useMemo(() => derive(txns.rows), [txns.rows]);
  const months = useMemo(() => monthOptions(txns.rows), [txns.rows]);
  const visibleRows = useMemo(
    () => (month === "all" ? txns.rows : txns.rows.filter((r) => r.txn_date.startsWith(month))),
    [txns.rows, month],
  );

  if (loading) {
    return <p className="mt-8 text-sm text-neutral-500">হিসাব লোড হচ্ছে…</p>;
  }
  if (error || !summary) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
        হিসাবটি এখন লোড করা যাচ্ছে না।
        <button type="button" onClick={onRetry} className="ml-3 font-semibold underline">
          আবার চেষ্টা করুন
        </button>
      </div>
    );
  }

  const hasAnyTxn = txns.rows.length > 0;

  return (
    <>
      {/* 1 — Summary cards */}
      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl bg-brand-dark p-5 shadow-[0_1px_4px_rgba(0,0,0,0.12)]">
          <p className="text-sm font-medium text-white/70">বর্তমান ব্যালেন্স</p>
          <p className="mt-1 text-3xl font-extrabold text-gold">{formatBdt(summary.current_balance)}</p>
          <p className="mt-2 text-[13px] text-white/60">মোট আয় − মোট ব্যয় = বর্তমান ব্যালেন্স</p>
        </div>
        <div className="np-card p-5">
          <p className="text-sm font-medium text-neutral-500">মোট আয় (আয় + চাঁদা + অনুদান)</p>
          <p className="mt-1 text-3xl font-extrabold text-brand">{formatBdt(summary.total_income)}</p>
          {!txns.loading && !txns.error && hasAnyTxn && (
            <div className="mt-3 grid gap-1 border-t border-dashed border-neutral-200 pt-2.5 text-[13.5px] text-neutral-600">
              <p className="flex items-center justify-between">
                <span>সদস্যদের চাঁদা</span>
                <b className="text-brand-dark">{formatBdt(derived.split.subscription)}</b>
              </p>
              <p className="flex items-center justify-between">
                <span>অনুদান</span>
                <b className="text-brand-dark">{formatBdt(derived.split.donation)}</b>
              </p>
              <p className="flex items-center justify-between">
                <span>অন্যান্য আয়</span>
                <b className="text-brand-dark">{formatBdt(derived.split.income)}</b>
              </p>
            </div>
          )}
        </div>
        <div className="np-card p-5">
          <p className="text-sm font-medium text-neutral-500">মোট ব্যয়</p>
          <p className="mt-1 text-3xl font-extrabold text-red-600">{formatBdt(summary.total_expense)}</p>
          {(summary.total_withdrawn > 0 || summary.total_transferred > 0) && (
            <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
              মোট উত্তোলন (তথ্যের জন্য): {formatBdt(summary.total_withdrawn)}
              <br />
              মোট স্থানান্তর (তথ্যের জন্য): {formatBdt(summary.total_transferred)}
            </p>
          )}
        </div>
      </div>

      {txns.loading ? (
        <p className="mt-8 text-sm text-neutral-500">লেনদেনের তালিকা লোড হচ্ছে…</p>
      ) : txns.error ? (
        <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          লেনদেনের তালিকাটি এখন লোড করা যাচ্ছে না — উপরের মোট হিসাবটি ঠিক আছে।
        </p>
      ) : !hasAnyTxn ? (
        <p className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
          এখনো কোনো প্রকাশ্য লেনদেন যোগ করা হয়নি — তাই সব হিসাব শূন্য দেখাচ্ছে।
        </p>
      ) : (
        <>
          {/* 2 — Per-category bars */}
          <h2 className="mt-10 text-xl font-bold text-brand-dark">খাত অনুযায়ী হিসাব</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <CategoryBox title="আয়ের খাত" tone="in" rows={derived.incomeCats} emptyText="এখনো কোনো আয়ের হিসাব যোগ হয়নি।" />
            <CategoryBox title="ব্যয়ের খাত" tone="out" rows={derived.expenseCats} emptyText="এখনো কোনো ব্যয়ের হিসাব যোগ হয়নি।" />
          </div>

          {/* 3 — Transaction list */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-brand-dark">লেনদেনের তালিকা</h2>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              মাস:
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-10 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm text-neutral-700 outline-none focus:border-brand"
                aria-label="মাস অনুযায়ী লেনদেন দেখুন"
              >
                <option value="all">সব মাস</option>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visibleRows.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
              এই মাসে কোনো প্রকাশ্য লেনদেন নেই।
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="mt-4 hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.12)] sm:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50 text-[13px] text-neutral-500">
                      <th className="px-4 py-3 font-medium">তারিখ</th>
                      <th className="px-4 py-3 font-medium">বিবরণ</th>
                      <th className="px-4 py-3 font-medium">ধরন</th>
                      <th className="px-4 py-3 text-right font-medium">পরিমাণ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-600">{formatDateBn(r.txn_date)}</td>
                        <td className="px-4 py-3">
                          <span className="text-[15px] font-semibold text-neutral-800">{titleOf(r)}</span>
                          {r.description?.trim() && (
                            <span className="block text-[13px] text-neutral-500">{r.description.trim()}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <DirectionChip type={r.type} />
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right text-[15px] font-bold ${amountCls(r.type)}`}>
                          {signedAmount(r)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mt-4 grid gap-2.5 sm:hidden">
                {visibleRows.map((r) => (
                  <div key={r.id} className="np-card p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] text-neutral-500">{formatDateBn(r.txn_date)}</span>
                      <span className={`text-[15px] font-bold ${amountCls(r.type)}`}>{signedAmount(r)}</span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-neutral-800">
                      {titleOf(r)}
                      <DirectionChip type={r.type} />
                    </p>
                    {r.description?.trim() && <p className="mt-0.5 text-[13px] text-neutral-500">{r.description.trim()}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p className="mt-8 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[13px] leading-relaxed text-neutral-500">
        শুধু "Public Summary-তে দেখান" চিহ্নিত Record-ই এই পেজে আসে। কারও নাম বা ব্যক্তিগত তথ্য এই পেজে দেখানো হয়
        না — শুধু তারিখ, খাত, বিবরণ ও পরিমাণ।
      </p>
    </>
  );
}

/* ---------- helpers ---------- */

interface Derived {
  split: Record<"income" | "subscription" | "donation", number>;
  incomeCats: Array<{ label: string; total: number }>;
  expenseCats: Array<{ label: string; total: number }>;
}

function titleOf(r: PublicFinanceTransaction): string {
  return r.category?.trim() || FINANCE_TYPE_LABELS[r.type];
}

function derive(rows: PublicFinanceTransaction[]): Derived {
  const split: Derived["split"] = { income: 0, subscription: 0, donation: 0 };
  const inMap = new Map<string, number>();
  const outMap = new Map<string, number>();
  for (const r of rows) {
    if (INFLOW_TYPES.has(r.type)) {
      split[r.type as keyof Derived["split"]] += r.amount;
      inMap.set(titleOf(r), (inMap.get(titleOf(r)) ?? 0) + r.amount);
    } else if (r.type === "expense") {
      outMap.set(titleOf(r), (outMap.get(titleOf(r)) ?? 0) + r.amount);
    }
    // withdrawal / transfer: informational only — never in the
    // split, the category bars or the balance (owner's rule).
  }
  const toList = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([label, total]) => ({ label, total }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total);
  return { split, incomeCats: toList(inMap), expenseCats: toList(outMap) };
}

function monthOptions(rows: PublicFinanceTransaction[]): Array<{ value: string; label: string }> {
  const seen = new Map<string, string>();
  const fmt = new Intl.DateTimeFormat("bn-BD", { month: "long", year: "numeric" });
  for (const r of rows) {
    const ym = r.txn_date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym) && !seen.has(ym)) {
      const [y, m] = ym.split("-").map(Number);
      seen.set(ym, fmt.format(new Date(y, m - 1, 1)));
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([value, label]) => ({ value, label }));
}

function DirectionChip({ type }: { type: FinanceType }) {
  if (INFLOW_TYPES.has(type)) {
    return (
      <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-brand">আয়</span>
    );
  }
  if (type === "expense") {
    return (
      <span className="inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600">ব্যয়</span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-500">
      {FINANCE_TYPE_LABELS[type]}
    </span>
  );
}

function amountCls(type: FinanceType): string {
  if (INFLOW_TYPES.has(type)) return "text-brand";
  if (type === "expense") return "text-red-600";
  return "text-neutral-500";
}

function signedAmount(r: PublicFinanceTransaction): string {
  if (INFLOW_TYPES.has(r.type)) return `+ ${formatBdt(r.amount)}`;
  if (r.type === "expense") return `− ${formatBdt(r.amount)}`;
  return formatBdt(r.amount);
}

function CategoryBox({
  title,
  tone,
  rows,
  emptyText,
}: {
  title: string;
  tone: "in" | "out";
  rows: Array<{ label: string; total: number }>;
  emptyText: string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  return (
    <section className="np-card p-5" aria-label={title}>
      <h3 className={`text-base font-bold ${tone === "in" ? "text-brand-dark" : "text-red-700"}`}>{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">{emptyText}</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {rows.map((r) => (
            <div key={r.label}>
              <p className="mb-1 flex items-center justify-between text-sm text-neutral-700">
                <span>{r.label}</span>
                <b className="text-neutral-800">{formatBdt(r.total)}</b>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full ${tone === "in" ? "bg-brand" : "bg-red-400"}`}
                  style={{ width: `${max > 0 ? Math.max(6, Math.round((r.total / max) * 100)) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
