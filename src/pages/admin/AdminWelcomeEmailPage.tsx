import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  useAdminWelcomeSettings,
  WELCOME_BODY_MAX,
  WELCOME_HEADLINE_MAX,
} from "../../hooks/useAdminWelcomeSettings";
import { adminSendWelcomeTest } from "../../utils/subscription";

/**
 * Welcome Email settings (Prompt 3 · Step 3, 2026-10-27).
 *
 * The welcome email is sent once, right after a visitor
 * verifies their subscription — and only while these settings
 * are Active. The headline becomes the email SUBJECT; the body
 * is the message (blank line = new paragraph). The server adds
 * the organisation footer and the unsubscribe link itself —
 * they are not editable here and the preview says so.
 *
 * The settings live in the single `welcome_email_settings` row
 * (migration 0026, admin-only RLS). Until that migration is
 * applied the page says so honestly and disables the form.
 * "আমাকে টেস্ট ইমেইল পাঠাও" sends the CURRENT editor text to
 * the signed-in admin's own email (the server resolves the
 * recipient from the session — it can never be aimed at anyone
 * else), so wording can be checked before saving.
 */
export default function AdminWelcomeEmailPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" && profile?.is_active;
  const { row, loading, tableMissing, error, save } =
    useAdminWelcomeSettings();

  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<
    { ok: boolean; text: string } | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<
    { ok: boolean; text: string } | null
  >(null);

  useEffect(() => {
    if (row && !hydrated) {
      setHeadline(row.headline);
      setBody(row.body);
      setIsActive(row.is_active);
      setHydrated(true);
    }
  }, [row, hydrated]);

  const headlineError =
    headline.trim().length === 0
      ? "Headline খালি রাখা যাবে না।"
      : headline.length > WELCOME_HEADLINE_MAX
        ? `Headline সর্বোচ্চ ${WELCOME_HEADLINE_MAX} অক্ষরের হবে।`
        : null;
  const bodyError =
    body.trim().length === 0
      ? "বার্তা খালি রাখা যাবে না।"
      : body.length > WELCOME_BODY_MAX
        ? `বার্তা সর্বোচ্চ ${WELCOME_BODY_MAX} অক্ষরের হবে।`
        : null;
  const formValid = !headlineError && !bodyError;

  async function handleSave() {
    if (!formValid || saving) return;
    setSaving(true);
    setSaveMessage(null);
    const result = await save(headline.trim(), body.trim(), isActive);
    setSaving(false);
    setSaveMessage({ ok: result.ok, text: result.message });
  }

  async function handleTest() {
    if (!formValid || testing) return;
    setTesting(true);
    setTestMessage(null);
    const result = await adminSendWelcomeTest(headline.trim(), body.trim());
    setTesting(false);
    if (result.ok) {
      setTestMessage({
        ok: true,
        text: "টেস্ট ইমেইল পাঠানো হয়েছে — আপনার লগইন ইমেইলের ইনবক্স দেখুন।",
      });
    } else if (
      result.code === "FUNCTION_NOT_CONFIGURED" ||
      result.code === "NOT_CONFIGURED"
    ) {
      setTestMessage({
        ok: false,
        text: "ইমেইল পাঠানোর ব্যবস্থা (সার্ভার ফাংশন/সিক্রেট) এখনো প্রস্তুত নয় — ফাংশনটি deploy হলে টেস্ট পাঠানো যাবে।",
      });
    } else if (result.code === "NO_SESSION") {
      setTestMessage({
        ok: false,
        text: "সেশন পাওয়া যায়নি — আবার লগইন করে চেষ্টা করুন।",
      });
    } else {
      setTestMessage({
        ok: false,
        text: "টেস্ট ইমেইল পাঠানো যায়নি — কিছুক্ষণ পর আবার চেষ্টা করুন।",
      });
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-dark-green">Welcome ইমেইল</h1>
        <p className="mt-3 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-600">
          এই পেজটি শুধু Admin-এর জন্য। Welcome ইমেইলের লেখা ও চালু/বন্ধ
          অবস্থা শুধু Admin-ই বদলাতে পারেন।
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-dark-green">Welcome ইমেইল</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
            সাবস্ক্রাইব করলেই এই ইমেইল একবার যায়।
          </p>

      {loading && <p className="mt-6 text-sm text-slate-500">লোড হচ্ছে...</p>}
      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      {tableMissing && (
        <div className="mt-6 rounded-lg bg-gold/20 p-4 text-sm text-yellow-800">
          <p className="font-semibold">ডেটাবেস টেবিল এখনো তৈরি হয়নি</p>
          <p className="mt-1">
            এই সুবিধার টেবিল (<code>welcome_email_settings</code>) তৈরি হবে
            Migration 0026 apply হলে। ততক্ষণ ফর্মটি বন্ধ রাখা হয়েছে —
            কোড প্রস্তুত, শুধু ডেটাবেস ধাপটি বাকি।
          </p>
        </div>
      )}

      {!loading && !tableMissing && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* ------- Editor ------- */}
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-dark-green">ইমেইলের লেখা</h2>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive((v) => !v)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  isActive ? "bg-primary" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    isActive ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
                <span className="sr-only">
                  Welcome ইমেইল {isActive ? "চালু" : "বন্ধ"}
                </span>
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              অবস্থা:{" "}
              <strong>{isActive ? "চালু (Active)" : "বন্ধ (Inactive)"}</strong>{" "}
              — Save করলে কার্যকর হবে।
            </p>

            <label
              htmlFor="welcome-headline"
              className="mt-4 block text-sm font-semibold text-dark-green"
            >
              Headline (ইমেইলের সাবজেক্ট)
            </label>
            <input
              id="welcome-headline"
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={WELCOME_HEADLINE_MAX + 20}
              aria-invalid={!!headlineError}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            {headlineError && (
              <p role="alert" className="mt-1 text-sm font-medium text-red-500">
                {headlineError}
              </p>
            )}

            <label
              htmlFor="welcome-body"
              className="mt-4 block text-sm font-semibold text-dark-green"
            >
              বার্তা
            </label>
            <textarea
              id="welcome-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              aria-invalid={!!bodyError}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-slate-400">ফাঁকা লাইনে নতুন অনুচ্ছেদ হবে।</p>
            {bodyError && (
              <p role="alert" className="mt-1 text-sm font-medium text-red-500">
                {bodyError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={!formValid || saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-dark-green disabled:opacity-60"
              >
                {saving ? "সংরক্ষণ হচ্ছে..." : "Save করুন"}
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={!formValid || testing}
                className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-dark-green transition hover:brightness-95 disabled:opacity-60"
              >
                {testing ? "পাঠানো হচ্ছে..." : "আমাকে টেস্ট ইমেইল পাঠাও"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">টেস্ট ইমেইল শুধু আপনার লগইন ইমেইলে যায় (Save ছাড়াই)।</p>
            {saveMessage && (
              <p
                role="status"
                className={`mt-3 rounded-lg p-3 text-sm font-medium ${
                  saveMessage.ok
                    ? "bg-primary/10 text-dark-green"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {saveMessage.text}
              </p>
            )}
            {testMessage && (
              <p
                role="status"
                className={`mt-3 rounded-lg p-3 text-sm font-medium ${
                  testMessage.ok
                    ? "bg-primary/10 text-dark-green"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {testMessage.text}
              </p>
            )}
          </section>

          {/* ------- Live preview ------- */}
          <section className="rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <h2 className="font-bold text-dark-green">লাইভ প্রিভিউ</h2>
            <div className="mt-3 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                বিষয়
              </p>
              <p className="mt-0.5 font-bold text-slate-800">
                {headline.trim() || "(Headline খালি)"}
              </p>
              <hr className="my-4 border-slate-100" />
              {body
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p
                    key={i}
                    className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700 first:mt-0"
                  >
                    {paragraph}
                  </p>
                ))}
              {body.trim() === "" && (
                <p className="text-sm text-slate-400">(বার্তা খালি)</p>
              )}
              <hr className="my-4 border-slate-100" />
              <p className="text-xs leading-relaxed text-slate-400">ফুটার ও আনসাবস্ক্রাইব লিংক সার্ভার থেকে নিজে নিজে যোগ হয়।</p>
            </div>
            <p className="mt-3 text-xs text-slate-400">প্রিভিউতে শুধু লেখা অংশটুকু দেখানো হয়েছে।</p>
          </section>
        </div>
      )}
    </div>
  );
}
