import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ResendVerificationForm } from "../../components/SubscribeForm";
import { verifySubscriptionToken } from "../../utils/subscription";
import { markSubscriptionVerified } from "../../utils/popupState";

type State =
  | "checking"
  | "verified"
  | "already-verified"
  | "expired"
  | "invalid"
  | "unavailable";

/**
 * Landing page for the emailed verification link
 * (/#/verify-subscription?token=...). The token is consumed by
 * the server function atomically; this page only reports the
 * outcome — verified, already verified, expired (with a resend
 * form), invalid, or the system not being live yet.
 */
export default function VerifySubscriptionPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>(() =>
    params.get("token") ? "checking" : "invalid",
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get("token");
    if (!token) return; // initial state already reports "invalid"
    void verifySubscriptionToken(token).then((result) => {
      if (!result.ok) {
        setState(
          result.code === "NOT_CONFIGURED" ||
            result.code === "FUNCTION_NOT_CONFIGURED"
            ? "unavailable"
            : "invalid",
        );
        return;
      }
      // The SERVER has confirmed the subscription is verified —
      // only now may this browser remember it (R-18/R-19). The
      // memory holds no email or token (R-24) — only the status
      // and the subscription's id, so an Admin delete can later
      // be noticed and the popup offered again (2026-10-27).
      if (result.state === "verified") {
        markSubscriptionVerified(result.subscriberId);
        setState("verified");
      } else if (result.state === "already-verified") {
        markSubscriptionVerified(result.subscriberId);
        setState("already-verified");
      }
      else if (result.state === "expired") setState("expired");
      else setState("invalid");
    });
  }, [params]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-center text-2xl font-extrabold text-dark-green">
          ইমেইল যাচাইকরণ
        </h1>

        {state === "checking" && (
          <p role="status" className="mt-4 text-center text-slate-600">
            যাচাই করা হচ্ছে...
          </p>
        )}

        {state === "verified" && (
          <div role="status" className="mt-4 grid gap-3 text-center">
            <p className="text-lg font-semibold text-primary">
              আপনার সাবস্ক্রিপশন সম্পূর্ণ হয়েছে
            </p>
            <p className="text-slate-600">
              এখন থেকে সংগঠনের নোটিশ ও গুরুত্বপূর্ণ ঘোষণা আপনার ইমেইলে পৌঁছাবে।
            </p>
          </div>
        )}

        {state === "already-verified" && (
          <div role="status" className="mt-4 grid gap-3 text-center">
            <p className="text-lg font-semibold text-primary">
              এই ইমেইলটি ইতিমধ্যে যাচাই করা হয়েছে
            </p>
            <p className="text-slate-600">
              আপনার সাবস্ক্রিপশন সক্রিয় আছে — নতুন করে কিছু করতে হবে না।
            </p>
          </div>
        )}

        {state === "expired" && (
          <div className="mt-4 grid gap-4">
            <p role="status" className="text-center text-slate-700">
              এই যাচাইকরণ লিংকটির মেয়াদ শেষ হয়ে গেছে (মেয়াদ ৪৮ ঘণ্টা)।
              নিচে আপনার ইমেইল দিয়ে নতুন লিংক পাঠিয়ে নিন:
            </p>
            <ResendVerificationForm />
          </div>
        )}

        {state === "invalid" && (
          <div className="mt-4 grid gap-4">
            <p role="alert" className="text-center text-slate-700">
              এই লিংকটি সঠিক নয়, অথবা ইতিমধ্যে ব্যবহার করা হয়েছে।
              যাচাইকরণ ইমেইলের সবশেষ লিংকটি ব্যবহার করুন — কিংবা নতুন
              লিংকের জন্য নিচে ইমেইল দিন:
            </p>
            <ResendVerificationForm />
          </div>
        )}

        {state === "unavailable" && (
          <p role="status" className="mt-4 text-center text-slate-600">
            ইমেইল যাচাইকরণ ব্যবস্থা এখনো চালু হয়নি — অনুগ্রহ করে পরে আবার
            চেষ্টা করুন।
          </p>
        )}

        <p className="mt-6 text-center text-sm">
          <Link to="/" className="font-semibold text-primary hover:underline">
            হোমপেজে ফিরুন
          </Link>
        </p>
      </div>
    </div>
  );
}
