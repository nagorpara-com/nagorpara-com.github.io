import { Fragment, useEffect, useState } from "react";
import NoticeEmailPanel from "../../components/admin/NoticeEmailPanel";
import { useAuth } from "../../context/AuthContext";
import { useAdminNews } from "../../hooks/useAdminNews";
import { supabase } from "../../lib/supabaseClient";
import type { NewsPost, NoticeCategory } from "../../types/database.types";
import {
  announcementAction,
  announcementErrorText,
} from "../../utils/announcement";
import { formatDateBn } from "../../utils/format";
import {
  isSafeButtonUrl,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABELS,
  validateNewsPostInput,
  type NewsPostFieldErrors,
} from "../../utils/newsPost";

/**
 * Admin Notifications (owner's request, 2026-10-25; extended
 * 2026-10-27, Prompt 4 · Step 4) — a dedicated page for
 * notifications ONLY: a form (headline, paragraph, category,
 * optional button), a searchable table of saved notifications,
 * and — per the owner's Prompt 4 decision, which supersedes
 * the old C3 separation ON THIS PAGE — Publish means publish
 * AND send: a confirm dialog first shows how many subscribers
 * will receive the email, and only the first send reaches each
 * subscriber (the delivery engine's idempotency guarantees no
 * duplicates on re-publish or after edits). The separate
 * "ইমেইল" panel remains for the delivery report and for
 * retrying failed sends.
 *
 * A notification is NOT a separate system: it is a notice post
 * (news_posts, type "notice") — the very same records managed
 * on the combined "খবর ও বিজ্ঞপ্তি" page and shown by the
 * public bell / popup / notifications page. This page is a
 * focused view over that one source of truth (the hook's type
 * filter is pinned to "notice"), with writes verified by
 * read-back inside useAdminNews, exactly like the news page.
 * The slug is generated automatically — the admin never types
 * one here; the full form (cover, slug) stays on the news page.
 */

const whiteBtn =
  "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-dark-green disabled:opacity-60";
const labelCls = "block text-sm font-medium text-slate-700";
const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export default function AdminNotificationsPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";
  const news = useAdminNews();

  // Pin this page to notifications (notice posts) only.
  useEffect(() => {
    news.applyFilters({ type: "notice" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<NoticeCategory>("info");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [editing, setEditing] = useState<NewsPost | null>(null);
  const [fieldErrors, setFieldErrors] = useState<NewsPostFieldErrors>({});
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [countBusyId, setCountBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ post: NewsPost; deliveryCount: number } | null>(null);
  const [emailPost, setEmailPost] = useState<NewsPost | null>(null);
  const [searchText, setSearchText] = useState("");
  const [deliveryStats, setDeliveryStats] = useState<
    Record<string, { sent: number; failed: number; pending: number; total: number }>
  >({});
  const [statsTick, setStatsTick] = useState(0);
  const [publishTarget, setPublishTarget] = useState<NewsPost | null>(null);
  const [sendEmailChecked, setSendEmailChecked] = useState(true);
  const [publishCounts, setPublishCounts] = useState<{
    verified: number;
    sent: number;
    failed: number;
  } | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);

  const notices = news.posts.filter((p) => p.type === "notice");

  // Per-notice email result counts for the table (Admin reads
  // notice_deliveries through RLS; welcome rows have no post_id
  // and never appear here).
  useEffect(() => {
    if (!supabase || notices.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("notice_deliveries")
        .select("post_id, status")
        .in("post_id", notices.map((p) => p.id));
      if (cancelled || !data) return;
      const stats: Record<
        string,
        { sent: number; failed: number; pending: number; total: number }
      > = {};
      for (const row of data as { post_id: string; status: string }[]) {
        const s = (stats[row.post_id] ??= {
          sent: 0,
          failed: 0,
          pending: 0,
          total: 0,
        });
        s.total++;
        if (row.status === "sent") s.sent++;
        else if (row.status === "failed") s.failed++;
        else if (row.status === "pending" || row.status === "sending")
          s.pending++;
      }
      setDeliveryStats(stats);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notices.length, statsTick, news.page]);

  function resetForm() {
    setTitle("");
    setContent("");
    setCategory("info");
    setButtonText("");
    setButtonUrl("");
    setEditing(null);
    setFieldErrors({});
    setFormError(null);
  }

  function startEdit(post: NewsPost) {
    setEditing(post);
    setTitle(post.title);
    setContent(post.content ?? "");
    setCategory(post.notice_category ?? "info");
    setButtonText(post.button_text ?? "");
    setButtonUrl(post.button_url ?? "");
    setFieldErrors({});
    setFormError(null);
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateForm() {
    const slug = editing ? editing.slug : `notice-${Date.now().toString(36)}`;
    const result = validateNewsPostInput({
      title,
      type: "notice",
      slug,
      cover_image_url: editing?.cover_image_url ?? "",
      content,
      notice_category: category,
      button_text: buttonText,
      button_url: buttonUrl,
    });
    setFieldErrors(result.errors);
    return result;
  }

  /** Scrolls to the composer and puts the cursor in the headline. */
  function focusComposer() {
    document.getElementById("nn-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("nn-title")?.focus(), 250);
  }

  /** The header's "new notification" action: a fresh, empty form. */
  function startNew() {
    resetForm();
    setFeedback(null);
    focusComposer();
  }

  async function save() {
    const { ok, value } = validateForm();
    if (!ok) return;
    setFormBusy(true);
    setFormError(null);
    const res = editing
      ? await news.update(editing.id, value)
      : await news.create(value, profile?.id ?? null);
    setFormBusy(false);
    if (!res.ok) {
      setFormError(res.error ?? "সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন।");
      return;
    }
    setFeedback({
      kind: "ok",
      text: editing
        ? "পরিবর্তন সংরক্ষিত হয়েছে — Database-এ যাচাই করা হয়েছে।"
        : "নোটিফিকেশনটি খসড়া হিসেবে সংরক্ষিত হয়েছে — Database-এ যাচাই করা হয়েছে। প্রকাশ করতে নিচের তালিকা থেকে “প্রকাশ” চাপুন।",
    });
    resetForm();
  }

  /**
   * "Publish" on the NEW form (owner's Prompt 4 flow): the
   * draft is created first (read-back verified inside the
   * hook), then the publish confirm dialog opens — nothing is
   * published or emailed until the admin confirms there.
   * Cancelling the dialog simply keeps the draft.
   */
  async function createAndAskPublish() {
    const { ok, value } = validateForm();
    if (!ok) return;
    setFormBusy(true);
    setFormError(null);
    const created = await news.create(value, profile?.id ?? null);
    setFormBusy(false);
    if (!created.ok || !created.post) {
      setFormError(created.error ?? "নোটিফিকেশন তৈরি করা যায়নি — আবার চেষ্টা করুন।");
      return;
    }
    resetForm();
    void askPublish(created.post);
  }

  /**
   * Opens the publish confirm dialog with live counts: verified
   * subscribers in total, how many ALREADY received this
   * notice (the engine never emails them twice), and how many
   * failed earlier (those are retried from the email panel,
   * not by this send — stated in the dialog).
   */
  async function askPublish(post: NewsPost) {
    setPublishTarget(post);
    setSendEmailChecked(true);
    setPublishCounts(null);
    setFeedback(null);
    if (!supabase) return;
    const [verifiedRes, deliveryRes] = await Promise.all([
      supabase
        .from("email_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified"),
      supabase
        .from("notice_deliveries")
        .select("status")
        .eq("post_id", post.id),
    ]);
    let sent = 0;
    let failed = 0;
    for (const row of (deliveryRes.data ?? []) as { status: string }[]) {
      if (row.status === "sent") sent++;
      else if (row.status === "failed") failed++;
    }
    setPublishCounts({ verified: verifiedRes.count ?? 0, sent, failed });
  }

  /**
   * Confirm = publish (read-back verified), then send: the
   * engine is called in its batches (25 per call) until no
   * pending recipients remain or a batch makes no progress.
   * Subscribers who already received this notice are never
   * claimed again — re-publishing sends only to those who
   * have not received it.
   */
  async function confirmPublish() {
    if (!publishTarget) return;
    const post = publishTarget;
    setPublishBusy(true);
    const pub = await news.setPublished(post, true);
    if (!pub.ok) {
      setPublishBusy(false);
      setPublishTarget(null);
      setFeedback({
        kind: "err",
        text: pub.error ?? "প্রকাশ করা যায়নি — আবার চেষ্টা করুন। কোনো ইমেইল পাঠানো হয়নি।",
      });
      return;
    }
    let sentTotal = 0;
    let failedTotal = 0;
    let pendingLeft = 0;
    let sendError: string | null = null;
    if (!sendEmailChecked) {
      setPublishBusy(false);
      setPublishTarget(null);
      setStatsTick((t) => t + 1);
      setFeedback({
        kind: "ok",
        text: "প্রকাশিত হয়েছে — Website-এ এখন দেখা যাবে। Gmail-এ পাঠানো হয়নি (টিক দেওয়া ছিল না) — পরে তালিকার “ইমেইল” বোতাম থেকে পাঠানো যাবে।",
      });
      return;
    }
    for (let i = 0; i < 40; i++) {
      const res = await announcementAction("send", post.id);
      if (!res.ok) {
        sendError = announcementErrorText(res);
        break;
      }
      if (res.run) {
        sentTotal += res.run.sent;
        failedTotal += res.run.failed;
      }
      pendingLeft = res.summary?.pending ?? 0;
      if (pendingLeft === 0) break;
      if (
        res.run &&
        res.run.sent === 0 &&
        res.run.failed === 0 &&
        res.run.outcomeUnknown === 0
      )
        break;
    }
    setPublishBusy(false);
    setPublishTarget(null);
    setStatsTick((t) => t + 1);
    if (sendError) {
      setFeedback({
        kind: "err",
        text: `নোটিফিকেশনটি প্রকাশিত হয়েছে, কিন্তু ইমেইল পাঠানো যায়নি (${sendError}) — তালিকার "ইমেইল" বোতাম থেকে আবার চেষ্টা করুন।`,
      });
      return;
    }
    setFeedback({
      kind: "ok",
      text: `প্রকাশিত হয়েছে — Website-এ এখন দেখা যাবে। ইমেইল: ${sentTotal}টি পাঠানো হয়েছে${
        failedTotal > 0
          ? `, ${failedTotal}টি ব্যর্থ (ইমেইল প্যানেল থেকে আবার পাঠানো যাবে)`
          : ""
      }${pendingLeft > 0 ? `, ${pendingLeft}টি বাকি — "ইমেইল" প্যানেল থেকে চালিয়ে যান` : ""}।`,
    });
  }

  async function togglePublish(post: NewsPost) {
    if (!post.is_published) {
      // Publishing now goes through the confirm dialog (it
      // publishes AND sends — owner's Prompt 4 decision).
      void askPublish(post);
      return;
    }
    setBusyId(post.id);
    setFeedback(null);
    const res = await news.setPublished(post, false);
    setBusyId(null);
    if (!res.ok) {
      setFeedback({ kind: "err", text: res.error ?? "অবস্থা বদলানো যায়নি — আবার চেষ্টা করুন।" });
      return;
    }
    setFeedback({
      kind: "ok",
      text: "নোটিফিকেশনটি অপ্রকাশ করা হয়েছে — এখন Website-এ দেখা যাবে না।",
    });
  }

  async function askDelete(post: NewsPost) {
    setCountBusyId(post.id);
    setFeedback(null);
    const counted = await news.countDeliveries(post.id);
    setCountBusyId(null);
    if (!counted.ok) {
      setFeedback({ kind: "err", text: counted.error ?? "Delete-এর আগে যাচাই করা যায়নি।" });
      return;
    }
    setDeleteTarget({ post, deliveryCount: counted.count ?? 0 });
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const post = deleteTarget.post;
    setBusyId(post.id);
    const res = await news.deletePost(post);
    setBusyId(null);
    setDeleteTarget(null);
    if (!res.ok) {
      setFeedback({ kind: "err", text: res.error ?? "মোছা যায়নি — আবার চেষ্টা করুন।" });
      return;
    }
    if (editing?.id === post.id) resetForm();
    setFeedback({ kind: "ok", text: "নোটিফিকেশনটি স্থায়ীভাবে মোছা হয়েছে — Database-এ যাচাই করা হয়েছে।" });
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-green">নোটিফিকেশন</h1>
          <p className="mt-1 text-sm text-slate-600">Publish করলে Website ও ইমেইল একসঙ্গে যাবে।</p>
        </div>
        {canEdit && (
          <button type="button" onClick={startNew} className={primaryBtn}>
            + নতুন নোটিফিকেশন তৈরি করুন
          </button>
        )}
      </header>

      {feedback && (
        <p
          role="status"
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            feedback.kind === "ok" ? "bg-green-50 text-green-800 ring-1 ring-green-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          {feedback.text}
        </p>
      )}
      {news.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
          {news.error}
        </p>
      )}

      {/* Composer */}
      <section id="nn-composer" className="grid scroll-mt-4 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5" aria-label={editing ? "নোটিফিকেশন সম্পাদনা" : "নতুন নোটিফিকেশন"}>
        <h2 className="font-bold text-dark-green">{editing ? "নোটিফিকেশন সম্পাদনা" : "নতুন নোটিফিকেশন লিখুন"}</h2>
        <div>
          <label className={labelCls} htmlFor="nn-title">হেডলাইন *</label>
          <input
            id="nn-title"
            className={inputCls}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="যেমন: বার্ষিক সাধারণ সভার নোটিশ"
          />
          {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="nn-content">প্যারাগ্রাফ</label>
          <textarea
            id="nn-content"
            className={inputCls}
            rows={5}
            value={content}
            maxLength={20000}
            onChange={(e) => setContent(e.target.value)}
            placeholder="নোটিফিকেশনের বিস্তারিত লিখুন…"
          />
          {fieldErrors.content && <p className="mt-1 text-xs text-red-600">{fieldErrors.content}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="nn-category">ধরন</label>
            <select
              id="nn-category"
              className={inputCls}
              value={category}
              onChange={(e) => setCategory(e.target.value as NoticeCategory)}
            >
              {NOTICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {NOTICE_CATEGORY_LABELS[c]} ({c})
                </option>
              ))}
            </select>
            {fieldErrors.notice_category && <p className="mt-1 text-xs text-red-600">{fieldErrors.notice_category}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="nn-btn-text">বাটনের লেখা (ঐচ্ছিক)</label>
            <input
              id="nn-btn-text"
              className={inputCls}
              value={buttonText}
              maxLength={60}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder="যেমন: বিস্তারিত দেখুন"
            />
            {fieldErrors.button_text && <p className="mt-1 text-xs text-red-600">{fieldErrors.button_text}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="nn-btn-url">বাটনের লিংক (ঐচ্ছিক)</label>
            <input
              id="nn-btn-url"
              className={inputCls}
              value={buttonUrl}
              maxLength={500}
              onChange={(e) => setButtonUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
            {fieldErrors.button_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.button_url}</p>}
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-400">বাটনের লেখা ও লিংক দুটোই লাগবে; লিংক শুধু http(s)।</p>
        {/* Live preview of the notification as visitors see it */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="নোটিফিকেশন প্রিভিউ">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">প্রিভিউ</p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
              {NOTICE_CATEGORY_LABELS[category]}
            </span>
            <span className="font-bold text-slate-800">{title.trim() || "(হেডলাইন)"}</span>
          </p>
          {content.trim() && (
            <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{content}</p>
          )}
          {buttonText.trim() && isSafeButtonUrl(buttonUrl.trim()) && (
            <span className="mt-3 inline-block rounded-md bg-gold px-4 py-2 text-sm font-bold text-dark-green">
              {buttonText.trim()}
            </span>
          )}
        </div>
        {formError && <p role="alert" className="text-sm font-medium text-red-600">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button type="button" disabled={!canEdit || formBusy} onClick={() => void save()} className={primaryBtn}>
                {formBusy ? "সংরক্ষণ হচ্ছে…" : "পরিবর্তন সংরক্ষণ করুন"}
              </button>
              <button type="button" disabled={formBusy} onClick={resetForm} className={whiteBtn}>
                বাতিল
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={!canEdit || formBusy} onClick={() => void createAndAskPublish()} className={primaryBtn}>
                {formBusy ? "তৈরি হচ্ছে…" : "Publish"}
              </button>
              <button type="button" disabled={!canEdit || formBusy} onClick={() => void save()} className={whiteBtn}>
                খসড়া হিসেবে সংরক্ষণ করুন
              </button>
            </>
          )}
        </div>
        {!canEdit && <p className="text-xs text-slate-500">আপনার ভূমিকা (Viewer) দিয়ে নোটিফিকেশন লেখা বা বদলানো যায় না — শুধু দেখা যায়।</p>}
      </section>

      {/* Saved list — searchable table (Prompt 4 · Step 4) */}
      <section className="grid gap-3" aria-label="সংরক্ষিত নোটিফিকেশন">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-dark-green">সংরক্ষিত নোটিফিকেশন</h2>
          <input
            type="search"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              news.applyFilters({ search: e.target.value });
            }}
            placeholder="শিরোনাম বা লেখা দিয়ে খুঁজুন…"
            aria-label="নোটিফিকেশন খুঁজুন"
            className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {news.loading ? (
          <p className="text-sm text-slate-500">লোড হচ্ছে…</p>
        ) : notices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
            {searchText.trim()
              ? "এই খোঁজে কোনো নোটিফিকেশন মেলেনি।"
              : "এখনো কোনো নোটিফিকেশন সংরক্ষণ করা হয়নি — উপরের ফর্মে প্রথমটি লিখুন।"}
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">শিরোনাম</th>
                  <th className="px-3 py-2.5 font-semibold">ধরন</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">তারিখ</th>
                  <th className="px-3 py-2.5 font-semibold">ইমেইল ফলাফল</th>
                  <th className="px-4 py-2.5 text-right font-semibold">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((post) => {
                  const stats = deliveryStats[post.id];
                  const catCls =
                    post.notice_category === "offer"
                      ? "bg-gold/25 text-yellow-800"
                      : post.notice_category === "update"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-sky-100 text-sky-800";
                  return (
                    <Fragment key={post.id}>
                      <tr className="border-b border-slate-100 align-top last:border-0">
                        <td className="max-w-[300px] px-4 py-3">
                          <p className="font-bold text-slate-800">{post.title}</p>
                          {post.content && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{post.content}</p>
                          )}
                          {post.button_text && (
                            <p className="mt-1 text-xs font-medium text-slate-400">
                              বাটন: {post.button_text}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${catCls}`}>
                            {NOTICE_CATEGORY_LABELS[post.notice_category ?? "info"]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${post.is_published ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                            {post.is_published ? "Published" : "Draft"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                          <p>তৈরি: {formatDateBn(post.created_at)}</p>
                          {post.is_published && post.published_at && (
                            <p className="mt-0.5">প্রকাশ: {formatDateBn(post.published_at)}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs">
                          {stats && stats.total > 0 ? (
                            <span className="font-medium text-slate-600">
                              <span className="text-primary">পাঠানো {stats.sent}</span>
                              {" · "}
                              <span className="text-red-600">ব্যর্থ {stats.failed}</span>
                              {stats.pending > 0 && (
                                <span className="text-slate-400"> · বাকি {stats.pending}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {post.is_published && (
                              <a href={`#/news/${post.slug}`} target="_blank" rel="noreferrer" className={whiteBtn}>
                                প্রিভিউ
                              </a>
                            )}
                            {canEdit && (
                              <button type="button" onClick={() => startEdit(post)} className={whiteBtn}>
                                সম্পাদনা
                              </button>
                            )}
                            {canEdit && post.is_published && (
                              <button type="button" onClick={() => setEmailPost(post)} className={whiteBtn}>
                                ইমেইল
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                disabled={busyId === post.id}
                                onClick={() => void togglePublish(post)}
                                className={post.is_published ? whiteBtn : primaryBtn}
                              >
                                {post.is_published ? "অপ্রকাশ" : "প্রকাশ"}
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                disabled={countBusyId === post.id || busyId === post.id}
                                onClick={() => void askDelete(post)}
                                className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
                              >
                                মুছুন
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {deleteTarget?.post.id === post.id && (
                        <tr>
                          <td colSpan={6} className="px-4 py-3">
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                              <p className="text-sm font-bold text-red-700">এই নোটিফিকেশনটি স্থায়ীভাবে মুছবেন?</p>
                              {post.is_published ? (
                                <p className="mt-1 text-sm font-semibold text-red-600">
                                  সতর্কতা: এটি এখন Website-এ প্রকাশিত — মোছা হলে সবাইয়ের কাছ থেকে চিরতরে মুছে যাবে। মোছা নোটিফিকেশন ফেরানোর কোনো উপায় নেই।
                                </p>
                              ) : (
                                <p className="mt-1 text-sm text-red-600">মোছা নোটিফিকেশন ফেরানোর কোনো উপায় নেই।</p>
                              )}
                              {deleteTarget.deliveryCount > 0 ? (
                                <p className="mt-1 text-sm font-semibold text-red-600">
                                  এই নোটিফিকেশনের Email Delivery ইতিহাস রয়েছে ({deleteTarget.deliveryCount}টি) — মোছা হলে Database-এর নিয়মে (ON DELETE CASCADE) সেই ইতিহাসও সঙ্গে মুছে যাবে।
                                </p>
                              ) : (
                                <p className="mt-1 text-sm text-red-600">এই নোটিফিকেশনের কোনো Email Delivery ইতিহাস নেই।</p>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busyId === post.id}
                                  onClick={() => void doDelete()}
                                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                                >
                                  হ্যাঁ, স্থায়ীভাবে মুছুন
                                </button>
                                <button type="button" onClick={() => setDeleteTarget(null)} className={whiteBtn}>
                                  না, বাতিল
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {news.total > 0 && (
          <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span>পৃষ্ঠা {news.page} / {news.totalPages}</span>
            <span className="flex gap-2">
              <button type="button" disabled={news.page <= 1} onClick={() => news.setPage(news.page - 1)} className={whiteBtn}>← আগের</button>
              <button type="button" disabled={news.page >= news.totalPages} onClick={() => news.setPage(news.page + 1)} className={whiteBtn}>পরের</button>
            </span>
          </div>
        )}
      </section>

      {/* Publish confirm dialog (Prompt 4): shows the recipient
          count BEFORE anything is published or sent. */}
      {publishTarget && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="প্রকাশ নিশ্চিতকরণ"
        >
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-dark-green">প্রকাশ নিশ্চিতকরণ</h2>
            <p className="mt-1 text-sm font-medium text-slate-700">{publishTarget.title}</p>
            {publishCounts === null ? (
              <p className="mt-4 text-sm text-slate-500">গ্রাহক সংখ্যা গণনা হচ্ছে…</p>
            ) : (
              <div className="mt-4 grid gap-2 text-sm text-slate-700">
                <p>
                  <strong className="text-base text-dark-green">
                    {Math.max(0, publishCounts.verified - publishCounts.sent)} জন
                  </strong>{" "}
                  Subscriber-এর কাছে এই নোটিফিকেশনের ইমেইল যাবে
                  (মোট যাচাইকৃত গ্রাহক {publishCounts.verified} জন)।
                </p>
                {publishCounts.sent > 0 && (
                  <p className="text-slate-500">
                    ইতিমধ্যে {publishCounts.sent} জন এই নোটিফিকেশনটি পেয়েছেন — তাঁদের কাছে আবার যাবে না।
                  </p>
                )}
                {publishCounts.failed > 0 && (
                  <p className="text-slate-500">
                    আগের {publishCounts.failed}টি ব্যর্থ এই পাঠানোয় যাবে না — সেগুলো "ইমেইল" প্যানেলের Retry থেকে পাঠাতে হবে।
                  </p>
                )}
                {publishCounts.verified - publishCounts.sent <= 0 && (
                  <p className="text-slate-500">
                    নতুন করে কারো কাছে ইমেইল যাবে না — শুধু Website-এ প্রকাশ হবে।
                  </p>
                )}
              </div>
            )}
            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
              <input
                type="checkbox"
                checked={sendEmailChecked}
                onChange={(e) => setSendEmailChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#17623D]"
              />
              <span>
                <strong className="font-semibold text-dark-green">Gmail-এ নোটিফিকেশন পাঠান</strong>
                <span className="mt-0.5 block text-[13px] text-slate-500">
                  টিক দিলে সব সক্রিয় Subscriber-এর Gmail-এ এই নোটিফিকেশনটি যাবে। টিক না দিলে শুধু Website-এ প্রকাশ হবে।
                </span>
              </span>
            </label>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={publishBusy || publishCounts === null}
                onClick={() => void confirmPublish()}
                className={primaryBtn}
              >
                {publishBusy
                  ? "প্রকাশ করা হচ্ছে…"
                  : sendEmailChecked
                    ? "প্রকাশ করুন ও ইমেইল পাঠান"
                    : "শুধু প্রকাশ করুন"}
              </button>
              <button
                type="button"
                disabled={publishBusy}
                onClick={() => setPublishTarget(null)}
                className={whiteBtn}
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {emailPost && <NoticeEmailPanel post={emailPost} onClose={() => setEmailPost(null)} />}
    </div>
  );
}
