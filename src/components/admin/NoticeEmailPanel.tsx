import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { NewsPost, NoticeDelivery } from "../../types/database.types";
import {
  announcementAction,
  announcementErrorText,
  UNCERTAIN_ERROR_PREFIX,
  type DeliverySummary,
} from "../../utils/announcement";
import { formatDateBn } from "../../utils/format";
import { makeExcerpt } from "../../utils/newsPost";

/**
 * Notice Email Panel (Phase C / C3 Step D) — the Admin Panel's
 * delivery workflow for one published notice, per the owner's
 * Admin-Controlled C3 rule:
 * - Email Preview + verified subscriber count BEFORE sending.
 * - Sending goes through the send-announcement function, which
 *   re-authorizes the admin on the server; this panel is only a
 *   view. Delivery rows are read back through RLS (Admin SELECT).
 * - Publication status (on the post) and DELIVERY status (here)
 *   are separate things and are shown separately.
 * - "sent" wording is honest: Gmail accepted the message — the
 *   panel never claims inbox delivery.
 * - Rows whose outcome is unknown carry an "অনিশ্চিত" badge and
 *   the retry confirmation states the duplicate risk plainly.
 */

const whiteBtn =
  "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-dark-green disabled:opacity-60";

const STATUS_BADGES: Record<NoticeDelivery["status"], { label: string; cls: string }> = {
  pending: { label: "অপেক্ষমাণ", cls: "bg-slate-100 text-slate-600" },
  sending: { label: "পাঠানো হচ্ছে…", cls: "bg-amber-100 text-amber-800" },
  sent: { label: "পাঠানো হয়েছে", cls: "bg-primary/10 text-primary" },
  failed: { label: "ব্যর্থ", cls: "bg-red-50 text-red-700" },
};

function isUncertain(row: NoticeDelivery): boolean {
  return (
    row.status === "failed" &&
    typeof row.error === "string" &&
    row.error.startsWith(UNCERTAIN_ERROR_PREFIX)
  );
}

export default function NoticeEmailPanel({
  post,
  onClose,
}: {
  post: NewsPost;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<DeliverySummary | null>(null);
  const [verified, setVerified] = useState<number | null>(null);
  const [rows, setRows] = useState<NoticeDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"send" | "retry" | null>(null);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadRows = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("notice_deliveries")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true })
      .limit(200);
    setRows((data ?? []) as NoticeDelivery[]);
  }, [post.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await announcementAction("preview", post.id);
    if (res.ok) {
      setSummary(res.summary);
      setVerified(res.verifiedSubscribers);
      setMessage(null);
    } else {
      setMessage({ kind: "err", text: announcementErrorText(res) });
    }
    await loadRows();
    setLoading(false);
  }, [post.id, loadRows]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(mode: "send" | "retry") {
    setBusy(mode);
    setConfirmRetry(false);
    const res = await announcementAction(mode, post.id);
    setBusy(null);
    if (res.ok) {
      setSummary(res.summary);
      setVerified(res.verifiedSubscribers);
      const r = res.run;
      setMessage({
        kind: "ok",
        text: r
          ? `সম্পন্ন: ${r.sent}টি পাঠানো হয়েছে, ${r.failed}টি ব্যর্থ${r.outcomeUnknown > 0 ? `, ${r.outcomeUnknown}টির ফলাফল লিপিবদ্ধ করা যায়নি (পরে "অনিশ্চিত" হিসেবে দেখা যাবে)` : ""}।`
          : "সম্পন্ন হয়েছে।",
      });
    } else {
      setMessage({ kind: "err", text: announcementErrorText(res) });
    }
    await loadRows();
  }

  const claimable =
    (summary?.pending ?? 0) + (summary?.failed ?? 0) > 0;
  const uncertainCount = summary?.uncertain ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="নোটিশ ইমেইল">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-dark-green">নোটিশ ইমেইল</h2>
            <p className="mt-0.5 text-sm text-slate-500">{post.title}</p>
          </div>
          <button type="button" onClick={onClose} className={whiteBtn}>বন্ধ করুন</button>
        </div>

        {message && (
          <p
            className={
              message.kind === "ok"
                ? "mb-4 rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-medium text-dark-green"
                : "mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            }
            role="status"
          >
            {message.text}
          </p>
        )}

        {/* Email preview — what a subscriber will receive. */}
        <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="ইমেইল প্রিভিউ">
          <h3 className="text-sm font-bold text-slate-700">ইমেইল প্রিভিউ</h3>
          <p className="mt-2 text-sm"><span className="font-medium text-slate-500">বিষয়:</span> নোটিশ: {post.title}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {makeExcerpt(post.content, 300) || "বিস্তারিত লেখা নেই — ইমেইলে শুধু শিরোনাম ও ওয়েবসাইটের লিংক যাবে।"}
          </p>
          {post.button_text && post.button_url && (
            <p className="mt-2 text-sm">
              <span className="font-medium text-slate-500">বাটন:</span>{" "}
              <span className="inline-block rounded-md bg-primary px-3 py-1 text-xs font-bold text-white">{post.button_text}</span>{" "}
              <span className="break-all text-xs text-slate-500">{post.button_url}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">সঙ্গে থাকবে: নোটিশের লিংক ও আনসাবস্ক্রাইব লিংক।</p>
        </section>

        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          “পাঠানো হয়েছে” মানে Gmail ইমেইলটি গ্রহণ করেছে — প্রাপকের Inbox-এ পৌঁছানোর নিশ্চয়তা নয়।
        </p>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">লোড হচ্ছে…</p>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              যাচাইকৃত সক্রিয় সাবস্ক্রাইবার: <strong>{verified ?? "—"} জন</strong>
              {summary && summary.total === 0 && " — এই নোটিশের জন্য এখনো কোনো Delivery শুরু হয়নি।"}
            </p>

            {summary && summary.total > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs" aria-label="Delivery সারসংক্ষেপ">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600">মোট {summary.total}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600">অপেক্ষমাণ {summary.pending}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">পাঠানো হচ্ছে {summary.sending}</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-bold text-primary">পাঠানো হয়েছে {summary.sent}</span>
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 font-bold text-red-700">ব্যর্থ {summary.failed}</span>
                {uncertainCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">অনিশ্চিত {uncertainCount}</span>
                )}
              </div>
            )}

            {uncertainCount > 0 && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {uncertainCount}টি Delivery-র ফলাফল <strong>অনিশ্চিত</strong>: আগের প্রচেষ্টা মাঝপথে থেমেছিল — ইমেইলটি পৌঁছে থাকতেও পারে। আবার পাঠালে প্রাপক দুবার পেতে পারেন।
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null || !post.is_published || (summary !== null && summary.total > 0 && !claimable)}
                onClick={() => void run("send")}
                className={primaryBtn}
              >
                {busy === "send" ? "পাঠানো হচ্ছে…" : summary && summary.total > 0 ? "পাঠানো চালিয়ে যান" : "ইমেইল পাঠান"}
              </button>
              {summary && summary.failed > 0 &&
                (confirmRetry ? (
                  <>
                    <span className="text-sm font-medium text-slate-600">
                      মোট {summary.failed}টি ব্যর্থ আবার পাঠাবেন{uncertainCount > 0 ? ` (এর মধ্যে ${uncertainCount}টি অনিশ্চিত — প্রাপক দুবার পেতে পারেন)` : ""}?
                    </span>
                    <button type="button" disabled={busy !== null} onClick={() => void run("retry")} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">
                      {busy === "retry" ? "পাঠানো হচ্ছে…" : "হ্যাঁ, আবার পাঠান"}
                    </button>
                    <button type="button" onClick={() => setConfirmRetry(false)} className={whiteBtn}>না</button>
                  </>
                ) : (
                  <button type="button" disabled={busy !== null} onClick={() => setConfirmRetry(true)} className={whiteBtn}>
                    ব্যর্থগুলো আবার পাঠান ({summary.failed})
                  </button>
                ))}
            </div>
            {!post.is_published && (
              <p className="mt-2 text-sm text-amber-700">নোটিশটি এখনো প্রকাশিত নয় — ইমেইল পাঠাতে আগে প্রকাশ করুন।</p>
            )}

            {rows.length > 0 && (
              <ul className="mt-5 grid gap-1.5" aria-label="Delivery তালিকা">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <span className="min-w-0 break-all text-slate-700">{row.recipient_email}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs">
                      {isUncertain(row) && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">অনিশ্চিত</span>
                      )}
                      <span className={`rounded-full px-2.5 py-0.5 font-bold ${STATUS_BADGES[row.status].cls}`}>
                        {STATUS_BADGES[row.status].label}
                      </span>
                      <span className="text-slate-400">
                        {row.sent_at ? formatDateBn(row.sent_at) : row.last_attempt_at ? formatDateBn(row.last_attempt_at) : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
