import { useMemo, useState } from "react";
import {
  useAdminFinance,
  STALE_RESULT,
  type FinanceTxnRow,
} from "../../hooks/useAdminFinance";
import { useFinanceSummary } from "../../hooks/useFinanceSummary";
import {
  FINANCE_STATUSES,
  FINANCE_STATUS_LABELS,
  FINANCE_TYPES,
  FINANCE_TYPE_LABELS,
  parseAmount,
  validateFinanceInput,
  type FinanceInput,
  type FinanceStatus,
  type FinanceType,
} from "../../utils/finance";
import { formatBdt, formatDateBn } from "../../utils/format";

/**
 * Finance Management — Phase 4 CRUD + F1 workflow UI (2026-10-24).
 *
 * Workflow (design: FINANCE_F0; migrations 0018/0019 applied
 * separately): Draft Pending Approved; শুধু Approved Record-ই
 * হিসাবে ধরা হয় (finance_summary view থেকে — Client-side কোনো
 * সূত্র নেই)। নতুন Record Draft হিসেবে শুরু হয়; সরাসরি Approved
 * করার কোনো পথ UI-তে নেই। Approved Record মোছা যায় না এবং তার
 * পরিমাণ/ধরন/তারিখ বদলানো যায় না (Database Guard) — বাতিল করতে
 * Cancel, টাকা উল্টাতে Reversal, ভুল Reversal শোধরাতে Correction
 * Entry (সবই Draft হয়ে একই Workflow দিয়ে যায়)। Self-Approval
 * অনুমোদিত (Decision 2) এবং তালিকায় চিহ্নিত থাকে।
 *
 * Migration এখনো প্রয়োগ না হলে Hook LEGACY ধাপে চলে — পুরনো
 * আচরণই (Record সরাসরি হিসাবে) থাকে এবং উপরে বিজ্ঞপ্তি দেখায়;
 * পুরনো Database ভাঙে না।
 */

const EMPTY_FORM: FinanceInput = {
  type: "income",
  amount: "",
  txnDate: new Date().toISOString().slice(0, 10),
  category: "",
  memberId: "",
  donorName: "",
  description: "",
  isPublic: false,
  status: "draft",
  referenceNo: "",
};

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
const btnCls =
  "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";

const STATUS_BADGE: Record<FinanceStatus, string> = {
  draft: "bg-slate-200 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-neutral-200 text-neutral-600",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "নতুন Record",
  UPDATE: "পরিবর্তন",
  DELETE: "মুছে ফেলা হয়েছে",
};

export default function AdminFinancePage() {
  const fin = useAdminFinance();
  const { summary, reload: reloadSummary } = useFinanceSummary();
  const workflow = fin.workflowReady === true;

  const [form, setForm] = useState<FinanceInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<FinanceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [dupPending, setDupPending] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState<{
    id: string;
    kind: "reject" | "cancel";
    reason: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | FinanceType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FinanceStatus>("all");

  const patch = (p: Partial<FinanceInput>) => setForm((f) => ({ ...f, ...p }));

  const memberName = (id: string | null) =>
    id ? (fin.members.find((m) => m.id === id)?.name ?? "—") : "—";
  const personName = (id: string | null) =>
    id ? (fin.profileNames[id] ?? "Finance ব্যবহারকারী") : "—";

  /** Reversal ids that already have a live/in-flight correction. */
  const correctedIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of fin.rows) {
      if (r.corrects_id && r.status && ["draft", "pending", "approved"].includes(r.status)) {
        set.add(r.corrects_id);
      }
    }
    return set;
  }, [fin.rows]);

  const visible = useMemo(() => {
    const q = search.trim();
    return fin.rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (workflow && statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.category, r.donor_name, r.description, r.reference_no, memberName(r.member_id)]
        .some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase()));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fin.rows, search, typeFilter, statusFilter, workflow, fin.members]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setEditingUpdatedAt(null);
    setEditingStatus(null);
    setDupPending(false);
  };

  const startEdit = (row: FinanceTxnRow) => {
    setForm({
      type: row.type as FinanceType,
      amount: String(row.amount),
      txnDate: row.txn_date,
      category: row.category ?? "",
      memberId: row.member_id ?? "",
      donorName: row.donor_name ?? "",
      description: row.description ?? "",
      isPublic: row.is_public,
      status: "draft",
      referenceNo: row.reference_no ?? "",
    });
    setEditingId(row.id);
    setEditingUpdatedAt(row.updated_at);
    setEditingStatus(row.status);
    setMessage(null);
    setDupPending(false);
  };

  /** P1 duplicate warning — same member + type + amount + date. */
  const findDuplicate = (): FinanceTxnRow | null => {
    const amount = parseAmount(form.amount);
    if (amount === null) return null;
    return (
      fin.rows.find(
        (r) =>
          r.type === form.type &&
          Number(r.amount) === amount &&
          r.txn_date === form.txnDate &&
          (r.member_id ?? "") === (form.memberId ?? "") &&
          r.status !== "rejected" &&
          r.status !== "cancelled",
      ) ?? null
    );
  };

  const save = async () => {
    const problem = validateFinanceInput(form);
    if (problem) {
      setMessage({ kind: "err", text: problem });
      return;
    }
    if (!editingId && workflow && !dupPending) {
      const dup = findDuplicate();
      if (dup) {
        setDupPending(true);
        setMessage({
          kind: "warn",
          text: `সতর্কতা: একই সদস্য, ধরন, পরিমাণ (৳${dup.amount}) ও তারিখের একটি Record ইতিমধ্যে আছে — এটি সম্ভাব্য Duplicate হতে পারে। তবুও সংরক্ষণ করতে আবার "সংরক্ষণ করুন" চাপুন।`,
        });
        return;
      }
    }
    setBusy(true);
    const err = editingId
      ? await fin.editTxn(editingId, form, editingUpdatedAt)
      : await fin.createTxn(form);
    setBusy(false);
    if (err === STALE_RESULT) {
      setMessage({
        kind: "err",
        text: "এই Record-টি আপনি Form খোলার পর অন্য কেউ পরিবর্তন করেছেন — পুরনো তথ্য দিয়ে Overwrite করা হয়নি। তালিকা নতুন করে লোড হয়েছে; আবার দেখে সম্পাদনা করুন।",
      });
      resetForm();
      void fin.reload();
      return;
    }
    if (err) {
      setMessage({ kind: "err", text: err });
      return;
    }
    setMessage({
      kind: "ok",
      text: editingId
        ? "পরিবর্তন সংরক্ষিত হয়েছে (যাচাই সম্পন্ন)।"
        : workflow
          ? `নতুন Record তৈরি হয়েছে — অবস্থা: ${form.status === "pending" ? "Pending (অনুমোদনের অপেক্ষায়)" : "Draft"}।`
          : "নতুন Record সংরক্ষিত হয়েছে (যাচাই সম্পন্ন)।",
    });
    resetForm();
    reloadSummary();
  };

  const act = async (run: () => Promise<string | null>, okText: string) => {
    setBusy(true);
    const err = await run();
    setBusy(false);
    if (err) {
      setMessage({ kind: "err", text: err });
      return;
    }
    setMessage({ kind: "ok", text: okText });
    setReasonPrompt(null);
    reloadSummary();
  };

  const doDelete = (id: string) =>
    act(() => fin.deleteTxn(id), "Record-টি মুছে ফেলা হয়েছে (Audit-এ ইতিহাস রয়ে গেছে)।");

  const moneyLocked = workflow && editingStatus === "approved";

  const auditSummary = (row: (typeof fin.auditRows)[number]): string => {
    const oldS = row.old_data?.status as string | undefined;
    const newS = row.new_data?.status as string | undefined;
    if (oldS && newS && oldS !== newS) {
      const lbl = (s: string) =>
        FINANCE_STATUS_LABELS[s as FinanceStatus] ?? s;
      return `অবস্থা: ${lbl(oldS)} ${lbl(newS)}`;
    }
    const oldA = row.old_data?.amount;
    const newA = row.new_data?.amount;
    if (oldA !== undefined && newA !== undefined && Number(oldA) !== Number(newA)) {
      return `পরিমাণ: ৳${oldA} ৳${newA}`;
    }
    return ACTION_LABELS[row.action] ?? row.action;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">আয়-ব্যয় (Finance)</h1>
        <p className="mt-1 text-sm text-neutral-600">
            মোট আয় − মোট ব্যয় = বর্তমান Balance।
          </p>
      </div>

      {fin.workflowReady === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>বিজ্ঞপ্তি:</strong> অনুমোদন-Workflow (Draft/Pending/Approved) এখনো
          সক্রিয় নয় — এর জন্য Database Migration (0018/0019) প্রয়োজন, যা আলাদা
          অনুমোদনে প্রয়োগ হবে। ততদিন Record আগের নিয়মেই সরাসরি হিসাবে যুক্ত হয়।
          Migration-এর পর এই Page-এই Workflow স্বয়ংক্রিয়ভাবে চালু হবে।
        </div>
      )}

      {!fin.isConfigured ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase সংযুক্ত নয় — Finance তথ্য লোড করা যাচ্ছে না।
        </p>
      ) : fin.loadError ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          তথ্য লোড করা যায়নি: {fin.loadError}{" "}
          <button type="button" onClick={() => void fin.reload()} className="font-semibold underline">
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : (
        <>
          {/* ── Summary (all figures from the view) ─────────── */}
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {[
                { label: "মোট আয় (আয়+চাঁদা+অনুদান)", value: summary?.total_income },
                { label: "মোট ব্যয়", value: summary?.total_expense },
                { label: "মোট উত্তোলন (তথ্যমূলক)", value: summary?.total_withdrawn },
                { label: "মোট স্থানান্তর (তথ্যমূলক)", value: summary?.total_transferred },
                { label: "বর্তমান Balance", value: summary?.current_balance },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-neutral-500">{c.label}</p>
                  <p className="mt-1 text-lg font-bold text-neutral-900">
                    {summary ? formatBdt(Number(c.value ?? 0)) : "…"}
                  </p>
                </div>
              ))}
            </div>
            {summary?.hasSplit && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {[
                  { label: "এর মধ্যে আয়", value: summary.income_total },
                  { label: "এর মধ্যে চাঁদা", value: summary.subscription_total },
                  { label: "এর মধ্যে অনুদান", value: summary.donation_total },
                  { label: "Pending আয়/দান (হিসাবে নেই)", value: summary.pending_inflow_total },
                  { label: "Pending ব্যয় (হিসাবে নেই)", value: summary.pending_expense_total },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <p className="text-xs text-neutral-500">{c.label}</p>
                    <p className="mt-1 text-base font-semibold text-neutral-800">
                      {formatBdt(Number(c.value ?? 0))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Form ─────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-neutral-800">
              {editingId ? "Record সম্পাদনা" : "নতুন Record"}
            </h2>
            {moneyLocked && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                এটি একটি <strong>Approved</strong> Record — ধরন, পরিমাণ ও তারিখ
                বদলানো যাবে না। শুধু বিবরণ, Category, সদস্য-সংযোগ ও Public অবস্থা
                বদলানো যাবে। টাকার ভুল হলে Cancel + Reversal ব্যবহার করুন।
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs font-medium text-neutral-600">
                ধরন *
                <select
                  className={inputCls}
                  value={form.type}
                  disabled={moneyLocked}
                  onChange={(e) => patch({ type: e.target.value as FinanceType })}
                >
                  {FINANCE_TYPES.map((t) => (
                    <option key={t} value={t}>{FINANCE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                পরিমাণ (৳) *
                <input
                  className={inputCls}
                  value={form.amount}
                  disabled={moneyLocked}
                  onChange={(e) => patch({ amount: e.target.value })}
                  placeholder="যেমন 1500 বা 1500.50"
                  inputMode="decimal"
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                তারিখ *
                <input
                  type="date"
                  className={inputCls}
                  value={form.txnDate}
                  disabled={moneyLocked}
                  onChange={(e) => patch({ txnDate: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                Category
                <input
                  className={inputCls}
                  value={form.category}
                  onChange={(e) => patch({ category: e.target.value })}
                  placeholder="যেমন মাঠের খরচ"
                />
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                সদস্য (যদি প্রযোজ্য হয়)
                <select
                  className={inputCls}
                  value={form.memberId}
                  onChange={(e) => patch({ memberId: e.target.value })}
                >
                  <option value="">— কোনো সদস্য নয় —</option>
                  {fin.members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-neutral-600">
                দাতা/উৎসের নাম
                <input
                  className={inputCls}
                  value={form.donorName}
                  onChange={(e) => patch({ donorName: e.target.value })}
                />
              </label>
              {workflow && (
                <label className="block text-xs font-medium text-neutral-600">
                  Reference নম্বর (ঐচ্ছিক)
                  <input
                    className={inputCls}
                    value={form.referenceNo ?? ""}
                    onChange={(e) => patch({ referenceNo: e.target.value })}
                    placeholder="যেমন রসিদ/ভাউচার নম্বর"
                  />
                </label>
              )}
              {workflow && !editingId && (
                <label className="block text-xs font-medium text-neutral-600">
                  প্রাথমিক অবস্থা
                  <select
                    className={inputCls}
                    value={form.status ?? "draft"}
                    onChange={(e) => patch({ status: e.target.value as "draft" | "pending" })}
                  >
                    <option value="draft">Draft হিসেবে রাখুন</option>
                    <option value="pending">অনুমোদনের জন্য পাঠান (Pending)</option>
                  </select>
                </label>
              )}
              <label className="block text-xs font-medium text-neutral-600 sm:col-span-2 lg:col-span-3">
                বিবরণ
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </label>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.isPublic}
                onChange={(e) => patch({ isPublic: e.target.checked })}
              />
              <span>
                <strong>Public Summary-তে দেখান</strong> — চালু থাকলে এই Record-টি
                Public Finance Page-এর মোট হিসাবে গণনা হবে
                {workflow ? " (Approved হওয়ার পর)" : ""}। ব্যক্তিগত বিবরণ Public
                Page-এ কখনোই দেখানো হয় না — শুধু মোট সংখ্যা।
              </span>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "পরিবর্তন সংরক্ষণ করুন" : "সংরক্ষণ করুন"}
              </button>
              {editingId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-neutral-700"
                >
                  বাতিল
                </button>
              )}
            </div>
          </section>

          {message && (
            <p
              className={`rounded-lg px-4 py-3 text-sm ${
                message.kind === "ok"
                  ? "bg-green-50 text-green-800"
                  : message.kind === "warn"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </p>
          )}

          {/* ── List ─────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-neutral-800">
                সব Record ({visible.length})
              </h2>
              <div className="ml-auto flex flex-wrap gap-2">
                <select
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as "all" | FinanceType)}
                >
                  <option value="all">সব ধরন</option>
                  {FINANCE_TYPES.map((t) => (
                    <option key={t} value={t}>{FINANCE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {workflow && (
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "all" | FinanceStatus)}
                  >
                    <option value="all">সব অবস্থা</option>
                    {FINANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>{FINANCE_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                )}
                <input
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  placeholder="খুঁজুন (Category/নাম/Reference)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {fin.loading ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">লোড হচ্ছে…</p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">
                কোনো Finance Record নেই।
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visible.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {FINANCE_TYPE_LABELS[row.type as FinanceType] ?? row.type}
                      </span>
                      <span className="text-sm font-bold text-neutral-900">
                        {formatBdt(row.amount)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatDateBn(row.txn_date)}
                      </span>
                      {workflow && row.status && (
                        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[row.status]}`}>
                          {FINANCE_STATUS_LABELS[row.status]}
                        </span>
                      )}
                      {row.reversal_of && (
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-800">
                          Reversal
                        </span>
                      )}
                      {row.corrects_id && (
                        <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                          Correction
                        </span>
                      )}
                      {row.reference_no && (
                        <span className="text-[11px] text-neutral-400">Ref: {row.reference_no}</span>
                      )}
                      <span className="ml-auto flex flex-wrap gap-1">
                        {(!workflow || row.status === "draft" || row.status === "pending") && (
                          <button type="button" disabled={busy} onClick={() => startEdit(row)} className={`${btnCls} bg-slate-100 text-slate-700`}>
                            সম্পাদনা
                          </button>
                        )}
                        {workflow && row.status === "approved" && (
                          <button type="button" disabled={busy} onClick={() => startEdit(row)} className={`${btnCls} bg-slate-100 text-slate-700`}>
                            বিবরণ সম্পাদনা
                          </button>
                        )}
                        {workflow && row.status === "draft" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void act(() => fin.setStatus(row.id, "pending"), "Record-টি অনুমোদনের জন্য পাঠানো হয়েছে (Pending)।")}
                            className={`${btnCls} bg-amber-100 text-amber-800`}
                          >
                            Submit করুন
                          </button>
                        )}
                        {workflow && row.status === "pending" && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void act(() => fin.setStatus(row.id, "approved"), "Record-টি Approved হয়েছে — এখন হিসাবে ধরা হবে।")}
                              className={`${btnCls} bg-green-600 text-white`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setReasonPrompt({ id: row.id, kind: "reject", reason: "" })}
                              className={`${btnCls} bg-red-100 text-red-700`}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setReasonPrompt({ id: row.id, kind: "cancel", reason: "" })}
                              className={`${btnCls} bg-neutral-200 text-neutral-700`}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {workflow && row.status === "approved" && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setReasonPrompt({ id: row.id, kind: "cancel", reason: "" })}
                              className={`${btnCls} bg-neutral-200 text-neutral-700`}
                            >
                              Cancel
                            </button>
                            {!row.reversal_of && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void act(() => fin.createReversal(row), "Reversal (Draft) তৈরি হয়েছে — তালিকায় যাচাই করে Submit ও Approve করুন; তখনই হিসাব শূন্যে মিলবে।")}
                                className={`${btnCls} bg-purple-100 text-purple-800`}
                              >
                                Reversal তৈরি
                              </button>
                            )}
                            {row.reversal_of && !correctedIds.has(row.id) && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void act(() => fin.createCorrection(row), "Correction Entry (Draft) তৈরি হয়েছে — যাচাই করে Submit ও Approve করুন।")}
                                className={`${btnCls} bg-indigo-100 text-indigo-800`}
                              >
                                Correction তৈরি
                              </button>
                            )}
                          </>
                        )}
                        {(!workflow || row.status === "draft") &&
                          (confirmDeleteId === row.id ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void doDelete(row.id)}
                                className={`${btnCls} bg-red-600 text-white`}
                              >
                                নিশ্চিত মুছুন
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className={`${btnCls} bg-slate-100 text-slate-600`}
                              >
                                থাক
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDeleteId(row.id)}
                              className={`${btnCls} bg-red-50 text-red-600`}
                            >
                              মুছুন
                            </button>
                          ))}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">
                      {[
                        row.category,
                        row.member_id ? `সদস্য: ${memberName(row.member_id)}` : null,
                        row.donor_name,
                        row.description,
                        row.is_public ? "Public হিসাবে আছে" : "Public নয়",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {workflow && (
                      <p className="mt-0.5 text-[11px] text-neutral-400">
                        তৈরি: {personName(row.created_by)}
                        {row.status === "approved" && row.approved_by
                          ? ` · অনুমোদন: ${personName(row.approved_by)}`
                          : ""}
                        {row.status === "approved" &&
                        row.approved_by &&
                        row.created_by &&
                        row.approved_by === row.created_by
                          ? " · নিজে অনুমোদিত (Self-approved)"
                          : ""}
                        {row.status_reason ? ` · কারণ: ${row.status_reason}` : ""}
                      </p>
                    )}
                    {reasonPrompt && reasonPrompt.id === row.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
                        <input
                          className="min-w-52 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                          placeholder={
                            reasonPrompt.kind === "reject"
                              ? "প্রত্যাখ্যানের কারণ (ঐচ্ছিক)"
                              : "বাতিলের কারণ (ঐচ্ছিক)"
                          }
                          value={reasonPrompt.reason}
                          onChange={(e) =>
                            setReasonPrompt({ ...reasonPrompt, reason: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                fin.setStatus(
                                  row.id,
                                  reasonPrompt.kind === "reject" ? "rejected" : "cancelled",
                                  reasonPrompt.reason,
                                ),
                              reasonPrompt.kind === "reject"
                                ? "Record-টি Rejected হয়েছে — হিসাবে ধরা হবে না।"
                                : "Record-টি Cancelled হয়েছে — হিসাবে ধরা হবে না।",
                            )
                          }
                          className={`${btnCls} bg-red-600 text-white`}
                        >
                          নিশ্চিত করুন
                        </button>
                        <button
                          type="button"
                          onClick={() => setReasonPrompt(null)}
                          className={`${btnCls} bg-slate-200 text-slate-700`}
                        >
                          থাক
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Audit history (read-only) ────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-neutral-800">
              Audit History (সর্বশেষ ৫০টি পরিবর্তন)
            </h2>
            {fin.auditRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">
                এখনো কোনো পরিবর্তনের ইতিহাস নেই।
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {fin.auditRows.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-neutral-600">
                    <span className="font-medium text-neutral-800">{auditSummary(a)}</span>
                    <span>
                      {(a.new_data?.type as string) ?? (a.old_data?.type as string) ?? ""}
                      {a.new_data?.amount !== undefined || a.old_data?.amount !== undefined
                        ? ` · ৳${(a.new_data?.amount as number) ?? (a.old_data?.amount as number)}`
                        : ""}
                    </span>
                    <span className="ml-auto text-neutral-400">
                      {personName(a.changed_by)} · {formatDateBn(a.changed_at.slice(0, 10))}{" "}
                      {a.changed_at.slice(11, 16)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-4 py-2 text-[11px] text-neutral-400">
              এই ইতিহাস Database স্বয়ংক্রিয়ভাবে লেখে — এখান থেকে বদলানো বা মোছা যায় না।
            </p>
          </section>
        </>
      )}
    </div>
  );
}
