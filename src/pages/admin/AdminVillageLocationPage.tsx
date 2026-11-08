import { useEffect, useRef, useState } from "react";
import {
  useVillageLocationAdmin,
  VILLAGE_LOCATION_DEFAULTS,
  type VillageLocationAdminValue,
} from "../../hooks/useVillageLocation";

/**
 * Admin — গ্রামের অবস্থান ও ঠিকানা (owner's order, 2026-10-29:
 * the first of the three remaining Village sub-pages to build).
 * Edits the four location tiles of the public Village Page
 * (গ্রাম / উপজেলা / জেলা / দেশ — site_settings columns from
 * migration 0034) and the পূর্ণ ঠিকানা line (the existing
 * site_settings.address column). An emptied tile field stores
 * NULL, so the built-in default shows on the public page.
 * Every save is verified by reading the row back (see the hook).
 */
const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const TILE_FIELDS = [
  { key: "villageName", label: "গ্রাম", def: VILLAGE_LOCATION_DEFAULTS.villageName },
  { key: "upazilaName", label: "উপজেলা", def: VILLAGE_LOCATION_DEFAULTS.upazilaName },
  { key: "districtName", label: "জেলা", def: VILLAGE_LOCATION_DEFAULTS.districtName },
  { key: "countryName", label: "দেশ", def: VILLAGE_LOCATION_DEFAULTS.countryName },
] as const;

export default function AdminVillageLocationPage() {
  const { value, stored, loading, loadError, migrationPending, reload, save } =
    useVillageLocationAdmin();
  const [form, setForm] = useState<VillageLocationAdminValue>({
    ...VILLAGE_LOCATION_DEFAULTS,
    address: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const hydrated = useRef(false);

  /* The form holds the STORED strings ("" = default): a field the
   * admin sees as the default word may be an empty stored value,
   * so hydrate from `stored`, not from the merged `value`. The
   * placeholders show which default an empty field will use. */
  useEffect(() => {
    if (!loading && !hydrated.current) {
      hydrated.current = true;
      setForm({
        villageName: stored.villageName,
        upazilaName: stored.upazilaName,
        districtName: stored.districtName,
        countryName: stored.countryName,
        address: value.address,
      });
    }
  }, [loading, stored, value.address]);

  const set =
    (key: keyof VillageLocationAdminValue) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const ok = await save(form);
    setBusy(false);
    setMessage({
      ok,
      text: ok
        ? "সংরক্ষিত হয়েছে — Database-এ যাচাই করা হয়েছে।"
        : "সংরক্ষণ হয়নি — আবার চেষ্টা করুন।",
    });
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-brand-dark">অবস্থান ও ঠিকানা</h1>
      <p className="mt-1 text-sm leading-relaxed text-neutral-500">
            ঠিকানার চারটি ঘর ও পূর্ণ ঠিকানা।
          </p>

      {migrationPending && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          এই অংশের Database আপডেট (migration 0034) এখনো লাইভে চালানো হয়নি — আপডেট
          চালানো হলে এখান থেকে সম্পাদনা করা যাবে। ততদিন Public Page-এ নির্ধারিত
          লেখাগুলোই দেখাচ্ছে।
        </div>
      )}
      {loadError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {loadError}
          <button type="button" onClick={() => void reload()} className="ml-3 font-semibold underline">
            আবার চেষ্টা করুন
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5"
        aria-label="অবস্থান ও ঠিকানা সম্পাদনা"
      >
        {loading ? (
          <p className="text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {TILE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls} htmlFor={`vl-${f.key}`}>{f.label}</label>
                  <input
                    id={`vl-${f.key}`}
                    className={inputCls}
                    value={form[f.key]}
                    maxLength={120}
                    placeholder={f.def}
                    onChange={set(f.key)}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className={labelCls} htmlFor="vl-address">পূর্ণ ঠিকানা</label>
              <textarea
                id="vl-address"
                className={inputCls}
                rows={2}
                value={form.address}
                maxLength={300}
                placeholder="নগর পাড়া, তাড়াশ, সিরাজগঞ্জ, বাংলাদেশ"
                onChange={set("address")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy || migrationPending}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
              </button>
              {message && (
                <p className={`text-sm font-medium ${message.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
                  {message.text}
                </p>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
