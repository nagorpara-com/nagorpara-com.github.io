import { useState } from "react";
import PhotoUploadField from "./PhotoUploadField";
import {
  MAX_VILLAGE_BANNERS,
  textOf,
  useAdminVillageBanners,
  type VillageBannerPayload,
} from "../../hooks/useAdminVillageBanners";
import type { VillagePageBanner } from "../../types/database.types";

/**
 * Village Page banner manager card — sits at the top of Admin
 * গ্রামের পরিচিতি ও ইতিহাস (/admin/village), in the same place
 * the old single-photo Settings card sat.
 *
 * Owner's order (2026-11-05): the Village page gets a THREE
 * banner slider like the Members & Committee page ("হ্যাঁ, ৩টা
 * ব্যানারের স্লাইডার করো"), so this card now manages the
 * `village_page_banners` table (migration 0057): at most three
 * rows, each a device-upload photo + display order + published
 * toggle; the public page crossfades the published rows. The
 * model, vocabulary and write discipline mirror Admin
 * সদস্য ও কমিটি ব্যানার exactly.
 *
 * Until migration 0057 is applied live the card says so plainly
 * and every write is refused with the same explanation; the
 * public page meanwhile keeps showing the single Settings photo.
 *
 * Each banner may also carry its OWN text (migration 0058,
 * owner's "Complete Banner & Media Enhancement" spec): heading,
 * description, an optional CTA button and a visibility switch,
 * edited in the same form; a separate "লেখা মুছুন" action clears
 * ONLY the text, never the image. Until 0058 is live the hook
 * reports textSupported = false and no text UI renders here.
 *
 * The old single-image flow (site_settings.village_banner_url,
 * migration 0023) is retired from THIS card — the column and its
 * stored value are untouched and remain the public page's
 * fallback when no slider row is published. The Gallery album id
 * the old card round-tripped is likewise left untouched in the
 * database. Photos here are DEVICE UPLOAD only (PhotoUploadField),
 * per the owner's standing rule for the Village admin.
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

const EMPTY_FORM = {
  image_url: "",
  display_order: 0,
  is_published: true,
  heading: "",
  description: "",
  cta_text: "",
  cta_link: "",
  show_text: true,
};

/** Banner CTA link rule (owner's spec, 2026-11-05): an internal
 * page path ("/" দিয়ে শুরু) or a full http(s) URL — anything
 * else (javascript: included) is refused with plain wording,
 * mirroring the link discipline of the News button fields. */
function ctaLinkError(link: string): string | null {
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return null;
  if (/^https?:\/\//i.test(link)) {
    try {
      new URL(link);
      return null;
    } catch {
      /* fall through to the error below */
    }
  }
  return "CTA লিংকটি সঠিক নয় — লিংক শুধু ওয়েবসাইটের ভিতরের পেজ (/ দিয়ে শুরু) অথবা http:// বা https:// দিয়ে শুরু হওয়া সম্পূর্ণ ঠিকানা হতে পারবে।";
}

export default function VillagePageSettingsCard() {
  const data = useAdminVillageBanners();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingClearTextId, setConfirmingClearTextId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const atCap = !editingId && data.rows.length >= MAX_VILLAGE_BANNERS;

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(row: VillagePageBanner) {
    setEditingId(row.id);
    const t = textOf(row);
    setForm({
      image_url: row.image_url,
      display_order: row.display_order,
      is_published: row.is_published,
      heading: t.heading ?? "",
      description: t.description ?? "",
      cta_text: t.cta_text ?? "",
      cta_link: t.cta_link ?? "",
      show_text: t.show_text,
    });
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
    if (data.textSupported) {
      if (form.heading.trim().length > 120) {
        setFormError("শিরোনাম সর্বোচ্চ 120 অক্ষরের হতে পারবে।");
        return;
      }
      if (form.description.trim().length > 300) {
        setFormError("বিবরণ সর্বোচ্চ 300 অক্ষরের হতে পারবে।");
        return;
      }
      if (form.cta_text.trim().length > 40) {
        setFormError("CTA বোতামের লেখা সর্বোচ্চ 40 অক্ষরের হতে পারবে।");
        return;
      }
      if (form.cta_link.trim().length > 500) {
        setFormError("CTA লিংক সর্বোচ্চ 500 অক্ষরের হতে পারবে।");
        return;
      }
      if ((form.cta_text.trim() === "") !== (form.cta_link.trim() === "")) {
        setFormError("বাটন দিতে হলে লেখা ও লিংক দুটোই লাগবে।");
        return;
      }
      const linkErr = ctaLinkError(form.cta_link.trim());
      if (linkErr) {
        setFormError(linkErr);
        return;
      }
    }
    const payload: VillageBannerPayload = {
      image_url: form.image_url,
      display_order: Number.isFinite(form.display_order) ? form.display_order : 0,
      is_published: form.is_published,
      heading: form.heading.trim() || null,
      description: form.description.trim() || null,
      cta_text: form.cta_text.trim() || null,
      cta_link: form.cta_link.trim() || null,
      show_text: form.show_text,
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

  async function onTogglePublished(row: VillagePageBanner) {
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

  async function onClearText(row: VillagePageBanner) {
    setBusy(true);
    const err = await data.clearBannerText(row);
    setBusy(false);
    setConfirmingClearTextId(null);
    if (err) setFeedback({ kind: "err", text: err });
    else setFeedback({ kind: "ok", text: "ব্যানারটির লেখা মুছে ফেলা হয়েছে — ছবিটি আগের মতোই আছে।" });
    if (editingId === row.id) {
      setForm((f) => ({ ...f, heading: "", description: "", cta_text: "", cta_link: "" }));
    }
  }

  async function onDelete(row: VillagePageBanner) {
    setBusy(true);
    const err = await data.deleteBanner(row.id);
    setBusy(false);
    setConfirmingDeleteId(null);
    if (err) setFeedback({ kind: "err", text: err });
    else setFeedback({ kind: "ok", text: "ব্যানারটি মুছে ফেলা হয়েছে।" });
    if (editingId === row.id) cancelEdit();
  }

  return (
    <section className="mb-6 min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-bold text-dark-green">
        Village Page-এর Banner
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        গ্রাম পেজের ব্যানার স্লাইডার — সর্বোচ্চ {MAX_VILLAGE_BANNERS}টি ছবি, প্রকাশিত ছবিগুলো Website-এ নিজে নিজে বদলায়।
      </p>

      <div className="mt-4 grid gap-5">
        {!data.isConfigured && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Supabase সংযুক্ত নেই — ব্যানার দেখা বা বদলানো যাচ্ছে না।
          </p>
        )}
        {data.tableMissing && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ব্যানারের ডেটাবেস টেবিল এখনো তৈরি হয়নি — migration 0057 লাইভে চালানো বাকি। টেবিল তৈরি হলে এখান থেকে ব্যানার যোগ করা যাবে। ততদিন Website-এ আগের একক ব্যানার ছবিটাই দেখাবে।
          </p>
        )}
        {data.loadError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ব্যানার লোড করা যায়নি: {data.loadError}{" "}
            <button type="button" onClick={() => void data.reload()} className="underline">
              আবার চেষ্টা
            </button>
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

        <form onSubmit={onSubmit} className="grid gap-4">
          <h3 className="font-bold text-dark-green">{editingId ? "ব্যানার সম্পাদনা" : "নতুন ব্যানার যোগ করুন"}</h3>
          {atCap ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              ইতিমধ্যে {MAX_VILLAGE_BANNERS}টি ব্যানার আছে — নতুন যোগ করতে আগে তালিকা থেকে একটি মুছে ফেলুন।
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <PhotoUploadField
                    label="ব্যানারের ছবি"
                    pathPrefix="village-banners"
                    sizeHint="2172 × 724 পিক্সেল (অনুপাত 3:1)"
                    value={form.image_url}
                    onChange={(url) => set("image_url", url)}
                  />
                  {formError && <p className="mt-1 text-xs text-red-600">{formError}</p>}
                </div>
                <div>
                  <label className={labelCls} htmlFor="vb-order">ক্রম</label>
                  <input
                    id="vb-order"
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
              {data.textSupported && (
                <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-3 sm:p-4">
                  <legend className="px-1 text-sm font-bold text-dark-green">ব্যানারের লেখা (ঐচ্ছিক)</legend>
                  <div>
                    <label className={labelCls} htmlFor="vb-heading">শিরোনাম</label>
                    <input
                      id="vb-heading"
                      type="text"
                      maxLength={120}
                      className={inputCls}
                      value={form.heading}
                      onChange={(e) => set("heading", e.target.value)}
                      placeholder="যেমন: আমাদের সবুজ গ্রাম"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="vb-description">বিবরণ</label>
                    <textarea
                      id="vb-description"
                      rows={2}
                      maxLength={300}
                      className={inputCls}
                      value={form.description}
                      onChange={(e) => set("description", e.target.value)}
                      placeholder="ব্যানারের উপরে দেখানো ছোট বিবরণ"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="vb-cta-text">CTA বোতামের লেখা</label>
                      <input
                        id="vb-cta-text"
                        type="text"
                        maxLength={40}
                        className={inputCls}
                        value={form.cta_text}
                        onChange={(e) => set("cta_text", e.target.value)}
                        placeholder="যেমন: আরও জানুন"
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="vb-cta-link">CTA বোতামের লিংক</label>
                      <input
                        id="vb-cta-link"
                        type="text"
                        maxLength={500}
                        className={inputCls}
                        value={form.cta_link}
                        onChange={(e) => set("cta_link", e.target.value)}
                        placeholder="/news অথবা https://…"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">বাটন দিতে হলে লেখা ও লিংক দুটোই লাগবে; লিংক শুধু ওয়েবসাইটের ভিতরের পেজ (/ দিয়ে শুরু) অথবা http(s) ঠিকানা হতে পারবে।</p>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={form.show_text} onChange={(e) => set("show_text", e.target.checked)} />
                    লেখা দেখানো হবে
                  </label>
                </fieldset>
              )}
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
          )}
        </form>

        <div className="min-w-0 border-t border-slate-100 pt-4">
          <h3 className="mb-3 font-bold text-dark-green">ব্যানার তালিকা ({data.rows.length}টি)</h3>
          {data.loading ? (
            <p className="text-sm text-slate-500">লোড হচ্ছে…</p>
          ) : data.rows.length === 0 ? (
            <p className="text-sm text-slate-500">এখনো কোনো ব্যানার যোগ করা হয়নি। ব্যানার না থাকলে Website-এ আগের একক ব্যানার ছবিটাই দেখায়।</p>
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
                        {data.textSupported && textOf(row).heading && (
                          <p className="mt-1 w-28 truncate text-xs text-slate-500">{textOf(row).heading}</p>
                        )}
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
                          {data.textSupported &&
                            (() => {
                              const t = textOf(row);
                              return t.heading || t.description || t.cta_text || t.cta_link;
                            })() &&
                            (confirmingClearTextId === row.id ? (
                              <>
                                <button type="button" onClick={() => void onClearText(row)} disabled={busy} className={dangerBtn}>
                                  হ্যাঁ, লেখা মুছুন
                                </button>
                                <button type="button" onClick={() => setConfirmingClearTextId(null)} disabled={busy} className={whiteBtn}>
                                  না
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setConfirmingClearTextId(row.id)} disabled={busy} className={whiteBtn}>
                                লেখা মুছুন
                              </button>
                            ))}
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
        </div>
      </div>
    </section>
  );
}
