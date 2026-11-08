import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { useAdminCommittee } from "../../hooks/useAdminCommittee";
import { useAdminMembers } from "../../hooks/useAdminMembers";
import type { CommitteeMember } from "../../types/database.types";
import {
  validateCommitteeInput,
  validateTermInput,
  type CommitteeInput,
} from "../../utils/member";

/**
 * Committee Management (R-07, /admin/committee).
 *
 * Committee members belong to a term (committee_terms) — the
 * schema requires term_id — so the page manages terms (create,
 * edit, mark current) and the member rows of the selected term.
 * Writes are enforced by the database policies (admin writes,
 * is_admin()). The public site shows the CURRENT term's
 * committee; older terms stay stored for history.
 */

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";
const whiteBtn =
  "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-dark-green disabled:opacity-60";
const dangerBtn =
  "rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60";

const EMPTY_FORM: CommitteeInput = {
  name: "",
  role_title: "",
  photo_url: "",
  phone: "",
  facebook_url: "",
  is_active: true,
  member_id: "",
  display_order: 0,
};

export default function AdminCommitteePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const data = useAdminCommittee();
  const membersData = useAdminMembers();
  const [form, setForm] = useState<CommitteeInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [termForm, setTermForm] = useState({ title: "", start_date: "", end_date: "", make_current: true });
  const [termErrors, setTermErrors] = useState<Record<string, string>>({});
  const [showTermForm, setShowTermForm] = useState(false);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);

  const selectedTerm = data.terms.find((t) => t.id === data.selectedTermId) ?? null;

  function set<K extends keyof CommitteeInput>(key: K, value: CommitteeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(r: CommitteeMember) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      role_title: r.role_title,
      photo_url: r.photo_url ?? "",
      phone: r.phone ?? "",
      facebook_url: r.facebook_url ?? "",
      is_active: r.is_active,
      member_id: r.member_id ?? "",
      display_order: r.display_order,
    });
    setFieldErrors({});
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const result = validateCommitteeInput(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    const err = editingId
      ? await data.updateRow(editingId, result.value)
      : await data.createRow(result.value);
    setBusy(false);
    if (err) {
      setFeedback({ kind: "err", text: `সংরক্ষণ ব্যর্থ হয়েছে: ${err}` });
      return;
    }
    setFeedback({ kind: "ok", text: editingId ? "কমিটি সদস্যের তথ্য হালনাগাদ হয়েছে।" : "কমিটিতে নতুন সদস্য যোগ হয়েছে।" });
    cancelEdit();
  }

  async function onToggleActive(r: CommitteeMember) {
    setBusy(true);
    const err = await data.setRowActive(r.id, !r.is_active);
    setBusy(false);
    if (err) setFeedback({ kind: "err", text: `অবস্থা বদল ব্যর্থ হয়েছে: ${err}` });
    else setFeedback({ kind: "ok", text: r.is_active ? `“${r.name}” আনপাবলিশ করা হয়েছে — Website-এ আর দেখাবে না।` : `“${r.name}” প্রকাশ করা হয়েছে — Website-এ দেখাবে।` });
  }

  async function onDelete(r: CommitteeMember) {
    setBusy(true);
    const err = await data.deleteRow(r.id);
    setBusy(false);
    setConfirmingDeleteId(null);
    if (err) setFeedback({ kind: "err", text: `মুছে ফেলা ব্যর্থ হয়েছে: ${err}` });
    else {
      setFeedback({ kind: "ok", text: `“${r.name}” কমিটি থেকে মুছে ফেলা হয়েছে।` });
      if (editingId === r.id) cancelEdit();
    }
  }

  async function onCreateTerm(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const result = validateTermInput(termForm);
    if (!result.ok) {
      setTermErrors(result.errors);
      return;
    }
    setTermErrors({});
    setBusy(true);
    const err = await data.createTerm({ ...result.value, make_current: termForm.make_current });
    setBusy(false);
    if (err) {
      setFeedback({ kind: "err", text: `মেয়াদ তৈরি ব্যর্থ হয়েছে: ${err}` });
      return;
    }
    setTermForm({ title: "", start_date: "", end_date: "", make_current: true });
    setShowTermForm(false);
    setFeedback({ kind: "ok", text: "নতুন মেয়াদ তৈরি হয়েছে।" });
  }

  function startEditTerm() {
    if (!selectedTerm) return;
    setEditingTermId(selectedTerm.id);
    setTermForm({
      title: selectedTerm.title,
      start_date: selectedTerm.start_date ?? "",
      end_date: selectedTerm.end_date ?? "",
      make_current: true,
    });
    setTermErrors({});
    setFeedback(null);
    setShowTermForm(true);
  }

  function cancelTermForm() {
    setEditingTermId(null);
    setTermErrors({});
    setShowTermForm(false);
  }

  async function onUpdateTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTermId) return;
    setFeedback(null);
    const result = validateTermInput(termForm);
    if (!result.ok) {
      setTermErrors(result.errors);
      return;
    }
    setTermErrors({});
    setBusy(true);
    const err = await data.updateTerm(editingTermId, result.value);
    setBusy(false);
    if (err) {
      setFeedback({ kind: "err", text: `মেয়াদ সংরক্ষণ ব্যর্থ হয়েছে: ${err}` });
      return;
    }
    setEditingTermId(null);
    setTermForm({ title: "", start_date: "", end_date: "", make_current: true });
    setShowTermForm(false);
    setFeedback({ kind: "ok", text: "মেয়াদ সংরক্ষণ করা হয়েছে।" });
  }

  async function onMakeCurrent() {
    if (!data.selectedTermId) return;
    setBusy(true);
    const err = await data.setCurrentTerm(data.selectedTermId);
    setBusy(false);
    if (err) setFeedback({ kind: "err", text: `বর্তমান মেয়াদ বদল ব্যর্থ হয়েছে: ${err}` });
    else setFeedback({ kind: "ok", text: "এই মেয়াদটিই এখন বর্তমান — Public Website-এ এই কমিটিই দেখাবে।" });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-bold text-dark-green">কমিটি পরিচালনা</h1>
        <p className="mt-1 text-sm text-slate-500">
          কমিটির সদস্য যোগ, সম্পাদনা ও মুছে ফেলুন।
        </p>
      </div>

      {!data.isConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase সংযোগ সেট করা হয়নি — সংযোগ ছাড়া কমিটি লোড বা সংরক্ষণ করা যাবে না।
        </p>
      )}
      {profile && !isAdmin && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          কমিটি বদলানোর অনুমতি শুধু Admin-এর (Database-এর নীতি অনুযায়ী) — আপনার সংরক্ষণ কার্যকর হবে না।
        </p>
      )}
      {feedback && (
        <p className={feedback.kind === "ok" ? "rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-medium text-dark-green" : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"} role="status">
          {feedback.text}
        </p>
      )}

      {/* Term management */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-dark-green">কমিটির মেয়াদ</h2>
          {data.terms.length > 0 && (
            <>
              <select
                aria-label="মেয়াদ বেছে নিন"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={data.selectedTermId ?? ""}
                onChange={(e) => {
                  // Switching terms abandons an in-progress term edit —
                  // the form belongs to the previously selected term.
                  if (editingTermId) cancelTermForm();
                  void data.selectTerm(e.target.value);
                }}
              >
                {data.terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}{t.is_current ? " (বর্তমান)" : ""}</option>
                ))}
              </select>
              {selectedTerm && !selectedTerm.is_current && (
                <button type="button" onClick={() => void onMakeCurrent()} disabled={busy} className={whiteBtn}>বর্তমান মেয়াদ করুন</button>
              )}
              {selectedTerm?.is_current && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-dark-green">বর্তমান মেয়াদ — Website-এ দেখা যাচ্ছে</span>
              )}
              {selectedTerm && (
                <button type="button" onClick={startEditTerm} disabled={busy} className={whiteBtn}>মেয়াদ সম্পাদনা করুন</button>
              )}
            </>
          )}
          <button type="button" onClick={() => {
            if (editingTermId) {
              // Leave edit mode and open a fresh create form instead.
              setEditingTermId(null);
              setTermForm({ title: "", start_date: "", end_date: "", make_current: true });
              setTermErrors({});
              setShowTermForm(true);
            } else {
              setShowTermForm((s) => !s);
            }
          }} className="ml-auto rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50">
            + নতুন মেয়াদ
          </button>
        </div>

        {showTermForm && (
          <form onSubmit={editingTermId ? onUpdateTerm : onCreateTerm} className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ct-title">মেয়াদের নাম *</label>
              <input id="ct-title" className={inputCls} value={termForm.title} maxLength={120} placeholder="যেমন: কার্যকরী কমিটি ২০২৬–২০২৮" onChange={(e) => setTermForm((f) => ({ ...f, title: e.target.value }))} />
              {termErrors.title && <p className="mt-1 text-xs text-red-600">{termErrors.title}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls} htmlFor="ct-start">শুরুর তারিখ</label>
                <input id="ct-start" type="date" className={inputCls} value={termForm.start_date} onChange={(e) => setTermForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ct-end">শেষের তারিখ</label>
                <input id="ct-end" type="date" className={inputCls} value={termForm.end_date} onChange={(e) => setTermForm((f) => ({ ...f, end_date: e.target.value }))} />
                {termErrors.end_date && <p className="mt-1 text-xs text-red-600">{termErrors.end_date}</p>}
              </div>
            </div>
            {editingTermId ? (
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}</button>
                <button type="button" onClick={cancelTermForm} disabled={busy} className={whiteBtn}>বাতিল</button>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={termForm.make_current} onChange={(e) => setTermForm((f) => ({ ...f, make_current: e.target.checked }))} />
                  তৈরি করেই বর্তমান মেয়াদ হিসেবে চালু করো
                </label>
                <div>
                  <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "তৈরি হচ্ছে…" : "মেয়াদ তৈরি করুন"}</button>
                </div>
              </>
            )}
          </form>
        )}

        {data.terms.length === 0 && !data.loading && (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            এখনো কোনো কমিটির মেয়াদ তৈরি হয়নি। “+ নতুন মেয়াদ” দিয়ে প্রথম মেয়াদটি তৈরি করুন — তারপর কমিটির সদস্য যোগ করা যাবে।
          </p>
        )}
      </div>

      {/* Committee member form + list for the selected term */}
      {data.selectedTermId && (
        <>
          <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="font-bold text-dark-green">{editingId ? "কমিটি সদস্য সম্পাদনা" : "কমিটিতে সদস্য যোগ করুন"}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="cm-name">নাম *</label>
                <input id="cm-name" className={inputCls} value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
                {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="cm-role">পদবি *</label>
                <input id="cm-role" className={inputCls} value={form.role_title} maxLength={120} placeholder="যেমন: সভাপতি, সাধারণ সম্পাদক" onChange={(e) => set("role_title", e.target.value)} />
                {fieldErrors.role_title && <p className="mt-1 text-xs text-red-600">{fieldErrors.role_title}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="cm-member">নিবন্ধিত সদস্যের সঙ্গে যুক্ত করুন (ঐচ্ছিক)</label>
                <select id="cm-member" className={inputCls} value={form.member_id} onChange={(e) => set("member_id", e.target.value)}>
                  <option value="">— যুক্ত নয় —</option>
                  {membersData.members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <PhotoUploadField
                  label="ছবি"
                  pathPrefix="committee"
                  sizeHint="800 × 1000 পিক্সেল (অনুপাত 4:5)"
                  value={form.photo_url}
                  onChange={(url) => set("photo_url", url)}
                />
                <div className="mt-2">
                    </div>
                {fieldErrors.photo_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.photo_url}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="cm-phone">মোবাইল নম্বর (ঐচ্ছিক)</label>
                <input id="cm-phone" className={inputCls} value={form.phone} maxLength={11} placeholder="01XXXXXXXXX" onChange={(e) => set("phone", e.target.value)} />
                {fieldErrors.phone && <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>}
                <p className="mt-1 text-xs text-slate-400">প্রকাশিত থাকলে নম্বরটি Website-এর কার্ডে দেখাবে।</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="cm-facebook">মেসেজের লিংক — Facebook প্রোফাইল (ঐচ্ছিক)</label>
                <input id="cm-facebook" className={inputCls} value={form.facebook_url} maxLength={300} placeholder="https://www.facebook.com/…" onChange={(e) => set("facebook_url", e.target.value)} />
                {fieldErrors.facebook_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.facebook_url}</p>}
                <p className="mt-1 text-xs text-slate-400">লিংক দিলে Website-এর কার্ডে "মেসেজ" বাটন এই লিংকে যাবে; না দিলে SMS যাবে।</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="cm-order">ক্রম</label>
                <input id="cm-order" type="number" min={0} className={inputCls} value={form.display_order} onChange={(e) => set("display_order", Number(e.target.value))} />
                {fieldErrors.display_order && <p className="mt-1 text-xs text-red-600">{fieldErrors.display_order}</p>}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              Website-এ প্রকাশিত
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "হালনাগাদ করুন" : "যোগ করুন"}</button>
              {editingId && <button type="button" onClick={cancelEdit} disabled={busy} className={whiteBtn}>বাতিল</button>}
            </div>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="font-bold text-dark-green">কমিটির সদস্য ({data.rows.length}){selectedTerm ? ` — ${selectedTerm.title}` : ""}</h2>
            {data.error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {data.error}{" "}
                <button type="button" onClick={() => void data.reload()} className="font-semibold underline">আবার চেষ্টা করুন</button>
              </div>
            ) : data.loading ? (
              <p className="mt-4 text-sm text-slate-500">লোড হচ্ছে…</p>
            ) : data.rows.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">এই মেয়াদে এখনো কোনো কমিটি সদস্য যোগ করা হয়নি।</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    {r.photo_url ? (
                      <img loading="lazy" src={r.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-accent/60" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden="true">{r.name.trim().charAt(0) || "ক"}</span>
                    )}
                    <div className="min-w-48 flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {r.name}
                        {!r.is_active && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">অপ্রকাশিত</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {r.role_title} · ক্রম {r.display_order}
                        {r.phone ? ` · ${r.phone}` : ""}
                        {r.facebook_url ? " · মেসেজ লিংক আছে" : ""}
                      </p>
                    </div>
                    {confirmingDeleteId === r.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-red-700">মুছে ফেলবেন?</span>
                        <button type="button" onClick={() => void onDelete(r)} disabled={busy} className={dangerBtn}>হ্যাঁ, মুছুন</button>
                        <button type="button" onClick={() => setConfirmingDeleteId(null)} disabled={busy} className={whiteBtn}>না</button>
                      </span>
                    ) : (
                      <span className="flex gap-2">
                        <button type="button" onClick={() => void onToggleActive(r)} disabled={busy} className={whiteBtn}>{r.is_active ? "আনপাবলিশ করুন" : "প্রকাশ করুন"}</button>
                        <button type="button" onClick={() => startEdit(r)} className={whiteBtn}>সম্পাদনা</button>
                        <button type="button" onClick={() => setConfirmingDeleteId(r.id)} className={dangerBtn}>মুছে ফেলুন</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
