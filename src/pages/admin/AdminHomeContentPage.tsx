import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { useAdminHomeSections } from "../../hooks/useAdminHomeSections";

/**
 * Homepage Management (R-12.1, /admin/content/home).
 *
 * Full editing surface for the `home_sections` table — the SAME
 * single source the Settings page's display switches write and
 * the public homepage reads (visibility, order, hero texts).
 * Nothing is stored twice. Saving here is EXPLICIT (edit, then
 * Save) with unsaved-changes tracking; the Settings switches
 * remain instant-save views of the same rows.
 *
 * The hero background photo is set by DEVICE UPLOAD or the
 * Website Gallery picker (owner's order, 2026-10-29 — the same
 * arrangement as the Members banner form); the old paste-a-URL
 * text box was removed. The stored value is unchanged: the
 * hero config's image_url string the public hero already reads.
 *
 * Authorization: the database policy ("home_sections: admin
 * writes", is_admin()) is the enforcement — this page only
 * explains it. Non-admin roles can open the page (the table is
 * public-read) but their saves are refused by the database.
 */

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";
const whiteBtn =
  "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-dark-green disabled:opacity-60";

export default function AdminHomeContentPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const sections = useAdminHomeSections();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSave() {
    setFeedback(null);
    const err = await sections.save();
    if (err) {
      setFeedback({ kind: "err", text: err });
    } else {
      setFeedback({ kind: "ok", text: "সংরক্ষণ করা হয়েছে — Public Homepage এখন এই বিন্যাসই দেখাবে।" });
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-bold text-dark-green">হোমপেজ পরিচালনা</h1>
        <p className="mt-1 text-sm text-slate-500">
            Section-এর ক্রম, দৃশ্যমানতা ও Hero-এর লেখা।
          </p>
      </div>

      {!sections.isConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase সংযোগ সেট করা হয়নি — সংযোগ ছাড়া Section লোড বা সংরক্ষণ করা যাবে না।
        </p>
      )}
      {profile && !isAdmin && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          শুধু Admin Homepage-এর বিন্যাস সংরক্ষণ করতে পারে (Database-এর নীতি অনুযায়ী)। আপনি তালিকাটি দেখতে পাচ্ছেন, কিন্তু সংরক্ষণ কার্যকর হবে না।
        </p>
      )}
      {feedback && (
        <p
          className={
            feedback.kind === "ok"
              ? "rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-medium text-dark-green"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
          role="status"
        >
          {feedback.text}
        </p>
      )}

      {sections.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {sections.error}{" "}
          <button type="button" onClick={() => void sections.reload()} className="font-semibold underline">
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : sections.loading ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          লোড হচ্ছে…
        </p>
      ) : sections.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Database-এ কোনো Section পাওয়া যায়নি। Migration 0003 চালানো থাকলে ১১টি Section এখানে আসবে;
          ততক্ষণ Homepage Code-এর Default বিন্যাসে চলছে।
        </p>
      ) : (
        <>
          {/* Hero content — the only section whose config texts the
              public homepage consumes. */}
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5" aria-label="Hero Section-এর লেখা">
            <div>
              <h2 className="font-bold text-dark-green">Hero Section-এর লেখা</h2>
              <p className="mt-0.5 text-xs text-slate-500">Homepage-এর একদম উপরের অংশে এই লেখাগুলোই দেখায়।</p>
            </div>
            <div>
              <label className={labelCls} htmlFor="hc-hero-title">শিরোনাম</label>
              <input
                id="hc-hero-title"
                className={inputCls}
                value={sections.hero.title}
                maxLength={200}
                onChange={(e) => sections.setHero({ ...sections.hero, title: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="hc-hero-subtitle">উপ-শিরোনাম</label>
              <textarea
                id="hc-hero-subtitle"
                className={inputCls}
                rows={2}
                value={sections.hero.subtitle}
                maxLength={400}
                onChange={(e) => sections.setHero({ ...sections.hero, subtitle: e.target.value })}
              />
            </div>
            <div>
              <PhotoUploadField
                label="পটভূমির ছবি (ঐচ্ছিক)"
                pathPrefix="hero"
                sizeHint="2172 × 724 পিক্সেল (অনুপাত 3:1)"
                value={sections.hero.imageUrl}
                onChange={(url) => sections.setHero({ ...sections.hero, imageUrl: url })}
              />
              <p className="mt-1 text-xs text-slate-400">
                ছবি না দিলে সবুজ পটভূমি দেখাবে।
              </p>
            </div>
          </section>

          {/* Section list: name (management label), order, visibility. */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5" aria-label="Section তালিকা">
            <h2 className="font-bold text-dark-green">Section-গুলো</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              নামটি পরিচালনার তালিকায় ব্যবহৃত হয়। বন্ধ (Off) Section Public Homepage-এ দেখাবে না;
              ক্রম বদলালে Homepage-এও সেই ক্রমেই সাজবে।
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {sections.rows.map((row, index) => (
                <li key={row.key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-400">{index + 1}</span>
                  <input
                    aria-label={`${row.key} Section-এর নাম`}
                    className="min-w-40 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                    value={row.title}
                    maxLength={120}
                    onChange={(e) => sections.setTitle(row.key, e.target.value)}
                  />
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={`${row.title} উপরে সরান`}
                      disabled={index === 0}
                      onClick={() => sections.move(row.key, -1)}
                      className="rounded px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${row.title} নিচে সরান`}
                      disabled={index === sections.rows.length - 1}
                      onClick={() => sections.move(row.key, 1)}
                      className="rounded px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </span>
                  <label className="flex shrink-0 items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={row.is_enabled}
                      onChange={(e) => sections.toggleEnabled(row.key, e.target.checked)}
                    />
                    দেখান
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {/* Save bar with unsaved-changes state. */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void onSave()} disabled={!sections.dirty || sections.saving} className={primaryBtn}>
              {sections.saving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </button>
            <button type="button" onClick={sections.discard} disabled={!sections.dirty || sections.saving} className={whiteBtn}>
              পরিবর্তন বাতিল
            </button>
            {sections.dirty ? (
              <span className="text-sm font-medium text-amber-700" role="status">সংরক্ষণ হয়নি এমন পরিবর্তন আছে</span>
            ) : sections.savedAt ? (
              <span className="text-sm font-medium text-dark-green" role="status">সব পরিবর্তন সংরক্ষিত</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
