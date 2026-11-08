import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { unsubscribeByToken } from "../../utils/subscription";
import { clearSubscriptionVerified } from "../../utils/popupState";

type State = "confirm" | "sending" | "done" | "already" | "invalid" | "unavailable";

/**
 * Landing page for the unsubscribe link carried by every
 * announcement email (/#/unsubscribe?t=<id>.<signature>).
 *
 * Nothing changes on arrival: the visitor confirms with the
 * button first, so a mail scanner merely *opening* the link can
 * never unsubscribe anyone. The server verifies the HMAC
 * signature before touching any status.
 */
export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>("confirm");
  const token = params.get("t");

  async function handleConfirm() {
    if (!token) {
      setState("invalid");
      return;
    }
    setState("sending");
    const result = await unsubscribeByToken(token);
    if (result.ok) {
      // This browser must forget its verified mark (R-23), so
      // the subscription popup may be offered here again later.
      clearSubscriptionVerified();
      setState(result.state === "already-unsubscribed" ? "already" : "done");
    } else if (
      result.code === "NOT_CONFIGURED" ||
      result.code === "FUNCTION_NOT_CONFIGURED"
    ) {
      setState("unavailable");
    } else {
      setState("invalid");
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-extrabold text-dark-green">
          আনসাবস্ক্রাইব
        </h1>

        {state === "confirm" && (
          <div className="mt-4 grid gap-4">
            <p className="text-slate-700">
              আপনি কি নিশ্চিত যে সংগঠনের নোটিশ ও ঘোষণার ইমেইল আর পেতে চান না?
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!token}
              className="mx-auto rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-dark-green disabled:opacity-60"
            >
              হ্যাঁ, আনসাবস্ক্রাইব করুন
            </button>
            {!token && (
              <p role="alert" className="text-sm text-red-600">
                এই লিংকটি অসম্পূর্ণ — ইমেইলের পুরো লিংকটি ব্যবহার করুন।
              </p>
            )}
          </div>
        )}

        {state === "sending" && (
          <p role="status" className="mt-4 text-slate-600">
            প্রক্রিয়া করা হচ্ছে...
          </p>
        )}

        {state === "done" && (
          <div role="status" className="mt-4 grid gap-2">
            <p className="text-lg font-semibold text-primary">
              আনসাবস্ক্রাইব সম্পূর্ণ হয়েছে
            </p>
            <p className="text-slate-600">
              এখন থেকে এই ঠিকানায় আর কোনো ঘোষণার ইমেইল যাবে না। মত বদলালে
              ওয়েবসাইট থেকে যেকোনো সময় আবার সাবস্ক্রাইব করতে পারবেন।
            </p>
          </div>
        )}

        {state === "already" && (
          <p role="status" className="mt-4 text-slate-700">
            এই ঠিকানাটি ইতিমধ্যে আনসাবস্ক্রাইব করা আছে — কিছু করতে হবে না।
          </p>
        )}

        {state === "invalid" && (
          <p role="alert" className="mt-4 text-slate-700">
            এই লিংকটি সঠিক নয়। ইমেইলের লিংকটি হুবহু ব্যবহার করুন — তাতেও
            কাজ না হলে যোগাযোগ পেজ থেকে আমাদের জানান।
          </p>
        )}

        {state === "unavailable" && (
          <p role="status" className="mt-4 text-slate-600">
            এই সুবিধাটি এই মুহূর্তে চালু নেই — পরে আবার চেষ্টা করুন।
          </p>
        )}

        <p className="mt-6 text-sm">
          <Link to="/" className="font-semibold text-primary hover:underline">
            হোমপেজে ফিরুন
          </Link>
        </p>
      </div>
    </div>
  );
}
