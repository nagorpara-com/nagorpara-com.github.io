import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAdminSettings, type SiteSettingsRow } from "../../hooks/useAdminSettings";
import { ORGANIZATION } from "../../config/organization";

/**
 * Header & Footer management (owner's instruction, 2026-10-24):
 * everything the public Header and Footer display from the database —
 * organization names, tagline, logo, contact info and social links —
 * is managed here, in one place.
 *
 * The data lives in the SAME single `site_settings` row (id = 1) the
 * Settings page uses, and saves go through the same verified
 * `saveSettings()` (an UPDATE only counts when PostgREST confirms a
 * row changed). Editing here or in Settings edits the same data;
 * both pages reflect it after reload.
 *
 * Fields shown here are exactly the ones the public Header/Footer
 * render: names + tagline + logo (Header), names + logo + address +
 * email + Facebook/YouTube (Footer). The phone value is stored data
 * only — per the owner's standing decision it is NOT displayed in
 * the public footer; the field is labelled accordingly.
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isUrl = (v: string) => /^https?:\/\/.+\..+/.test(v);

function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <h2 className="text-base font-bold text-brand-dark">{title}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SaveRow({
  busy,
  message,
  onSave,
}: {
  busy: boolean;
  message: { ok: boolean; text: string } | null;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
      </button>
      {message && (
        <p className={`text-sm ${message.ok ? "text-brand-dark" : "text-red-700"}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

interface FormState {
  orgNameBn: string;
  orgNameEn: string;
  tagline: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  facebookUrl: string;
  youtubeUrl: string;
}

const EMPTY_FORM: FormState = {
  orgNameBn: "",
  orgNameEn: "",
  tagline: "",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  facebookUrl: "",
  youtubeUrl: "",
};

function formFromRow(row: SiteSettingsRow): FormState {
  return {
    orgNameBn: row.org_name_bn ?? "",
    orgNameEn: row.org_name_en ?? "",
    tagline: row.tagline ?? "",
    logoUrl: row.logo_url ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    facebookUrl: row.facebook_url ?? "",
    youtubeUrl: row.youtube_url ?? "",
  };
}

export default function AdminHeaderFooterPage() {
  const { loading, loadError, settings, saveSettings, uploadLogo } = useAdminSettings();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Record<string, { ok: boolean; text: string } | null>>({});

  useEffect(() => {
    if (settings) setForm(formFromRow(settings));
  }, [settings]);

  const set =
    (key: keyof FormState) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function runSave(section: string, patch: Partial<SiteSettingsRow>, validate: () => string | null) {
    const problem = validate();
    if (problem) {
      setMessages((m) => ({ ...m, [section]: { ok: false, text: problem } }));
      return;
    }
    setBusy(section);
    const error = await saveSettings(patch);
    setBusy(null);
    setMessages((m) => ({
      ...m,
      [section]: error
        ? { ok: false, text: error }
        : { ok: true, text: "সংরক্ষিত হয়েছে — Public Website-এ প্রতিফলিত হবে।" },
    }));
  }

  const saveIdentity = () =>
    runSave(
      "identity",
      {
        org_name_bn: form.orgNameBn.trim(),
        org_name_en: form.orgNameEn.trim() || null,
        tagline: form.tagline.trim() || null,
      },
      () => {
        if (!form.orgNameBn.trim()) return "সংগঠনের বাংলা নাম আবশ্যক।";
        return null;
      },
    );

  const saveBranding = () =>
    runSave(
      "branding",
      { logo_url: form.logoUrl.trim() || null },
      () => {
        if (form.logoUrl.trim() && !isUrl(form.logoUrl.trim()))
          return "সঠিক Logo URL দিন (http/https দিয়ে শুরু)।";
        return null;
      },
    );

  const saveContact = () =>
    runSave(
      "contact",
      {
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      },
      () => {
        if (form.email.trim() && !isEmail(form.email.trim())) return "সঠিক Email ঠিকানা দিন।";
        if (form.phone.trim() && form.phone.replace(/[\s+-]/g, "").length < 6)
          return "সঠিক Phone নম্বর দিন।";
        return null;
      },
    );

  const saveSocial = () =>
    runSave(
      "social",
      {
        facebook_url: form.facebookUrl.trim() || null,
        youtube_url: form.youtubeUrl.trim() || null,
      },
      () => {
        if (form.facebookUrl.trim() && !isUrl(form.facebookUrl.trim()))
          return "সঠিক Facebook URL দিন।";
        if (form.youtubeUrl.trim() && !isUrl(form.youtubeUrl.trim()))
          return "সঠিক YouTube URL দিন।";
        return null;
      },
    );

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const result = await uploadLogo(file);
    setUploading(false);
    if (result.error) {
      setMessages((m) => ({ ...m, branding: { ok: false, text: result.error! } }));
      return;
    }
    if (result.url) {
      setForm((prev) => ({ ...prev, logoUrl: result.url! }));
      setMessages((m) => ({
        ...m,
        branding: { ok: true, text: "লোগো আপলোড হয়েছে — এবার 'সংরক্ষণ করুন' চাপলে তা কার্যকর হবে।" },
      }));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
  }

  const logoPreviewSrc = form.logoUrl.trim() || ORGANIZATION.logoPath;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-brand-dark">হেডার ও ফুটার</h1>
      
      {loading && <p className="mt-6 text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>}
      {loadError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {loadError}
        </div>
      )}

      {!loading && !loadError && (
        <form onSubmit={handleSubmit}>
          <Section
            title="Header — সংগঠনের পরিচিতি"
            note="নাম দুটি Header ও Footer-এর শীর্ষে দেখা যায়। Tagline দিলে তা Header-এ English নামের নিচে ছোট করে দেখাবে; খালি রাখলে কিছু দেখাবে না।"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="hf-name-bn">সংগঠনের নাম (বাংলা) *</label>
                <input id="hf-name-bn" className={inputCls} value={form.orgNameBn} onChange={set("orgNameBn")} />
              </div>
              <div>
                <label className={labelCls} htmlFor="hf-name-en">সংগঠনের নাম (English)</label>
                <input id="hf-name-en" className={inputCls} value={form.orgNameEn} onChange={set("orgNameEn")} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="hf-tagline">Tagline (ঐচ্ছিক)</label>
                <input id="hf-tagline" className={inputCls} value={form.tagline} onChange={set("tagline")} />
              </div>
            </div>
            <SaveRow busy={busy === "identity"} message={messages.identity ?? null} onSave={saveIdentity} />
          </Section>

          <Section
            title="Logo"
            note="নতুন Logo Upload করুন। Logo সরিয়ে সংরক্ষণ করলে Website-এর মূল Logo (logo.png) ব্যবহৃত হবে।"
          >
            <div className="flex flex-wrap items-start gap-4">
              <img loading="lazy"
                src={logoPreviewSrc}
                alt="বর্তমান Logo"
                className="h-20 w-20 shrink-0 rounded-full border border-neutral-200 bg-white object-contain"
              />
              <div className="min-w-0 flex-1">
                <label className={labelCls} htmlFor="hf-logo-file">Computer থেকে Upload</label>
                <input
                  id="hf-logo-file"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-dark hover:file:bg-brand hover:file:text-white disabled:opacity-60"
                />
                {uploading && <p className="mt-1 text-xs text-neutral-500">Upload হচ্ছে…</p>}
                {form.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}
                    className="mt-2 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
                  >
                    Logo সরান (মূল Logo-তে ফিরুন)
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3">
            </div>
            <SaveRow busy={busy === "branding"} message={messages.branding ?? null} onSave={saveBranding} />
          </Section>

          <Section
            title="Footer — যোগাযোগ"
            note="ঠিকানা ও Email Footer-এর যোগাযোগ অংশে দেখা যায়। Phone নম্বরটি শুধু তথ্য হিসেবে সংরক্ষিত থাকে — আপনার সিদ্ধান্ত অনুযায়ী তা Public Footer-এ দেখানো হয় না।"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="hf-address">ঠিকানা</label>
                <textarea id="hf-address" className={inputCls} rows={2} value={form.address} onChange={set("address")} />
              </div>
              <div>
                <label className={labelCls} htmlFor="hf-email">Email</label>
                <input id="hf-email" className={inputCls} value={form.email} onChange={set("email")} />
              </div>
              <div>
                <label className={labelCls} htmlFor="hf-phone">মোবাইল / Phone (শুধু সংরক্ষণের জন্য)</label>
                <input id="hf-phone" className={inputCls} value={form.phone} onChange={set("phone")} />
              </div>
            </div>
            <SaveRow busy={busy === "contact"} message={messages.contact ?? null} onSave={saveContact} />
          </Section>

          <Section
            title="Social Link"
            note="Facebook Link Footer-এ দেখা যায়। Facebook-এর ঘর খালি রেখে সংরক্ষণ করলেও সংগঠনের নিশ্চিত Page Link-টি বহাল থাকবে — Link সরাতে চাইলে নতুন Link বসান। YouTube Link দিলে তা-ও Footer-এ দেখাবে।"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="hf-facebook">Facebook Page URL</label>
                <input id="hf-facebook" className={inputCls} value={form.facebookUrl} onChange={set("facebookUrl")} placeholder="https://www.facebook.com/…" />
              </div>
              <div>
                <label className={labelCls} htmlFor="hf-youtube">YouTube Channel URL</label>
                <input id="hf-youtube" className={inputCls} value={form.youtubeUrl} onChange={set("youtubeUrl")} placeholder="https://www.youtube.com/…" />
              </div>
            </div>
            <SaveRow busy={busy === "social"} message={messages.social ?? null} onSave={saveSocial} />
          </Section>
        </form>
      )}
    </div>
  );
}
