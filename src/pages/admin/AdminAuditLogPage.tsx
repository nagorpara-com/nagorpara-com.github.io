import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAdminAuditLog, type AuditActionFilter, type AuditEntityFilter } from "../../hooks/useAdminAuditLog";
import {
  actionLabel,
  changeEntries,
  entityLabel,
  shortId,
  type AuditLogRow,
} from "../../utils/auditLog";
import { formatDateBn } from "../../utils/format";

/**
 * General Audit Log (Section 03) — READ-ONLY history of changes to
 * profiles, news posts and site settings (migration 0020). There is
 * deliberately no create/edit/delete here: the database lets only
 * the audit trigger write, and only Admins read. Finance keeps its
 * own audit trail inside the Finance page — not mixed in here.
 *
 * Until migration 0020 is applied live, the table does not exist
 * and this page says so honestly (no invented rows).
 */

const inputCls =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
const whiteBtn =
  "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60";

function actionBadgeCls(action: string): string {
  if (action === "insert") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (action === "delete") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function timeBn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" });
}

function AuditRowItem({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  const entries = changeEntries(row.changes);
  const actor = row.actor_name ?? (row.actor_id ? "অজানা ব্যবহারকারী" : "সিস্টেম/সরাসরি");
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${actionBadgeCls(row.action)}`}>
              {actionLabel(row.action)}
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              {entityLabel(row.entity_type)}
            </span>
            <span className="break-words font-semibold text-slate-800">{row.entity_label ?? shortId(row.entity_id)}</span>
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            করেছেন: <span className="font-medium text-slate-700">{actor}</span>
            {" · "}
            {formatDateBn(row.created_at)} · {timeBn(row.created_at)}
            {" · "}Record ID: <span className="font-mono">{shortId(row.entity_id)}</span>
          </p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className={whiteBtn} aria-expanded={open}>
          {open ? "বিস্তারিত লুকান" : "বিস্তারিত"}
        </button>
      </div>
      {open && (
        <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">
            সম্পূর্ণ Record ID: <span className="font-mono break-all">{row.entity_id}</span>
          </p>
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Field-ভিত্তিক পরিবর্তনের বিবরণ নেই।</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {entries.map((e) => (
                <li key={e.field} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold text-slate-700">{e.label}:</span>
                  {e.redacted ? (
                    <span className="font-medium text-slate-500">পরিবর্তিত হয়েছে — গোপনীয়তার জন্য মান দেখানো হয় না</span>
                  ) : (
                    <span className="text-slate-600">
                      <span className="text-slate-500">{e.oldText}</span>
                      <span className="mx-1 text-slate-400"></span>
                      <span className="font-medium text-slate-800">{e.newText}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function AdminAuditLogPage() {
  const { profile, loading: authLoading } = useAuth();
  const audit = useAdminAuditLog();
  const isAdmin = profile?.role === "admin" && profile?.is_active;

  if (authLoading) {
    return <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">লোড হচ্ছে…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="grid gap-4">
        <h1 className="text-xl font-bold text-dark-green">নিরীক্ষা লগ</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <p className="font-semibold text-amber-800">এই পেজটি শুধু Admin-এর জন্য</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-amber-700">
            নিরীক্ষা লগে Profile, সংবাদ ও সেটিংসের পরিবর্তনের ইতিহাস থাকে — Database-এর নিয়মে শুধু Admin-ই এটি পড়তে পারেন।
          </p>
          <Link to="/admin" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-dark-green">
            ড্যাশবোর্ডে যান
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-bold text-dark-green">নিরীক্ষা লগ</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
            পরিবর্তনের ইতিহাস — শুধু পড়ার জন্য।
          </p>
      </div>

      {audit.missingTable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <p className="font-semibold text-amber-800">নিরীক্ষা লগ এখনো সক্রিয় হয়নি</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-amber-700">
            এর Database অংশ (Migration 0020 — General Audit Log) Live Database-এ এখনো প্রয়োগ করা হয়নি। প্রয়োগের পর থেকে
            সব পরিবর্তন এখানে নিজে নিজে জমা হবে। এর আগে কোনো ইতিহাস নেই — তাই এখানে কিছু দেখানো হচ্ছে না।
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Table ছাঁকনি"
              className={inputCls}
              value={audit.entityFilter}
              onChange={(e) => audit.applyFilters({ entity: e.target.value as AuditEntityFilter })}
            >
              <option value="all">সব Table</option>
              <option value="profiles">ব্যবহারকারী প্রোফাইল</option>
              <option value="news_posts">সংবাদ / নোটিশ</option>
              <option value="site_settings">সাইট সেটিংস</option>
            </select>
            <select
              aria-label="Action ছাঁকনি"
              className={inputCls}
              value={audit.actionFilter}
              onChange={(e) => audit.applyFilters({ action: e.target.value as AuditActionFilter })}
            >
              <option value="all">সব Action</option>
              <option value="insert">তৈরি</option>
              <option value="update">পরিবর্তন</option>
              <option value="delete">মোছা</option>
            </select>
            <input
              type="search"
              className={`${inputCls} min-w-56 flex-1`}
              placeholder="Record-এর নাম, যিনি করেছেন, বা ID দিয়ে খুঁজুন"
              value={audit.search}
              onChange={(e) => audit.applyFilters({ search: e.target.value })}
            />
          </div>

          {audit.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-red-700">{audit.error}</p>
              <button type="button" onClick={() => void audit.reload()} className={`${whiteBtn} mt-3`}>
                আবার চেষ্টা করুন
              </button>
            </div>
          ) : audit.loading ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">লোড হচ্ছে…</p>
          ) : audit.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              এই ছাঁকনিতে কোনো ইতিহাস পাওয়া যায়নি।
            </p>
          ) : (
            <ul className="grid gap-3">
              {audit.rows.map((row) => (
                <AuditRowItem key={row.id} row={row} />
              ))}
            </ul>
          )}

          {audit.total > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>মোট {audit.total}টি ইতিহাস — পৃষ্ঠা {audit.page} / {audit.totalPages}</span>
              <span className="flex gap-2">
                <button type="button" disabled={audit.page <= 1} onClick={() => audit.setPage(audit.page - 1)} className={whiteBtn}>← আগের</button>
                <button type="button" disabled={audit.page >= audit.totalPages} onClick={() => audit.setPage(audit.page + 1)} className={whiteBtn}>পরের</button>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
