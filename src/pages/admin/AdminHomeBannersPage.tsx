import { useState } from "react";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import {
  useAdminHomeBanners,
  type HomeBannerPayload,
} from "../../hooks/useAdminHomeBanners";
import type { HomePageBanner } from "../../types/database.types";

/**
 * Admin ওয়েবসাইট কনটেন্ট হোমপেজ ব্যানার (owner's order,
 * 2026-10-29 — the same arrangement as the Members & Committee
 * banners): a small table holding AT MOST THREE banner photos
 * for the public homepage hero. The website rotates the
 * published banners as a slider behind the hero headline
 * (changing on its own); each banner can be edited, published /
 * unpublished and deleted. A banner photo comes from a device
 * upload OR from the Website Gallery.
 * Storage: `home_page_banners` (migration 0033) — until that
 * migration is applied live the page says so plainly and every
 * write is refused with the same explanation.
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

const EMPTY_FORM = { image_url: "", display_order: 0, is_published: true };

export default function AdminHomeBannersPage() {
  const data = useAdminHomeBanners();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(row: HomePageBanner) {
    setEditingId(row.id);
    setForm({ image_url: row.image_url, display_order: row.display_order, is_published: row.is_published });
    setFormError(null);
    setFeedback(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.image_url) {
      setFormError("আগে ডিভাইস থেকে একটি ব্যানার ছবি আপলোড করুন।");
      return;
    }
    const payload: HomeBannerPayload = {
      image_url: form.image_url,
      display_order: Number.isFinite(form.display_order) ? form.display_order : 0,
      is_published: form.is_published,
    };
    setBusy(true);
    const err = editingId ? await data.updateBanner(editingId, payload) : await data.createBanner(payload);
    setBusy(false);
    if (err) {
      setFeedback({ kind: "err", text: err });
      return;
    }
    setFeedback({ kind: "ok", text: editingId ? "ব্যানার হালনাগাদ হয়েছে।" : "নতুন ব্যানার যোগ হয়েছে।" });
    cancelEdit();
  }

  async function onTogglePublished(row: HomePageBanner) {
    setBusy(true);
    const err = await data.setPublished(row, !row.is_published);
    setBusy(false);
    if (err) setFeedback({ kind: "err", text: err });
    else
      setFeedback({
        kind: "ok",
        text: row.is_published ? "ব্যানারটি আনপাবলিশ হয়েছে — Website-এ আর দেখাবে না।" : "ব্যানারটি প্রকাশিত হয়েছে — Website-এর স্লাইডারে দেখাবে।",
      });
  }

  async function onDelete(row: HomePageBanner) {
    setBusy(true);
    const err = await data.deleteBanner(row.id);
    setBusy(false);
    setConfirmingDeleteId(null);
    if (err) setFeedback({ kind: "err", text: err });
    else setFeedback({ kind: "ok", text: "ব্যানারটি মুছে ফেলা হয়েছে।" });
    if (editingId === row.id) cancelEdit();
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-bold text-dark-green">ব্যানার পরিচালনা</h1>
        <p className="mt-1 text-sm text-slate-500">
            হোমপেজের ব্যানার যোগ, সম্পাদনা ও মুছে ফেলুন।
          </p>
      </div>

      {!data.isConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase সংযুক্ত নেই — ব্যানার দেখা বা বদলানো যাচ্ছে না।
        </p>
      )}
      {data.tableMissing && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ব্যানারের ডেটাবেস টেবিল এখনো তৈরি হয়নি — migration 0033 লাইভে চালানো বাকি। টেবিল তৈরি হলে এখান থেকে ব্যানার যোগ করা যাবে।
        </p>
      )}
      {data.loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ব্যানার লোড করা যায়নি: {data.loadError}
        </p>
      )}
      {feedback && (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      )}

      <form onSubmit={onSubmit} className="grid gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">
        <h2 className="font-bold text-dark-green">{editingId ? "ব্যানার সম্পাদনা" : "নতুন ব্যানার যোগ করুন"}</h2>
        <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <PhotoUploadField
                  label="ব্যানারের ছবি"
                  pathPrefix="home-banners"
                  sizeHint="2172 × 724 পিক্সেল (অনুপাত 3:1)"
                  value={form.image_url}
                  onChange={(url) => set("image_url", url)}
                />
                {formError && <p className="mt-1 text-xs text-red-600">{formError}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="bn-order">ক্রম</label>
                <input
                  id="bn-order"
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form.display_order}
                  onChange={(e) => set("display_order", Number(e.target.value))}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.is_published} onChange={(e) => set("is_published", e.target.checked)} />
                  Website-এ প্রকাশিত
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || data.tableMissing} className={primaryBtn}>
                {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "হালনাগাদ করুন" : "ব্যানার যোগ করুন"}
              </button>
              {editingId && (
                <button type="button" onClick={cancelEdit} disabled={busy} className={whiteBtn}>
                  বাতিল
                </button>
              )}
            </div>
        </>
      </form>

      <section className="min-w-0 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">
        <h2 className="mb-3 font-bold text-dark-green">ব্যানার তালিকা ({data.rows.length}টি)</h2>
        {data.loading ? (
          <p className="text-sm text-slate-500">লোড হচ্ছে…</p>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-slate-500">এখনো কোনো ব্যানার যোগ করা হয়নি। ব্যানার না থাকলে Website-এ মূল ব্যানার ছবিটাই দেখায়।</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">ছবি</th>
                  <th className="py-2 pr-3 font-medium">ক্রম</th>
                  <th className="py-2 pr-3 font-medium">অবস্থা</th>
                  <th className="py-2 font-medium">কাজ</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-middle">
                    <td className="py-2.5 pr-3">
                      <img loading="lazy" src={row.image_url} alt="ব্যানার" className="h-12 w-28 rounded-md object-cover ring-1 ring-slate-200" />
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{row.display_order}</td>
                    <td className="py-2.5 pr-3">
                      {row.is_published ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">প্রকাশিত</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">অপ্রকাশিত</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => startEdit(row)} disabled={busy} className={whiteBtn}>
                          সম্পাদনা
                        </button>
                        <button type="button" onClick={() => void onTogglePublished(row)} disabled={busy} className={whiteBtn}>
                          {row.is_published ? "আনপাবলিশ করুন" : "প্রকাশ করুন"}
                        </button>
                        {confirmingDeleteId === row.id ? (
                          <>
                            <button type="button" onClick={() => void onDelete(row)} disabled={busy} className={dangerBtn}>
                              হ্যাঁ, মুছুন
                            </button>
                            <button type="button" onClick={() => setConfirmingDeleteId(null)} disabled={busy} className={whiteBtn}>
                              না
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmingDeleteId(row.id)} disabled={busy} className={dangerBtn}>
                            মুছে ফেলুন
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
