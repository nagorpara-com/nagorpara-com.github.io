import { useEffect, useState, type ReactNode } from "react";
import { HOME_SECTIONS } from "../../config/homepage";
import { useAdminSettings, type SiteSettingsRow } from "../../hooks/useAdminSettings";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { applyTheme, DEFAULT_THEME, isHexColor } from "../../utils/theme";

/**
 * Website Settings — Batch 1 (Admin-First).
 *
 * All values live in the existing database schema:
 * `site_settings` (id = 1) for organization/contact/social/branding
 * and football_* / cricket_* team settings, and `home_sections`
 * for homepage visibility + order. Writes are enforced by RLS
 * (admin only) — this page merely presents the form.
 *
 * Unknown organization facts (tagline, establishment year, cricket
 * team name/season) are NEVER pre-filled with invented values.
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isUrl = (v: string) => /^https?:\/\/.+\..+/.test(v);
const isYear = (v: string) => /^\d{4}$/.test(v) && +v >= 1900 && +v <= 2100;

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
        disabled={busy}
        onClick={onSave}
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
  );
}

interface FormState {
  orgNameBn: string;
  orgNameEn: string;
  tagline: string;
  establishedYear: string;
  address: string;
  phone: string;
  email: string;
  facebookUrl: string;
  youtubeUrl: string;
  logoUrl: string;
  membersBannerUrl: string;
  membersPageTitle: string;
  membersPageDescription: string;
}

const EMPTY_FORM: FormState = {
  orgNameBn: "",
  orgNameEn: "",
  tagline: "",
  establishedYear: "",
  address: "",
  phone: "",
  email: "",
  facebookUrl: "",
  youtubeUrl: "",
  logoUrl: "",
  membersBannerUrl: "",
  membersPageTitle: "",
  membersPageDescription: "",
};

function toForm(row: SiteSettingsRow): FormState {
  return {
    orgNameBn: row.org_name_bn ?? "",
    orgNameEn: row.org_name_en ?? "",
    tagline: row.tagline ?? "",
    establishedYear: row.established_year ? String(row.established_year) : "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    facebookUrl: row.facebook_url ?? "",
    youtubeUrl: row.youtube_url ?? "",
    logoUrl: row.logo_url ?? "",
    membersBannerUrl: row.members_banner_url ?? "",
    membersPageTitle: row.members_page_title ?? "",
    membersPageDescription: row.members_page_description ?? "",
  };
}

export default function AdminSettingsPage() {
  const {
    isConfigured,
    loading,
    loadError,
    settings,
    homeSections,
    themeMigrationPending,
    saveSettings,
    updateHomeSection,
    uploadLogo,
    fetchThemeColors,
  } = useAdminSettings();
  const site = useSiteSettings();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  /** Theme colors (migration 0037): "" = built-in default. */
  const [themeForm, setThemeForm] = useState({ brand: "", brandDark: "", gold: "", brandLight: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { ok: boolean; text: string } | null>>({});
  const [uploading, setUploading] = useState(false);
  const [sectionMsg, setSectionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(toForm(settings));
  }, [settings]);

  useEffect(() => {
    if (settings) {
      setThemeForm({
        brand: settings.theme_brand ?? "",
        brandDark: settings.theme_brand_dark ?? "",
        gold: settings.theme_gold ?? "",
        brandLight: settings.theme_brand_light ?? "",
      });
    }
  }, [settings?.theme_brand, settings?.theme_brand_dark, settings?.theme_gold, settings?.theme_brand_light]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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

  const saveGeneral = () =>
    runSave(
      "general",
      {
        org_name_bn: form.orgNameBn.trim(),
        org_name_en: form.orgNameEn.trim() || null,
        tagline: form.tagline.trim() || null,
        established_year: form.establishedYear.trim() ? Number(form.establishedYear.trim()) : null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      },
      () => {
        if (!form.orgNameBn.trim()) return "সংগঠনের বাংলা নাম আবশ্যক।";
        if (form.email.trim() && !isEmail(form.email.trim())) return "সঠিক Email ঠিকানা দিন।";
        if (form.phone.trim() && form.phone.replace(/[\s+-]/g, "").length < 6)
          return "সঠিক Phone নম্বর দিন।";
        if (form.establishedYear.trim() && !isYear(form.establishedYear.trim()))
          return "প্রতিষ্ঠার বছর ৪ সংখ্যার হতে হবে (যেমন 2020) — নিশ্চিত না হলে খালি রাখুন।";
        return null;
      },
    );

  const saveMembersBanner = () =>
    runSave(
      "membersBanner",
      {
        members_banner_url: form.membersBannerUrl.trim() || null,
        members_page_title: form.membersPageTitle.trim() || null,
        members_page_description: form.membersPageDescription.trim() || null,
      },
      () => {
        if (form.membersPageTitle.trim().length > 80)
          return "হেডলাইন সর্বোচ্চ ৮০ অক্ষরের হতে হবে।";
        if (form.membersPageDescription.trim().length > 300)
          return "বর্ণনা সর্বোচ্চ ৩০০ অক্ষরের হতে হবে।";
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
          return "Facebook Link অবশ্যই https:// দিয়ে শুরু হওয়া সম্পূর্ণ URL হতে হবে।";
        if (form.youtubeUrl.trim() && !isUrl(form.youtubeUrl.trim()))
          return "YouTube Link অবশ্যই https:// দিয়ে শুরু হওয়া সম্পূর্ণ URL হতে হবে।";
        return null;
      },
    );

  /** Theme colors: validate -> save -> READ BACK and compare
   *  (write-verification) -> apply immediately so the panel
   *  itself shows the new colors. Empty field = default (NULL). */
  async function saveTheme() {
    const patch = {
      theme_brand: themeForm.brand.trim() || null,
      theme_brand_dark: themeForm.brandDark.trim() || null,
      theme_gold: themeForm.gold.trim() || null,
      theme_brand_light: themeForm.brandLight.trim() || null,
    };
    for (const [label, value] of [
      ["প্রধান সবুজ", patch.theme_brand],
      ["গাঢ় সবুজ", patch.theme_brand_dark],
      ["সোনালি", patch.theme_gold],
      ["হালকা সবুজ পটভূমি", patch.theme_brand_light],
    ] as const) {
      if (value && !isHexColor(value)) {
        setMessages((m) => ({
          ...m,
          theme: { ok: false, text: `${label}-এর রং সঠিক Hex আকারে দিন (যেমন #17623D), অথবা ঘর খালি রাখুন।` },
        }));
        return;
      }
    }
    setBusy("theme");
    const error = await saveSettings(patch);
    if (error) {
      setBusy(null);
      setMessages((m) => ({ ...m, theme: { ok: false, text: error } }));
      return;
    }
    const back = await fetchThemeColors();
    setBusy(null);
    const verified =
      back !== null &&
      (back.theme_brand ?? null) === patch.theme_brand &&
      (back.theme_brand_dark ?? null) === patch.theme_brand_dark &&
      (back.theme_gold ?? null) === patch.theme_gold &&
      (back.theme_brand_light ?? null) === patch.theme_brand_light;
    if (!verified) {
      setMessages((m) => ({
        ...m,
        theme: { ok: false, text: "সংরক্ষণের পর যাচাইয়ে মিল পাওয়া যায়নি — আবার চেষ্টা করুন।" },
      }));
      return;
    }
    applyTheme({
      brand: patch.theme_brand,
      brandDark: patch.theme_brand_dark,
      gold: patch.theme_gold,
      brandLight: patch.theme_brand_light,
    });
    setMessages((m) => ({
      ...m,
      theme: { ok: true, text: "থিমের রং সংরক্ষিত হয়েছে (যাচাই সম্পন্ন) — পুরো ওয়েবসাইটে এখনই এই রং দেখা যাবে।" },
    }));
  }

  const saveBranding = () =>
    runSave("branding", { logo_url: form.logoUrl.trim() || null }, () => {
      if (form.logoUrl.trim() && !isUrl(form.logoUrl.trim()))
        return "লোগোর URL সঠিক নয় — সম্পূর্ণ https:// URL দিন, অথবা খালি রাখুন।";
      return null;
    });



  async function handleLogoUpload(file: File | undefined) {
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

  async function toggleSection(key: string, enabled: boolean) {
    setSectionMsg(null);
    const error = await updateHomeSection(key, { is_enabled: enabled });
    if (error) setSectionMsg(error);
  }

  async function moveSection(index: number, dir: -1 | 1) {
    const other = homeSections[index + dir];
    const current = homeSections[index];
    if (!other || !current) return;
    setSectionMsg(null);
    const first = await updateHomeSection(current.key, { display_order: other.display_order });
    if (first) return setSectionMsg(first);
    const second = await updateHomeSection(other.key, { display_order: current.display_order });
    if (second) setSectionMsg(second);
  }

  if (!isConfigured) {
    return (
      <div>
        <h1 className="text-xl font-bold text-brand-dark">Website Settings</h1>
        <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm leading-relaxed text-neutral-700">
          Supabase এখনো সংযুক্ত হয়নি, তাই Settings-এর আসল তথ্য এখানে দেখানো যাচ্ছে না — কোনো Demo
          মান দেখানো হয়নি। Supabase Project তৈরি করে Migration 0001–0005 চালালেই এই পেজ থেকে
          সংগঠনের তথ্য, যোগাযোগ, Social Link, লোগো, Homepage-এর Section বিন্যাস এবং Football ও
          Cricket টিমের Settings Database-এ সংরক্ষণ করা যাবে। Settings সংরক্ষণের অনুমতি Database
          RLS দিয়ে শুধু Admin-এর জন্য সীমিত।
        </div>
      </div>
    );
  }

  const sectionTitles = new Map<string, string>(HOME_SECTIONS.map((s) => [s.key, s.title]));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-brand-dark">Website Settings</h1>
      
      {loading && <p className="mt-6 text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>}
      {loadError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {loadError}
        </div>
      )}

      {!loading && !loadError && (
        <>
          <Section title="সাধারণ তথ্য ও যোগাযোগ">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="s-name-bn">সংগঠনের নাম (বাংলা) *</label>
                <input id="s-name-bn" className={inputCls} value={form.orgNameBn} onChange={set("orgNameBn")} />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-name-en">Organization Name (English)</label>
                <input id="s-name-en" className={inputCls} value={form.orgNameEn} onChange={set("orgNameEn")} />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-phone">মোবাইল / Phone</label>
                <input id="s-phone" className={inputCls} value={form.phone} onChange={set("phone")} />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-email">Email</label>
                <input id="s-email" type="email" className={inputCls} value={form.email} onChange={set("email")} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="s-address">ঠিকানা</label>
                <textarea id="s-address" rows={2} className={inputCls} value={form.address} onChange={set("address")} />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-tagline">Tagline (ঐচ্ছিক)</label>
                <input id="s-tagline" className={inputCls} value={form.tagline} onChange={set("tagline")} placeholder="নিশ্চিত Tagline থাকলেই লিখুন" />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-year">প্রতিষ্ঠার বছর (ঐচ্ছিক)</label>
                <input id="s-year" inputMode="numeric" className={inputCls} value={form.establishedYear} onChange={set("establishedYear")} placeholder="নিশ্চিত না হলে খালি রাখুন" />
              </div>
            </div>
            <SaveRow busy={busy === "general"} message={messages.general ?? null} onSave={() => void saveGeneral()} />
          </Section>

          <Section
            title="সদস্য ও কমিটি পেজের ব্যানার"
            note="স্লাইডার না থাকলে এই ছবিটাই ব্যানারে দেখাবে।"
          >
            <div className="grid gap-3">
              <PhotoUploadField
                label="ব্যানারের ছবি"
                value={form.membersBannerUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, membersBannerUrl: url }))}
                pathPrefix="members-banner"
                sizeHint="2172 × 724 পিক্সেল (অনুপাত 3:1)"
              />
              <div>
                <label className={labelCls} htmlFor="s-members-title">ব্যানারের হেডলাইন (সর্বোচ্চ ৮০ অক্ষর)</label>
                <input
                  id="s-members-title"
                  className={inputCls}
                  value={form.membersPageTitle}
                  maxLength={80}
                  onChange={set("membersPageTitle")}
                  placeholder="সদস্য ও কমিটি"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-members-desc">ব্যানারের বর্ণনা (সর্বোচ্চ ৩০০ অক্ষর)</label>
                <textarea
                  id="s-members-desc"
                  rows={3}
                  className={inputCls}
                  value={form.membersPageDescription}
                  maxLength={300}
                  onChange={set("membersPageDescription")}
                  placeholder="নগর পাড়া অগ্রগামী যুব সংঘের সম্মানিত সদস্য ও কমিটির সদস্যবৃন্দ…"
                />
              </div>
            </div>
            <SaveRow busy={busy === "membersBanner"} message={messages.membersBanner ?? null} onSave={() => void saveMembersBanner()} />
          </Section>

          <Section
            title="Logo ও Branding"
            note="বর্তমান লোগোটি সংগঠনের আসল লোগো। নতুন লোগো আপলোড করলেই শুধু তা পরিবর্তন হবে — কোনো লোগো বাছাই না থাকলে আসল লোগোই থাকবে।"
          >
            <div className="flex items-center gap-4">
              <img loading="lazy"
                src={form.logoUrl || site.logoPath}
                alt="বর্তমান লোগো"
                className="h-16 w-16 rounded-full border border-neutral-200 bg-white object-contain p-1"
              />
              <div>
                <label className="inline-block cursor-pointer rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white">
                  {uploading ? "আপলোড হচ্ছে…" : "নতুন লোগো আপলোড"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void handleLogoUpload(e.target.files?.[0])}
                  />
                </label>
                              </div>
            </div>
            <div className="mt-3">
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}
                  className="mt-2 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
                >
                  Logo সরান (আসল Logo-তে ফিরুন)
                </button>
              )}
            </div>
            <SaveRow busy={busy === "branding"} message={messages.branding ?? null} onSave={() => void saveBranding()} />
          </Section>

          <Section
            title="Social Links"
            note="সংগঠনের সঠিক Page-এর Link নিশ্চিত হলেই শুধু পূরণ করুন। Facebook Link সংরক্ষিত না থাকলে Public Website-এ কোনো Facebook Link দেখানো হয় না।"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="s-fb">Facebook Page URL</label>
                <input id="s-fb" className={inputCls} value={form.facebookUrl} onChange={set("facebookUrl")} placeholder="https://facebook.com/…" />
              </div>
              <div>
                <label className={labelCls} htmlFor="s-yt">YouTube Channel URL</label>
                <input id="s-yt" className={inputCls} value={form.youtubeUrl} onChange={set("youtubeUrl")} placeholder="https://youtube.com/…" />
              </div>
            </div>
            <SaveRow busy={busy === "social"} message={messages.social ?? null} onSave={() => void saveSocial()} />
          </Section>

          <Section
            title="Website Theme ও Colors"
            note="রং বাছাই করে সংরক্ষণ করলেই পুরো ওয়েবসাইটের (Public + Admin) রং বদলে যাবে — কোড ছোঁয়া লাগবে না। কোনো ঘর খালি রাখলে সেই রঙের নির্ধারিত Brand রংটাই থাকবে। সোনালির গাঢ় ছায়া নিজে নিজেই তৈরি হয়।"
          >
            {themeMigrationPending ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                থিমের রং সংরক্ষণের জন্য Database আপডেট (migration 0037) চালানো বাকি — আপডেট
                চালানো হলে এখান থেকে রং বদলানো যাবে। ততক্ষণ ওয়েবসাইট নির্ধারিত Brand রঙেই
                চলছে।
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["brand", "প্রধান সবুজ", DEFAULT_THEME.brand],
                      ["brandDark", "গাঢ় সবুজ", DEFAULT_THEME.brandDark],
                      ["gold", "সোনালি", DEFAULT_THEME.gold],
                      ["brandLight", "হালকা সবুজ পটভূমি", DEFAULT_THEME.brandLight],
                    ] as const
                  ).map(([key, label, def]) => {
                    const current = themeForm[key].trim();
                    const effective = current && isHexColor(current) ? current : def;
                    return (
                      <div key={key} className="rounded-xl border border-neutral-200 p-3">
                        <label className={labelCls} htmlFor={`th-${key}`}>
                          {label}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            aria-label={`${label} বাছাই করুন`}
                            value={effective}
                            onChange={(e) =>
                              setThemeForm((p) => ({ ...p, [key]: e.target.value.toUpperCase() }))
                            }
                            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1"
                          />
                          <input
                            id={`th-${key}`}
                            className={inputCls}
                            value={themeForm[key]}
                            onChange={(e) => setThemeForm((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder={def}
                            maxLength={7}
                          />
                          {current ? (
                            <button
                              type="button"
                              onClick={() => setThemeForm((p) => ({ ...p, [key]: "" }))}
                              className="shrink-0 rounded-lg border border-neutral-300 px-2.5 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                            >
                              ডিফল্ট
                            </button>
                          ) : (
                            <span className="shrink-0 px-1 text-xs text-neutral-400">ডিফল্ট চলছে</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Live preview of the chosen colors */}
                <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ backgroundColor: (themeForm.brandDark.trim() || DEFAULT_THEME.brandDark) }}
                  >
                    <span className="text-sm font-bold text-white">নমুনা প্রিভিউ</span>
                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{
                        backgroundColor: (themeForm.gold.trim() || DEFAULT_THEME.gold),
                        color: (themeForm.brandDark.trim() || DEFAULT_THEME.brandDark),
                      }}
                    >
                      সোনালি বাটন
                    </span>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                    style={{ backgroundColor: (themeForm.brandLight.trim() || DEFAULT_THEME.brandLight) }}
                  >
                    <span
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                      style={{ backgroundColor: (themeForm.brand.trim() || DEFAULT_THEME.brand) }}
                    >
                      প্রধান বাটন
                    </span>
                    <span className="text-sm" style={{ color: (themeForm.brand.trim() || DEFAULT_THEME.brand) }}>
                      প্রধান রঙের লেখা
                    </span>
                  </div>
                </div>
                <SaveRow busy={busy === "theme"} message={messages.theme ?? null} onSave={() => void saveTheme()} />
              </>
            )}
          </Section>

          <Section
            title="Homepage Display Settings"
            note="Homepage-এর কোন Section দেখাবে এবং কোন ক্রমে — Database (home_sections) থেকে পরিচালিত। সুইচ বদলালেই সংরক্ষিত হয়।"
          >
            {homeSections.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Database-এ কোনো Section পাওয়া যায়নি। Migration 0003 চালানো হলে Section-এর তালিকা
                এখানে আসবে। ততক্ষণ Homepage Code-এর Default বিন্যাসে চলছে।
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {homeSections.map((section, index) => (
                  <li key={section.key} className="flex items-center gap-3 py-2">
                    <span className="flex-1 text-sm font-medium text-neutral-800">
                      {sectionTitles.get(section.key) ?? section.title}
                    </span>
                    <button
                      type="button"
                      aria-label="উপরে সরান"
                      disabled={index === 0}
                      onClick={() => void moveSection(index, -1)}
                      className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="নিচে সরান"
                      disabled={index === homeSections.length - 1}
                      onClick={() => void moveSection(index, 1)}
                      className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        checked={section.is_enabled}
                        onChange={(e) => void toggleSection(section.key, e.target.checked)}
                      />
                      দেখান
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {sectionMsg && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {sectionMsg}
              </p>
            )}
          </Section>

        </>
      )}
    </div>
  );
}
