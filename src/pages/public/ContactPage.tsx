import { useRef, useState, type FormEvent } from "react";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { useSiteSettings } from "../../hooks/useSiteSettings";

/**
 * Public Contact page (Phase C / C1).
 *
 * - The form writes to `contact_messages`. Database policies: anyone
 *   may INSERT; only the Admin can read, update or delete — a
 *   submission can never be read back by the public.
 * - Fields: name and mobile and message are required; the subject
 *   is OPTIONAL (max 120 chars, matching the table's CHECK from
 *   migration 0013) and is stored in its own `subject` column —
 *   the message body is stored verbatim, never prefixed.
 * - Anti-spam (client layer): a honeypot field and a minimum
 *   fill-time check silently drop bot submissions. SERVER-SIDE
 *   CAPTCHA verification is deliberately NOT claimed here: it needs
 *   a CAPTCHA provider's keys and a server function to check the
 *   token (the secret key must never live in the frontend), plus
 *   removing the anonymous INSERT policy so the form cannot be
 *   bypassed. That is a separate, owner-approved step; the draft
 *   plan is recorded in docs/NEXT_PHASE_ROADMAP.md (Phase C Revised).
 * - No admin/login link is shown anywhere on this page, as everywhere
 *   on the public site.
 */

const PHONE_PATTERN = /^01[3-9]\d{8}$/;

interface FieldErrors {
  name?: string;
  phone?: string;
  subject?: string;
  message?: string;
}

export default function ContactPage() {
  const settings = useSiteSettings();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  /** Snapshot of what the visitor just sent, echoed back in the
   * success box (same session only — nothing is read back from
   * the database; public INSERT has no read-back by design). */
  const [sentSummary, setSentSummary] = useState<{
    name: string;
    phone: string;
    subject: string | null;
    message: string;
  } | null>(null);
  const openedAt = useRef<number>(Date.now());

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    const n = name.trim();
    if (n.length < 2) e.name = "আপনার নাম লিখুন (কমপক্ষে ২ অক্ষর)।";
    else if (n.length > 80) e.name = "নামটি বেশি লম্বা হয়ে গেছে।";
    const p = phone.replace(/[\s-]/g, "");
    if (!PHONE_PATTERN.test(p))
      e.phone = "সঠিক মোবাইল নম্বর লিখুন (01 দিয়ে শুরু, ১১ সংখ্যা)।";
    const s = subject.trim();
    if (s.length > 120) e.subject = "বিষয়টি বেশি লম্বা হয়ে গেছে।";
    const m = message.trim();
    if (m.length < 10) e.message = "বার্তাটি আরেকটু বিস্তারিত লিখুন (কমপক্ষে ১০ অক্ষর)।";
    else if (m.length > 2000) e.message = "বার্তাটি বেশি লম্বা হয়ে গেছে (সর্বোচ্চ ২০০০ অক্ষর)।";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);

    // Validation always runs first, so a real visitor is guided
    // even when they submit quickly.
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    // Anti-spam (client layer): a filled honeypot or an inhumanly
    // fast submit is treated as a bot — the UI shows the normal
    // success state but nothing is stored.
    if (honeypot.trim() !== "" || Date.now() - openedAt.current < 2000) {
      setSentSummary({
        name: name.trim(),
        phone: phone.replace(/[\s-]/g, ""),
        subject: subject.trim() || null,
        message: message.trim(),
      });
      setSent(true);
      return;
    }

    if (!isSupabaseConfigured || !supabase) return;

    setSubmitting(true);
    const { error } = await supabase.from("contact_messages").insert({
      name: name.trim(),
      phone: phone.replace(/[\s-]/g, ""),
      subject: subject.trim() || null,
      message: message.trim(),
    });
    setSubmitting(false);
    if (error) {
      setFormError("বার্তা পাঠানো যায়নি — একটু পরে আবার চেষ্টা করুন, অথবা নিচের নম্বরে সরাসরি ফোন করুন।");
      return;
    }
    setSentSummary({
      name: name.trim(),
      phone: phone.replace(/[\s-]/g, ""),
      subject: subject.trim() || null,
      message: message.trim(),
    });
    setSent(true);
  }

  function resetForm() {
    setName("");
    setPhone("");
    setSubject("");
    setMessage("");
    setErrors({});
    setFormError(null);
    setSent(false);
    setSentSummary(null);
    openedAt.current = Date.now();
  }

  const inputClass =
    "mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";
  const errorClass = "mt-1 text-xs text-red-600";

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12">
      <h1 className="text-2xl font-bold text-brand-dark">যোগাযোগ</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
        যেকোনো তথ্য, মতামত বা সহযোগিতার জন্য বার্তা পাঠান — সংগঠনের দায়িত্বপ্রাপ্তরা
        আপনার মোবাইল নম্বরে যোগাযোগ করবেন।
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* ---------- Organization contact information ---------- */}
        <aside className="lg:col-span-2">
          <div className="h-full rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold text-brand-dark">{settings.nameBn}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              {settings.address && (
                <div>
                  <dt className="text-[13px] font-medium text-neutral-600">ঠিকানা</dt>
                  <dd className="mt-0.5">{settings.address}</dd>
                </div>
              )}
              {settings.email && (
                <div>
                  <dt className="text-[13px] font-medium text-neutral-600">ইমেইল</dt>
                  <dd className="mt-0.5">
                    <a className="rounded text-brand underline underline-offset-2 transition-colors hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50" href={`mailto:${settings.email}`}>
                      {settings.email}
                    </a>
                  </dd>
                </div>
              )}
              {settings.facebookUrl && (
                <div>
                  <dt className="text-[13px] font-medium text-neutral-600">ফেসবুক</dt>
                  <dd className="mt-0.5">
                    <a className="rounded text-brand underline underline-offset-2 transition-colors hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50" href={settings.facebookUrl} target="_blank" rel="noreferrer">
                      Facebook Page
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </aside>

        {/* ---------- Message form ---------- */}
        <div className="lg:col-span-3">
          {!isSupabaseConfigured ? (
            <p className="rounded border border-gold bg-gold/10 px-4 py-3 text-sm">
              বার্তা পাঠানোর ব্যবস্থা এখনো চালু হয়নি — অনুগ্রহ করে উপরের
              ইমেইল ঠিকানায় সরাসরি যোগাযোগ করুন।
            </p>
          ) : sent ? (
            <div className="flex h-full flex-col rounded-xl border border-brand/30 bg-brand/5 p-6">
              <p className="text-center text-lg font-semibold text-brand-dark">
                বার্তা পাঠানো হয়েছে ✅
              </p>
              <p className="mt-2 text-center text-sm leading-relaxed text-neutral-700">
                ধন্যবাদ! আপনার বার্তা সংগঠনের কাছে পৌঁছেছে। প্রয়োজনে আপনার দেওয়া
                মোবাইল নম্বরে যোগাযোগ করা হবে।
              </p>
              {sentSummary && (
                <dl className="mt-5 space-y-2.5 rounded-lg border border-brand/20 bg-white p-4 text-left text-sm">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-medium text-neutral-600">নাম</dt>
                    <dd className="text-neutral-800">{sentSummary.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-medium text-neutral-600">মোবাইল</dt>
                    <dd className="text-neutral-800">{sentSummary.phone}</dd>
                  </div>
                  {sentSummary.subject && (
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 font-medium text-neutral-600">বিষয়</dt>
                      <dd className="text-neutral-800">{sentSummary.subject}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-medium text-neutral-600">বার্তা</dt>
                    <dd className="line-clamp-3 whitespace-pre-line text-neutral-800">
                      {sentSummary.message}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="mt-auto pt-6 text-center">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
                >
                  আরেকটি বার্তা পাঠান
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  আপনার নাম <span className="text-red-600">*</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    autoComplete="name"
                    maxLength={80}
                  />
                  {errors.name && <p className={errorClass}>{errors.name}</p>}
                </label>
                <label className="text-sm">
                  মোবাইল নম্বর <span className="text-red-600">*</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                    autoComplete="tel"
                    placeholder="01XXXXXXXXX"
                    maxLength={13}
                  />
                  {errors.phone && <p className={errorClass}>{errors.phone}</p>}
                </label>
              </div>
              <label className="mt-4 block text-sm">
                বিষয় <span className="text-neutral-500">(ঐচ্ছিক)</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={inputClass}
                  maxLength={120}
                />
                {errors.subject && <p className={errorClass}>{errors.subject}</p>}
              </label>
              <label className="mt-4 block text-sm">
                বার্তা <span className="text-red-600">*</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={inputClass}
                  rows={6}
                  maxLength={2000}
                />
                {errors.message && <p className={errorClass}>{errors.message}</p>}
              </label>

              {/* Honeypot — invisible to people, tempting to bots. */}
              <div className="hidden" aria-hidden="true">
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </label>
              </div>

              {formError && (
                <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formError}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="mt-5 rounded bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {submitting ? "পাঠানো হচ্ছে…" : "বার্তা পাঠান"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
