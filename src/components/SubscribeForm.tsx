import { useState } from "react";
import {
  resendVerification,
  subscribeEmail,
} from "../utils/subscription";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = "idle" | "sending" | "done" | "already" | "invalid" | "unavailable" | "failed";

/**
 * Public subscribe form (instant model, owner's decision
 * 2026-10-27 evening — supersedes double opt-in): submitting
 * activates the subscription immediately and the welcome email
 * goes out in the same call; there is no pending state and no
 * verification link for new signups.
 *
 * `tone="dark"` styles the labels for the dark-green footer.
 */
export default function SubscribeForm({
  tone = "light",
  showLabel = true,
  onActiveChange,
  onSubmitted,
  inputId = "subscribe-email",
  doneMessage,
}: {
  tone?: "light" | "dark";
  /** The footer shows its own gold heading above the form, so it
   * passes false; the label stays in the DOM (sr-only) for the
   * input's accessibility association. */
  showLabel?: boolean;
  /** Optional (Phase 5C): tells the Popup Coordinator while the
   * visitor is actively filling this form, so no popup may
   * interrupt them. Purely additive — when the prop is absent
   * the form behaves exactly as before. */
  onActiveChange?: (active: boolean) => void;
  /** Optional (Phase 6A): called ONLY when a submission succeeds
   * (`result.ok`) — never on a failed or unavailable outcome, so
   * callers can safely record the browser's subscription memory.
   * Carries the server-issued subscriber id (instant model,
   * 2026-10-27). Purely additive. */
  onSubmitted?: (result: { subscriberId?: string }) => void;
  /** Optional (Phase 6A): DOM id for the email input. The
   * default preserves every existing usage; a second instance
   * on the same page (the subscription popup beside the footer
   * form) passes its own id so ids stay unique. */
  inputId?: string;
  /** Optional: replaces the success body text. The Subscribe
   * Popup passes its own instant-activation wording; the
   * default below carries the same meaning. */
  doneMessage?: string;
}) {
  const [email, setEmail] = useState("");
  const [homepage, setHomepage] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const labelClass =
    tone === "dark" ? "text-white" : "text-dark-green";
  const errorBoxClass =
    tone === "dark"
      ? "rounded-md bg-red-500/20 px-2.5 py-1.5 text-sm font-medium text-red-100"
      : "rounded-md bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-700";
  const hintClass = tone === "dark" ? "text-white/85" : "text-slate-600";
  const inputClass =
    "h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 bg-white";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onActiveChange?.(false);
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError("সঠিক একটি ইমেইল ঠিকানা দিন।");
      setPhase("invalid");
      return;
    }
    if (!consent) {
      setError("সাবস্ক্রাইব করতে সম্মতি দেওয়া আবশ্যক।");
      setPhase("invalid");
      return;
    }
    setError(null);
    setPhase("sending");
    const result = await subscribeEmail(value, homepage);
    if (result.ok) {
      // Owner's rule (2026-11-01): one subscription per EMAIL.
      // When the entered address is already subscribed, the
      // server says so (state "already-subscribed") and the form
      // shows the already-subscribed congratulations instead of
      // the new-subscription thanks — nothing is subscribed
      // twice and no second welcome email is sent.
      setPhase(result.state === "already-subscribed" ? "already" : "done");
      onSubmitted?.({ subscriberId: result.subscriberId });
    } else if (result.code === "DISPOSABLE_EMAIL") {
      setError(
        "অস্থায়ী (disposable) ইমেইল ঠিকানা গ্রহণ করা হয় না — অনুগ্রহ করে একটি স্থায়ী ইমেইল ঠিকানা দিন।",
      );
      setPhase("invalid");
    } else if (result.code === "NOT_CONFIGURED" || result.code === "FUNCTION_NOT_CONFIGURED") {
      setPhase("unavailable");
    } else {
      setPhase("failed");
    }
  }

  if (phase === "already") {
    return (
      <div
        role="status"
        className={
          tone === "dark"
            ? "rounded-lg bg-white/10 p-3 text-sm text-white"
            : "rounded-lg bg-primary/10 p-3 text-sm text-dark-green"
        }
      >
        <p className="font-semibold">অলরেডি সাবস্ক্রাইব করেছেন</p>
        <p className="mt-1">
          অভিনন্দন! এই ইমেইলটি ইতিমধ্যে সাবস্ক্রাইব করা আছে — সংগঠনের সব
          নোটিশ ও ঘোষণা এই ইমেইলেই পৌঁছাবে।
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail("");
            setConsent(false);
            setError(null);
            setPhase("idle");
          }}
          className={
            tone === "dark"
              ? "mt-2 font-semibold text-gold underline underline-offset-2 hover:text-white"
              : "mt-2 font-semibold text-primary underline underline-offset-2 hover:text-dark-green"
          }
        >
          অন্য ইমেইল দিয়ে সাবস্ক্রাইব করুন
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div
        role="status"
        className={
          tone === "dark"
            ? "rounded-lg bg-white/10 p-3 text-sm text-white"
            : "rounded-lg bg-primary/10 p-3 text-sm text-dark-green"
        }
      >
        <p className="font-semibold">ধন্যবাদ!</p>
        <p className="mt-1">
          {doneMessage ??
            "পরবর্তী সব নোটিশ ও ঘোষণা এই মেইলে পৌঁছাবে। (Inbox-এ না পেলে Spam ফোল্ডারটি দেখুন)"}
        </p>
        {/* One subscription per EMAIL (owner, 2026-11-01): after a
            success the form offers a fresh start so ANOTHER email
            address can be subscribed from the same browser. */}
        <button
          type="button"
          onClick={() => {
            setEmail("");
            setConsent(false);
            setError(null);
            setPhase("idle");
          }}
          className={
            tone === "dark"
              ? "mt-2 font-semibold text-gold underline underline-offset-2 hover:text-white"
              : "mt-2 font-semibold text-primary underline underline-offset-2 hover:text-dark-green"
          }
        >
          অন্য ইমেইল দিয়ে সাবস্ক্রাইব করুন
        </button>
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <p role="status" className={`text-sm ${hintClass}`}>
        ইমেইল সাবস্ক্রিপশন এই মুহূর্তে চালু নেই — অনুগ্রহ করে পরে আবার চেষ্টা করুন।
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-2"
      onFocusCapture={() => onActiveChange?.(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onActiveChange?.(false);
        }
      }}
    >
      <div>
        <label htmlFor={inputId} className={showLabel ? `text-sm font-semibold ${labelClass}` : "sr-only"}>
          নোটিশ পেতে ইমেইল দিন
        </label>
        {/* Honeypot: hidden from humans (off-screen, not in the
            tab order, hidden from assistive tech); bots that
            fill every field reveal themselves, and the server
            silently discards those submissions. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Homepage
            <input
              type="text"
              name="homepage"
              tabIndex={-1}
              autoComplete="off"
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="যেমন: name@gmail.com"
            aria-invalid={phase === "invalid"}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={phase === "sending"}
            className="h-11 shrink-0 rounded-md bg-gold px-4 text-sm font-semibold text-dark-green transition hover:brightness-95 disabled:opacity-60"
          >
            {phase === "sending" ? "পাঠানো হচ্ছে..." : "সাবস্ক্রাইব"}
          </button>
        </div>
      </div>
      <label className={`flex items-start gap-2 text-[13px] leading-relaxed ${hintClass}`}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#17623D]"
        />
        <span>
          আমি সংগঠনের নোটিশ ও ঘোষণা ইমেইলে পেতে সম্মত আছি। প্রতিটি ইমেইল
          থেকেই যেকোনো সময় আনসাবস্ক্রাইব করা যাবে।
        </span>
      </label>
      {error && (
        <p id={`${inputId}-error`} role="alert" className={errorBoxClass}>
          {error}
        </p>
      )}
      {phase === "failed" && (
        <p role="alert" className={errorBoxClass}>
          পাঠানো যায়নি — সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
        </p>
      )}
    </form>
  );
}

/**
 * "Send the verification email again" — used on the
 * verification landing page (expired link) and standalone.
 * Identical uniform answer as subscribe, by design.
 */
export function ResendVerificationForm() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError("সঠিক একটি ইমেইল ঠিকানা দিন।");
      setPhase("invalid");
      return;
    }
    setError(null);
    setPhase("sending");
    const result = await resendVerification(value);
    if (result.ok) setPhase("done");
    else if (result.code === "NOT_CONFIGURED" || result.code === "FUNCTION_NOT_CONFIGURED")
      setPhase("unavailable");
    else setPhase("failed");
  }

  if (phase === "done") {
    return (
      <p role="status" className="rounded-lg bg-primary/10 p-4 text-sm text-dark-green">
        অনুরোধ পাওয়া গেছে — যাচাই প্রয়োজন হলে নতুন যাচাইকরণ ইমেইল পাঠানো
        হয়েছে। ইনবক্স (ও স্প্যাম ফোল্ডার) দেখুন।
      </p>
    );
  }
  if (phase === "unavailable") {
    return (
      <p role="status" className="text-sm text-slate-500">
        এই সুবিধাটি এই মুহূর্তে চালু নেই — পরে আবার চেষ্টা করুন।
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-3">
      <div>
        <label htmlFor="resend-email" className="text-sm font-semibold text-dark-green">
          আপনার ইমেইল ঠিকানা
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="resend-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="যেমন: name@gmail.com"
            aria-invalid={phase === "invalid"}
            aria-describedby={error ? "resend-error" : undefined}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={phase === "sending"}
            className="shrink-0 rounded-md bg-primary px-4 py-2 font-semibold text-white transition hover:bg-dark-green disabled:opacity-60"
          >
            {phase === "sending" ? "পাঠানো হচ্ছে..." : "আবার পাঠান"}
          </button>
        </div>
      </div>
      {error && (
        <p id="resend-error" role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      {phase === "failed" && (
        <p role="alert" className="text-sm font-medium text-red-600">
          পাঠানো যায়নি — সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
        </p>
      )}
    </form>
  );
}
