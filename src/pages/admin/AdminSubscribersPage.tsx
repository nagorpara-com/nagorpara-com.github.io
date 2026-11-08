import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  useAdminSubscribers,
  type SubscriberFilter,
} from "../../hooks/useAdminSubscribers";
import type { EmailSubscriber } from "../../types/database.types";
import { adminSubscriberAction } from "../../utils/subscription";
import { formatDateBn } from "../../utils/format";

/**
 * Admin — Email Subscribers (Phase C / C2).
 *
 * The list is Admin-only at the DATABASE level (RLS: no other
 * role can read a single row), and this page also refuses to
 * render it for non-admin roles. Privileged actions go through
 * the admin-subscribers Edge Function, which re-authorizes the
 * caller on the server — never through a direct table write
 * from here. Removal is DELETE only (owner's rule, 2026-10-27):
 * there is no unsubscribe/inactive action — a subscriber leaves
 * the list by being deleted, here or through their own emailed
 * unsubscribe link.
 */

const FILTERS: { key: SubscriberFilter; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "pending", label: "যাচাই বাকি (Pending)" },
  { key: "verified", label: "সক্রিয় (Active)" },
];

function statusPill(status: EmailSubscriber["status"]) {
  if (status === "verified")
    return (
      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
        সক্রিয় (Active)
      </span>
    );
  if (status === "unsubscribed")
    return (
      <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600">
        আনসাবস্ক্রাইব
      </span>
    );
  return (
    <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-bold text-yellow-700">
      যাচাই বাকি (Pending)
    </span>
  );
}

function timeLine(label: string, value: string | null) {
  if (!value) return null;
  return (
    <p>
      {label}: <span className="font-medium">{formatDateBn(value)}</span>
    </p>
  );
}

export default function AdminSubscribersPage() {
  const auth = useAuth();
  const isAdmin = auth.profile?.role === "admin";
  const [filter, setFilter] = useState<SubscriberFilter>("all");
  const [search, setSearch] = useState("");
  const { rows, total, loading, error, refresh } = useAdminSubscribers(
    filter,
    search,
  );
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-extrabold text-slate-800">ইমেইল গ্রাহক</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          গ্রাহক তালিকা শুধু Admin দেখতে ও পরিচালনা করতে পারেন। আপনার ভূমিকা
          দিয়ে এই অংশে প্রবেশের অনুমতি নেই — ডাটাবেস স্তরেও তালিকাটি আপনার
          জন্য বন্ধ।
        </div>
      </div>
    );
  }

  async function runAction(
    action: "delete",
    row: EmailSubscriber,
  ) {
    setActingId(row.id);
    setNotice(null);
    const result = await adminSubscriberAction(action, row.id);
    setActingId(null);
    setConfirmDeleteId(null);
    if (!result.ok) {
      setNotice(
        result.code === "FUNCTION_NOT_CONFIGURED" || result.code === "NOT_CONFIGURED"
          ? "সার্ভার ফাংশন এখনো চালু হয়নি — এই কাজটি আপাতত করা যাচ্ছে না।"
          : result.code === "FORBIDDEN"
            ? "অনুমতি যাচাইয়ে ব্যর্থ — আবার লগইন করে চেষ্টা করুন।"
            : "কাজটি করা যায়নি — আবার চেষ্টা করুন।",
      );
      return;
    }
    setNotice(`${row.email} — তালিকা থেকে মুছে ফেলা হয়েছে।`);
    void refresh();
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">ইমেইল গ্রাহক</h1>
        <p className="mt-1 text-sm text-slate-500">
            সাবস্ক্রাইব করা ব্যক্তিদের তালিকা।
          </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              filter === f.key
                ? "bg-primary text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ইমেইল দিয়ে খুঁজুন..."
          aria-label="ইমেইল দিয়ে খুঁজুন"
          className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 sm:max-w-xs"
        />
        <span className="text-sm text-slate-500">মোট {total} জন</span>
      </div>

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-medium text-dark-green"
        >
          {notice}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">গ্রাহক তালিকা লোড হচ্ছে...</p>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          তালিকা আনা যায়নি: {error}
          <span className="mt-1 block text-xs">
            (গ্রাহক Table এখনো তৈরি না হয়ে থাকলে — Migration 0014 প্রয়োগের
            পর তালিকা কাজ করবে।)
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          এই ফিল্টারে কোনো গ্রাহক নেই। ওয়েবসাইটের ফুটারের ফর্ম থেকে
          সাবস্ক্রাইব করলে এখানে দেখা যাবে (যাচাই বাকি অবস্থায়)।
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-semibold text-slate-800">
                      {row.email}
                    </span>
                    {statusPill(row.status)}
                    <span className="text-xs text-slate-400">
                      {row.source === "admin" ? "Admin যোগ করেছেন" : "ওয়েবসাইট থেকে"}
                    </span>
                  </p>
                  <div className="mt-1.5 grid gap-0.5 text-xs text-slate-500">
                    {timeLine("সাবস্ক্রাইব (সম্মতি)", row.consent_at)}
                    {timeLine("যাচাই সম্পন্ন", row.verified_at)}
                    {timeLine("আনসাবস্ক্রাইব", row.unsubscribed_at)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {confirmDeleteId === row.id ? (
                    <>
                      <button
                        type="button"
                        disabled={actingId === row.id}
                        onClick={() => void runAction("delete", row)}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                      >
                        {actingId === row.id ? "মোছা হচ্ছে..." : "নিশ্চিত মুছুন"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50"
                      >
                        বাতিল
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(row.id)}
                      className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
                    >
                      মুছে ফেলুন
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
