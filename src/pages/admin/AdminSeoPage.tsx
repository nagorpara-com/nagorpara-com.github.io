import { useEffect, useRef, useState } from "react";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { applySeoMeta } from "../../utils/seoMeta";

/**
 * SEO ও মেটা — admin page (owner's order, 2026-11-01). Manages
 * the site-wide search/share metadata stored in site_settings
 * (migration 0039): meta title, description, keywords and the
 * social share image. Empty values keep the built-in index.html
 * defaults. Saves are verified by reading the row back
 * (verify_admin_writes); the new tags also apply to this panel
 * immediately via applySeoMeta. Before 0039 is live the page
 * shows the honest pending notice instead of the form.
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const DEFAULT_DESCRIPTION =
  "নগর পাড়া অগ্রগামী যুব সংঘ — অফিসিয়াল ওয়েবসাইট। ফুটবল ও ক্রিকেট টিম, ম্যাচ, সংবাদ, গ্যালারি ও সংগঠনের কার্যক্রম।";

export default function AdminSeoPage() {
  const { isConfigured, loading, loadError, settings, saveSettings, seoMigrationPending, fetchSeoMeta } =
    useAdminSettings();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // The settings hook merges the SEO columns in a second step,
  // so seed from them whenever they arrive — but never override
  // what the admin has already typed (dirty flag).
  const [dirty, setDirty] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (!settings || dirty || seeded.current) return;
    if (settings.meta_title === undefined) return; // SEO fetch not in yet
    seeded.current = true;
    setTitle(settings.meta_title ?? "");
    setDescription(settings.meta_description ?? "");
    setKeywords(settings.meta_keywords ?? "");
    setOgImage(settings.og_image_url ?? "");
  }, [settings, dirty]);

  const previewTitle = title.trim() || settings?.org_name_bn || "নগর পাড়া অগ্রগামী যুব সংঘ";
  const previewDesc = description.trim() || DEFAULT_DESCRIPTION;

  async function save() {
    if (title.trim().length > 120) return setMessage({ ok: false, text: "শিরোনাম ১২০ অক্ষরের মধ্যে রাখুন।" });
    if (description.trim().length > 300) return setMessage({ ok: false, text: "বর্ণনা ৩০০ অক্ষরের মধ্যে রাখুন।" });
    if (keywords.trim().length > 300) return setMessage({ ok: false, text: "কীওয়ার্ড ৩০০ অক্ষরের মধ্যে রাখুন।" });
    setBusy(true);
    const patch = {
      meta_title: title.trim() || null,
      meta_description: description.trim() || null,
      meta_keywords: keywords.trim() || null,
      og_image_url: ogImage.trim() || null,
    };
    const error = await saveSettings(patch);
    if (error) {
      setBusy(false);
      return setMessage({ ok: false, text: error });
    }
    const saved = await fetchSeoMeta();
    setBusy(false);
    const matches =
      saved &&
      saved.meta_title === patch.meta_title &&
      saved.meta_description === patch.meta_description &&
      saved.meta_keywords === patch.meta_keywords &&
      saved.og_image_url === patch.og_image_url;
    if (!matches) {
      return setMessage({ ok: false, text: "সংরক্ষণের যাচাই মেলেনি — আবার চেষ্টা করুন।" });
    }
    applySeoMeta({ ...patch, org_name: settings?.org_name_bn ?? null });
    setMessage({ ok: true, text: "সংরক্ষিত হয়েছে — ওয়েবসাইটের টাইটল ও শেয়ার তথ্য আপডেট হয়েছে।" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-bold text-brand-dark">SEO ও মেটা</h1>
      <p className="mt-1 text-sm text-neutral-500">
            শেয়ারে দেখানো শিরোনাম, বর্ণনা ও ছবি।
          </p>

      {!isConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Supabase সংযুক্ত নয় — সংরক্ষণ করা যাবে না।
        </p>
      ) : loading ? (
        <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
      ) : loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          {loadError}
        </p>
      ) : seoMigrationPending ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          এর Database অংশ (Migration 0039 — SEO settings) Live Database-এ এখনো প্রয়োগ করা হয়নি। প্রয়োগের পর থেকে এই পেজ থেকে শিরোনাম, বর্ণনা ও শেয়ার ছবি বদলানো যাবে। তার আগে ওয়েবসাইটে তৈরি-থাকা (built-in) শিরোনাম ও বর্ণনাই চলছে।
        </p>
      ) : (
        <>
          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <div className="grid gap-3">
              <div>
                <label className={labelCls} htmlFor="seo-title">মেটা শিরোনাম (Title)</label>
                <input
                  id="seo-title"
                  className={inputCls}
                  value={title}
                  onChange={(e) => { setDirty(true); setTitle(e.target.value); }}
                  maxLength={120}
                  placeholder={settings?.org_name_bn ?? "নগর পাড়া অগ্রগামী যুব সংঘ"}
                />
                <p className="mt-1 text-xs text-neutral-400">খালি রাখলে সংগঠনের নামই শিরোনাম হবে। ({title.length}/120)</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="seo-desc">মেটা বর্ণনা (Description)</label>
                <textarea
                  id="seo-desc"
                  className={inputCls}
                  rows={3}
                  value={description}
                  onChange={(e) => { setDirty(true); setDescription(e.target.value); }}
                  maxLength={300}
                  placeholder={DEFAULT_DESCRIPTION}
                />
                <p className="mt-1 text-xs text-neutral-400">খালি রাখলে তৈরি-থাকা বর্ণনাটি চলবে। ({description.length}/300)</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="seo-kw">কীওয়ার্ড (Keywords)</label>
                <input
                  id="seo-kw"
                  className={inputCls}
                  value={keywords}
                  onChange={(e) => { setDirty(true); setKeywords(e.target.value); }}
                  maxLength={300}
                  placeholder="যেমন: নগর পাড়া, যুব সংঘ, ফুটবল, ক্রিকেট, তাড়াশ"
                />
              </div>
              <PhotoUploadField
                value={ogImage}
                onChange={(url) => { setDirty(true); setOgImage(url); }}
                pathPrefix="seo"
                sizeHint="1200 × 630 পিক্সেল"
                label="শেয়ার ছবি (Social Share Image)"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
              </button>
              {message && (
                <p className={`text-sm ${message.ok ? "text-brand" : "text-red-700"}`} role="status">
                  {message.text}
                </p>
              )}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-bold text-brand-dark">প্রিভিউ — শেয়ার করলে যেমন দেখাবে</h2>
            <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-neutral-200">
              {ogImage ? (
                <img loading="lazy" src={ogImage} alt="" className="aspect-[1200/630] w-full object-cover" />
              ) : (
                <div className="flex aspect-[1200/630] w-full items-center justify-center bg-brand-light text-sm text-brand-dark">
                  শেয়ার ছবি দেওয়া হয়নি — শেয়ারে ছবি ছাড়া দেখাবে
                </div>
              )}
              <div className="p-3">
                <p className="truncate text-base font-semibold text-neutral-800">{previewTitle}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600">{previewDesc}</p>
                <p className="mt-1 text-xs text-neutral-400">nagar-para-youth-sangha — ওয়েবসাইটের ঠিকানা</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
