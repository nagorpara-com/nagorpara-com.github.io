import { useState } from "react";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import {
  useAdminSportsBanners,
  type SportsBannerValues,
} from "../../hooks/useAdminSportsBanners";

/**
 * ক্রীড়া প্রতিযোগিতা ব্যানার — admin page (owner's order,
 * 2026-11-03), inside the ক্রীড়া প্রতিযোগিতা section of the
 * sidebar. Manages BOTH banners of the public /sports page
 * (migration 0049): a select picks which banner — the page-top
 * "ক্রীড়া প্রতিযোগিতা ব্যানার" or the "টুর্নামেন্ট ব্যানার"
 * above the টুর্নামেন্ট section — then its photo and the text
 * shown inside the banner are edited and saved (read-back
 * verified by the hook). Before 0049 is live the page shows
 * the honest pending notice instead of the form.
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

type BannerKind = "main" | "tournament";

const KIND_NOTES: Record<BannerKind, string> = {
  main: "এই ব্যানার ক্রীড়া পেজের একদম উপরে দেখাবে। ছবি না দিলে সবুজ পটভূমি দেখাবে।",
  tournament:
    "এই ব্যানার টিমের নিচে, টুর্নামেন্ট সেকশনের উপরে দেখাবে। ছবি ও লেখা দুটোই খালি রাখলে ব্যানারটি দেখাবে না।",
};

function BannerForm({
  kind,
  values,
  save,
}: {
  kind: BannerKind;
  values: SportsBannerValues;
  save: (patch: Partial<SportsBannerValues>) => Promise<string | null>;
}) {
  const [url, setUrl] = useState(
    kind === "main" ? (values.sports_banner_url ?? "") : (values.sports_tournament_banner_url ?? ""),
  );
  const [title, setTitle] = useState(
    kind === "main"
      ? (values.sports_banner_title ?? "")
      : (values.sports_tournament_banner_title ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSave() {
    if (title.trim().length > 120) {
      setMessage({ ok: false, text: "ব্যানারের লেখা সর্বোচ্চ ১২০ অক্ষরের হতে হবে।" });
      return;
    }
    setBusy(true);
    const patch =
      kind === "main"
        ? { sports_banner_url: url.trim() || null, sports_banner_title: title.trim() || null }
        : {
            sports_tournament_banner_url: url.trim() || null,
            sports_tournament_banner_title: title.trim() || null,
          };
    const error = await save(patch);
    setBusy(false);
    setMessage(
      error
        ? { ok: false, text: error }
        : { ok: true, text: "সংরক্ষিত হয়েছে — Public Website-এ প্রতিফলিত হবে।" },
    );
  }

  return (
    <div className="grid gap-3">
      <PhotoUploadField
        label="ব্যানারের ছবি"
        value={url}
        onChange={setUrl}
        pathPrefix={kind === "main" ? "sports-banner" : "sports-tournament-banner"}
        sizeHint="2172 × 724 পিক্সেল (অনুপাত 3:1)"
      />
      <div>
        <label className={labelCls} htmlFor="sb-title">
          ব্যানারের লেখা (ব্যানারের ভিতরে দেখাবে)
        </label>
        <input
          id="sb-title"
          className={inputCls}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="যেমন: নগর পাড়া ক্রীড়া প্রতিযোগিতা"
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSave()}
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
    </div>
  );
}

export default function AdminSportsBannersPage() {
  const { isConfigured, loading, loadError, migrationPending, values, save } =
    useAdminSportsBanners();
  const [kind, setKind] = useState<BannerKind>("main");

  return (
    <div>
      <h1 className="text-xl font-bold text-brand-dark">ক্রীড়া প্রতিযোগিতা ব্যানার</h1>
      <p className="mt-1 text-sm text-neutral-500">ক্রীড়া পেজের দুইটি ব্যানার পরিচালনা করুন।</p>

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
      ) : migrationPending ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          এর Database অংশ (Migration 0049 — Sports banners) Live Database-এ এখনো প্রয়োগ করা হয়নি।
          প্রয়োগের পর থেকে এই পেজ থেকে দুইটি ব্যানারের ছবি ও লেখা বদলানো যাবে। তার আগে ক্রীড়া পেজে
          তৈরি-থাকা সবুজ পটভূমিই দেখাবে।
        </p>
      ) : (
        <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="mb-3">
            <label className={labelCls} htmlFor="sb-kind">
              কোন ব্যানার
            </label>
            <select
              id="sb-kind"
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as BannerKind)}
            >
              <option value="main">ক্রীড়া প্রতিযোগিতা ব্যানার</option>
              <option value="tournament">টুর্নামেন্ট ব্যানার</option>
            </select>
            <p className="mt-1 text-xs text-neutral-400">{KIND_NOTES[kind]}</p>
          </div>
          <BannerForm key={kind} kind={kind} values={values} save={save} />
        </section>
      )}
    </div>
  );
}
