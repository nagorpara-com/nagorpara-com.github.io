import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePopupCoordinator } from "../context/PopupCoordinatorContext";
import { useSiteSettings } from "../hooks/useSiteSettings";
import {
  markSubscriptionSubmitted,
  markSubscriptionVerified,
} from "../utils/popupState";
import SubscribeForm from "./SubscribeForm";

/**
 * Subscription Popup (Phase 6A — requirements R-1..R-24,
 * SUBSCRIPTION_POPUP Requirements/Design Plan; coordination per
 * the Phase 5A plan + owner decisions D-1..D-5).
 *
 * Trigger: ~2 seconds after the page loads OR 50% scroll —
 * whichever comes first — asks the Popup Coordinator for the
 * modal (`requestSubscriptionPopup`). The coordinator alone
 * decides WHEN it may open (one modal at a time, subscription
 * priority, never while the visitor is filling a form, never in
 * the same view after another popup closed). This component
 * never opens itself directly.
 *
 * After a successful submit the popup shows the owner's exact
 * message ("ইমেইল চেক করুন, লিংকে ক্লিক করলে সাবস্ক্রিপশন চালু
 * হবে" — never "subscribed", since only the emailed link
 * completes it) and closes itself after 2 seconds; that close
 * is NOT a visitor dismiss, so it starts no cooldown.
 *
 * Owner's rule (2026-11-02): the popup must NEVER need an
 * internal scroll on mobile — no max-height / overflow-y on
 * the card; compact spacing on small screens (desktop
 * unchanged) keeps the WHOLE card visible at once.
 *
 * The form is the EXISTING SubscribeForm (double opt-in,
 * mandatory consent) reused unchanged — submission success is
 * reported through its optional `onSubmitted`, which records
 * the browser's PENDING memory only on success. Verified status
 * is never assumed here: it is marked by the verification page
 * after the server confirms it (R-18), and no email, token or
 * secret is ever stored in the browser (R-24).
 */

/** Owner's rule (2026-11-01): the popup appears as soon as the
 * visitor enters the site — this short delay only lets the
 * page paint first. */
const TRIGGER_DELAY_MS = 600;
/** While the popup is closed, re-offer it on this cadence; the
 * coordinator's own 5-minute rule decides whether it may
 * actually open (owner's rule, 2026-11-01). */
const RECUR_CHECK_MS = 30_000;
const TRIGGER_SCROLL_RATIO = 0.5;
/** Routes where the trigger must never run (the coordinator
 * refuses intents there too — defence in depth). */
const TRIGGER_EXCLUDED_PATHS = new Set(["/verify-subscription", "/unsubscribe"]);

export default function SubscriptionPopup() {
  const {
    subscriptionPopupOpen: isOpen,
    requestSubscriptionPopup,
    closeSubscriptionPopup,
    setSubscriptionFormActive,
  } = usePopupCoordinator();
  const settings = useSiteSettings();
  const location = useLocation();
  const firedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const excluded = TRIGGER_EXCLUDED_PATHS.has(location.pathname);

  // ---- Trigger: timer OR scroll, whichever first ------------
  useEffect(() => {
    if (excluded || isOpen || firedRef.current) return;
    let deferredVisibilityHandler: (() => void) | null = null;
    const fire = () => {
      if (firedRef.current) return;
      // Never open into a hidden tab: if the trigger moment
      // arrives while the tab is in the background, defer the
      // request until the visitor actually sees the page.
      if (document.visibilityState === "hidden") {
        if (deferredVisibilityHandler) return;
        deferredVisibilityHandler = () => {
          if (document.visibilityState !== "visible") return;
          document.removeEventListener(
            "visibilitychange",
            deferredVisibilityHandler!,
          );
          deferredVisibilityHandler = null;
          fire();
        };
        document.addEventListener(
          "visibilitychange",
          deferredVisibilityHandler,
        );
        return;
      }
      firedRef.current = true;
      requestSubscriptionPopup();
    };
    const timer = window.setTimeout(fire, TRIGGER_DELAY_MS);
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return; // nothing to scroll: timer only
      if (window.scrollY / scrollable >= TRIGGER_SCROLL_RATIO) fire();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Recurrence (owner's rule, 2026-11-01): every 5 minutes
    // the popup is offered again. The interval only ASKS — the
    // coordinator re-checks the 5-minute gap from the last
    // close before granting, and form-filling is never
    // interrupted (the reducer blocks grants while a form is
    // active).
    const recur = window.setInterval(() => {
      if (document.visibilityState === "visible") requestSubscriptionPopup();
    }, RECUR_CHECK_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(recur);
      window.removeEventListener("scroll", onScroll);
      if (deferredVisibilityHandler) {
        document.removeEventListener(
          "visibilitychange",
          deferredVisibilityHandler,
        );
        deferredVisibilityHandler = null;
      }
    };
  }, [excluded, isOpen, requestSubscriptionPopup]);

  // ---- Escape closes (a visitor close cooldown) -----------
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSubscriptionPopup(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeSubscriptionPopup]);

  // ---- Focus trap (owner's rule, 2026-10-27) ----------------
  // While the dialog is open, focus starts inside it, Tab and
  // Shift+Tab cycle through its focusable elements only, and
  // closing returns focus to whatever had it before.
  useEffect(() => {
    if (!isOpen) return;
    const card = cardRef.current;
    if (!card) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        card.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
    const first = focusables()[0];
    if (first) first.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // ---- Auto-close 2s after a successful submit --------------
  useEffect(() => {
    if (!isOpen) {
      setJustSubmitted(false);
      return;
    }
    if (!justSubmitted) return;
    const timer = window.setTimeout(() => {
      // Owner's 5-minute rule (2026-11-01): the gap until the
      // next showing counts from whenever the popup leaves the
      // screen — a visitor close OR this post-submit auto-close.
      closeSubscriptionPopup(true);
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [isOpen, justSubmitted, closeSubscriptionPopup]);

  if (!isOpen) return null;

  const orgName = settings.nameBn;
  // Owner's rule (2026-11-01): the popup ALWAYS shows the form,
  // even in a browser that already subscribed — one subscription
  // is per EMAIL, and re-entering the same email is answered by
  // the form's own already-subscribed message. (This replaces
  // the earlier defensive already-subscribed note that swapped
  // the form away for verified browsers.)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ইমেইল সাবস্ক্রিপশন"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSubscriptionPopup(true);
      }}
    >
      <div ref={cardRef} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="./logo.png"
              alt=""
              className="h-11 w-11 rounded-full object-cover ring-2 ring-gold"
            />
            <p className="text-sm font-semibold text-dark-green">{orgName}</p>
          </div>
          <button
            type="button"
            onClick={() => closeSubscriptionPopup(true)}
            aria-label="সাবস্ক্রিপশন পপআপ বন্ধ করুন"
            className="rounded-full px-2 text-xl leading-none text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        <h2 className="mt-3 text-lg font-bold text-dark-green sm:mt-4 sm:text-xl">
          নোটিশ ও ঘোষণা ইমেইলে পান
        </h2>
        <p className="mt-1 text-[13px] text-slate-600 sm:text-sm">
          সংগঠনের সর্বশেষ নোটিশ ও কার্যক্রমের খবর সরাসরি আপনার ইমেইলে পেতে
          সাবস্ক্রাইব করুন।
        </p>

        <div className="mt-3 sm:mt-4">
          <SubscribeForm
            tone="light"
            inputId="subscribe-email-popup"
            onActiveChange={setSubscriptionFormActive}
            onSubmitted={(result) => {
              markSubscriptionSubmitted(Date.now());
              markSubscriptionVerified(result.subscriberId);
              setJustSubmitted(true);
            }}
            doneMessage="পরবর্তী সব নোটিশ ও ঘোষণা এই মেইলে পৌঁছাবে। (Inbox-এ না পেলে Spam ফোল্ডারটি দেখুন)"
          />
        </div>

        <p className="mt-3 text-center text-xs text-slate-400 sm:mt-4">
          যেকোনো সময় ইমেইলের লিংক থেকে আনসাবস্ক্রাইব করা যাবে।{" "}
          <Link to="/notifications" className="underline hover:text-primary">
            সব নোটিশ দেখুন
          </Link>
        </p>
      </div>
    </div>
  );
}
