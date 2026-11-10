import { useState } from "react";
import NoticeEmailPanel from "../../components/admin/NoticeEmailPanel";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { useAuth } from "../../context/AuthContext";
import { useAdminNews, type NewsStatusFilter, type NewsTypeFilter } from "../../hooks/useAdminNews";
import type { NewsPost } from "../../types/database.types";
import { formatDateBn } from "../../utils/format";
import {
  generateSlug,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABELS,
  POST_TYPE_LABELS,
  POST_TYPES,
  validateNewsPostInput,
  type NewsPostFieldErrors,
} from "../../utils/newsPost";

/**
 * Admin News & Notice Management (Phase C / C3, spec §7 family).
 *
 * One page manages all three post kinds on the existing news_posts
 * table — news, activity, notice — separated by the Type filter, so
 * nothing is duplicated. Create always lands as a Draft; publishing
 * is a separate, confirmed action (the same separation C3 keeps for
 * email later). The database policy (can_edit_content) is the real
 * gate; the UI merely hides actions a Viewer cannot use.
 */

const TYPE_CHIPS: { value: NewsTypeFilter; label: string }[] = [
  { value: "all", label: "সব" },
  { value: "news", label: "সংবাদ" },
  { value: "activity", label: "কার্যক্রম" },
  { value: "notice", label: "নোটিশ" },
];

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";
const whiteBtn =
  "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-dark-green disabled:opacity-60";

interface FormState {
  title: string;
  type: string;
  slug: string;
  cover_image_url: string;
  content: string;
  notice_category: string;
  button_text: string;
  button_url: string;
}

const EMPTY_FORM: FormState = { title: "", type: "notice", slug: "", cover_image_url: "", content: "", notice_category: "info", button_text: "", button_url: "" };

export default function AdminNewsPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";
  const news = useAdminNews();

  const [editing, setEditing] = useState<"new" | NewsPost | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<NewsPostFieldErrors>({});
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ post: NewsPost; deliveryCount: number } | null>(null);
  const [countBusyId, setCountBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<NewsPost | null>(null);
  const [emailPost, setEmailPost] = useState<NewsPost | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setEditing("new");
    setFeedback(null);
  }

  function openEdit(post: NewsPost) {
    setForm({
      title: post.title,
      type: post.type,
      slug: post.slug,
      cover_image_url: post.cover_image_url ?? "",
      content: post.content ?? "",
      notice_category: post.notice_category ?? "info",
      button_text: post.button_text ?? "",
      button_url: post.button_url ?? "",
    });
    setFieldErrors({});
    setFormError(null);
    setEditing(post);
    setFeedback(null);
  }

  async function save() {
    const { ok, errors, value } = validateNewsPostInput(form);
    setFieldErrors(errors);
    if (!ok) return;
    setFormBusy(true);
    setFormError(null);
    if (editing === "new") {
      const res = await news.create(value, profile?.id ?? null);
      if (res.ok) {
        setEditing(null);
        setFeedback({ kind: "ok", text: "নতুন পোস্ট খসড়া হিসেবে তৈরি হয়েছে। প্রকাশ করতে তালিকা থেকে “প্রকাশ” চাপুন।" });
      } else setFormError(res.error ?? "তৈরি করা যায়নি।");
    } else if (editing) {
      const res = await news.update(editing.id, { ...value, slug: value.slug || editing.slug });
      if (res.ok) {
        setEditing(null);
        setFeedback({ kind: "ok", text: "পরিবর্তন সংরক্ষণ করা হয়েছে।" });
      } else setFormError(res.error ?? "সংরক্ষণ করা যায়নি।");
    }
    setFormBusy(false);
  }

  /**
   * "প্রকাশ + ইমেইল" — a SEPARATE action from plain publish
   * (owner's C3 rule): publish first, then open the email panel,
   * where the admin sees the preview + verified count and starts
   * the delivery. Sending itself is authorized again on the
   * server by the send-announcement function (Admin role only).
   */
  async function publishAndEmail(post: NewsPost) {
    setBusyId(post.id);
    const res = await news.setPublished(post, true);
    setBusyId(null);
    setConfirmId(null);
    if (res.ok) {
      setFeedback({ kind: "ok", text: "নোটিশটি প্রকাশ করা হয়েছে — এখন ইমেইল পাঠানোর ধাপটি সম্পূর্ণ করুন।" });
      setEmailPost({ ...post, is_published: true });
    } else {
      setFeedback({ kind: "err", text: res.error ?? "প্রকাশ করা যায়নি।" });
    }
  }

  async function togglePublish(post: NewsPost) {
    setBusyId(post.id);
    const res = await news.setPublished(post, !post.is_published);
    setBusyId(null);
    setConfirmId(null);
    if (res.ok) {
      setFeedback({
        kind: "ok",
        text: post.is_published ? "পোস্টটি অপ্রকাশ করা হয়েছে — Public আর এটি দেখতে পাবে না।" : "পোস্টটি প্রকাশ করা হয়েছে — এখন সবাই দেখতে পাবে।",
      });
    } else {
      setFeedback({ kind: "err", text: res.error ?? "কাজটি করা যায়নি।" });
    }
  }

  /**
   * Delete, step 1: read the delivery-history count FIRST. The
   * confirmation must state the true number (deleting a notice
   * cascades its delivery rows away); if the count cannot be read,
   * delete stops here — no guessed number, no confirmation.
   */
  async function askDelete(post: NewsPost) {
    setFeedback(null);
    setCountBusyId(post.id);
    const res = await news.countDeliveries(post.id);
    setCountBusyId(null);
    if (!res.ok) {
      setFeedback({ kind: "err", text: res.error ?? "Delivery ইতিহাস পড়া যায়নি — Delete বন্ধ রাখা হলো।" });
      return;
    }
    setConfirmId(null);
    setDeleteTarget({ post, deliveryCount: res.count ?? 0 });
  }

  /** Delete, step 2: only after the explicit confirmation above. */
  async function doDelete() {
    if (!deleteTarget) return;
    const { post } = deleteTarget;
    setBusyId(post.id);
    const res = await news.deletePost(post);
    setBusyId(null);
    setDeleteTarget(null);
    if (res.ok) {
      setFeedback({ kind: "ok", text: `“${post.title}” পোস্টটি স্থায়ীভাবে মোছা হয়েছে।` });
    } else {
      setFeedback({ kind: "err", text: res.error ?? "মোছা যায়নি।" });
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dark-green">সংবাদ, কার্যক্রম ও নোটিশ</h1>
                  </div>
        {canEdit && (
          <button type="button" onClick={openCreate} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-dark-green">
            + নতুন পোস্ট
          </button>
        )}
      </div>

      {!news.isConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase সংযোগ সেট করা হয়নি — সংযোগ ছাড়া পোস্ট লোড বা সংরক্ষণ করা যাবে না।
        </p>
      )}
      {profile && !canEdit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          শুধু Admin ও Editor পোস্ট তৈরি, সম্পাদনা ও প্রকাশ করতে পারে। আপনার ভূমিকা দিয়ে শুধু প্রকাশিত পোস্ট দেখা যাচ্ছে (Database-এর নিয়ম অনুযায়ী)।
        </p>
      )}
      {feedback && (
        <p
          className={
            feedback.kind === "ok"
              ? "rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-medium text-dark-green"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
          role="status"
        >
          {feedback.text}
        </p>
      )}

      {editing !== null && (
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5" aria-label={editing === "new" ? "নতুন পোস্ট" : "পোস্ট সম্পাদনা"}>
          <h2 className="font-bold text-dark-green">{editing === "new" ? "নতুন পোস্ট" : "পোস্ট সম্পাদনা"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="np-title">শিরোনাম *</label>
              <input
                id="np-title"
                className={inputCls}
                value={form.title}
                maxLength={200}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="যেমন: বার্ষিক সাধারণ সভার নোটিশ"
              />
              {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="np-type">ধরন *</label>
              <select id="np-type" className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {POST_TYPES.map((t) => (
                  <option key={t} value={t}>{POST_TYPE_LABELS[t]}</option>
                ))}
              </select>
              {fieldErrors.type && <p className="mt-1 text-xs text-red-600">{fieldErrors.type}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="np-slug">Slug (ওয়েব ঠিকানা)</label>
              <input
                id="np-slug"
                className={inputCls}
                value={form.slug}
                maxLength={120}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder={editing === "new" && form.title ? generateSlug(form.title, "••••••") : "খালি রাখলে শিরোনাম থেকে তৈরি হবে"}
              />
              <p className="mt-1 text-xs text-slate-500">শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন; প্রতিটি Slug আলাদা।</p>
              {fieldErrors.slug && <p className="mt-1 text-xs text-red-600">{fieldErrors.slug}</p>}
            </div>
            <div className="sm:col-span-2">
              <PhotoUploadField
                label="কভার ছবি (ঐচ্ছিক)"
                pathPrefix="news"
                sizeHint="1280 × 720 পিক্সেল (অনুপাত 16:9)"
                value={form.cover_image_url}
                onChange={(url) => setForm({ ...form, cover_image_url: url })}
              />
              <div className="mt-2">
              </div>
              {fieldErrors.cover_image_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.cover_image_url}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="np-content">বিস্তারিত</label>
              <textarea
                id="np-content"
                className={inputCls}
                rows={8}
                value={form.content}
                maxLength={20000}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="পোস্টের মূল লেখা…"
              />
              {fieldErrors.content && <p className="mt-1 text-xs text-red-600">{fieldErrors.content}</p>}
            </div>
            {form.type === "notice" && (
              <>
                <div>
                  <label className={labelCls} htmlFor="np-category">নোটিশের ধরন</label>
                  <select
                    id="np-category"
                    className={inputCls}
                    value={form.notice_category}
                    onChange={(e) => setForm({ ...form, notice_category: e.target.value })}
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
                  <label className={labelCls} htmlFor="np-btn-text">বাটনের লেখা (ঐচ্ছিক)</label>
                  <input
                    id="np-btn-text"
                    className={inputCls}
                    value={form.button_text}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, button_text: e.target.value })}
                    placeholder="যেমন: বিস্তারিত দেখুন"
                  />
                  {fieldErrors.button_text && <p className="mt-1 text-xs text-red-600">{fieldErrors.button_text}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="np-btn-url">বাটনের লিংক (ঐচ্ছিক)</label>
                  <input
                    id="np-btn-url"
                    className={inputCls}
                    value={form.button_url}
                    maxLength={500}
                    onChange={(e) => setForm({ ...form, button_url: e.target.value })}
                    placeholder="https://…"
                    inputMode="url"
                  />
                  <p className="mt-1 text-xs text-slate-500">বাটনের লেখা ও লিংক দুটোই লাগবে; লিংক শুধু http(s)।</p>
                  {fieldErrors.button_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.button_url}</p>}
                </div>
              </>
            )}
          </div>
          {formError && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={formBusy} className={primaryBtn}>
              {formBusy ? "সংরক্ষণ হচ্ছে…" : editing === "new" ? "খসড়া তৈরি করুন" : "সংরক্ষণ করুন"}
            </button>
            <button type="button" onClick={() => setEditing(null)} disabled={formBusy} className={whiteBtn}>বাতিল</button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="ধরন অনুযায়ী ছাঁকনি">
          {TYPE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => news.applyFilters({ type: chip.value })}
              className={
                news.typeFilter === chip.value
                  ? "rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 hover:bg-slate-50"
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
        <select
          aria-label="অবস্থা অনুযায়ী ছাঁকনি"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary"
          value={news.statusFilter}
          onChange={(e) => news.applyFilters({ status: e.target.value as NewsStatusFilter })}
        >
          <option value="all">সব অবস্থা</option>
          <option value="published">প্রকাশিত</option>
          <option value="draft">খসড়া</option>
        </select>
        <input
          type="search"
          aria-label="শিরোনাম খুঁজুন"
          placeholder="শিরোনাম খুঁজুন…"
          className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 sm:max-w-xs"
          value={news.search}
          onChange={(e) => news.applyFilters({ search: e.target.value })}
        />
      </div>

      {news.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {news.error}{" "}
          <button type="button" onClick={() => void news.reload()} className="font-semibold underline">আবার চেষ্টা করুন</button>
        </div>
      ) : news.loading ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">লোড হচ্ছে…</p>
      ) : news.posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          এই ছাঁকনিতে কোনো পোস্ট পাওয়া যায়নি।
        </p>
      ) : (
        <ul className="grid gap-3">
          {news.posts.map((post) => (
            <li key={post.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-800">{post.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-gold/20 px-2.5 py-0.5 font-bold text-yellow-700">{POST_TYPE_LABELS[post.type] ?? post.type}</span>
                    {post.is_published ? (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-bold text-primary">প্রকাশিত</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-500">খসড়া</span>
                    )}
                    <span className="text-slate-400">/news/{post.slug}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {post.is_published && post.published_at
                      ? `প্রকাশ: ${formatDateBn(post.published_at)}`
                      : `তৈরি: ${formatDateBn(post.created_at)}`}
                  </p>
                </div>
                <div className="flex max-w-full shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => setPreview(post)} className={whiteBtn}>প্রিভিউ</button>
                  {canEdit && (
                    <button type="button" onClick={() => openEdit(post)} className={whiteBtn}>সম্পাদনা</button>
                  )}
                  {post.type === "notice" && post.is_published && profile?.role === "admin" && (
                    <button type="button" onClick={() => setEmailPost(post)} className={whiteBtn}>ইমেইল</button>
                  )}
                  {canEdit &&
                    (confirmId === post.id ? (
                      <>
                        <span className="self-center text-sm font-medium text-slate-600">
                          {post.is_published ? "অপ্রকাশ করবেন?" : "প্রকাশ করবেন?"}
                        </span>
                        <button
                          type="button"
                          disabled={busyId === post.id}
                          onClick={() => void togglePublish(post)}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                        >
                          হ্যাঁ, নিশ্চিত
                        </button>
                        {!post.is_published && post.type === "notice" && profile?.role === "admin" && (
                          <button
                            type="button"
                            disabled={busyId === post.id}
                            onClick={() => void publishAndEmail(post)}
                            className={primaryBtn}
                          >
                            প্রকাশ + ইমেইল
                          </button>
                        )}
                        <button type="button" onClick={() => setConfirmId(null)} className={whiteBtn}>না</button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(post.id)}
                        className={post.is_published ? whiteBtn : primaryBtn}
                      >
                        {post.is_published ? "অপ্রকাশ" : "প্রকাশ"}
                      </button>
                    ))}
                  {canEdit && (
                    <button
                      type="button"
                      disabled={countBusyId === post.id}
                      onClick={() => void askDelete(post)}
                      className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      {countBusyId === post.id ? "যাচাই হচ্ছে…" : "মুছুন"}
                    </button>
                  )}
                </div>
              </div>
              {deleteTarget?.post.id === post.id && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-bold text-red-700">এই পোস্টটি স্থায়ীভাবে মুছবেন?</p>
                  {post.is_published ? (
                    <p className="mt-1 text-sm font-semibold text-red-600">
                      সতর্কতা: পোস্টটি এখন Public-এ প্রকাশিত — মোছা হলে সবাইয়ের কাছ থেকে চিরতরে মুছে যাবে। মোছা পোস্ট ফেরানোর কোনো উপায় নেই।
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-red-600">মোছা পোস্ট ফেরানোর কোনো উপায় নেই।</p>
                  )}
                  {post.type === "notice" &&
                    (deleteTarget.deliveryCount > 0 ? (
                      <p className="mt-1 text-sm font-semibold text-red-600">
                        এই নোটিশের Email Delivery ইতিহাস রয়েছে ({deleteTarget.deliveryCount}টি) — পোস্ট মোছা হলে Database-এর নিয়মে (ON DELETE CASCADE) সেই ইতিহাসও সঙ্গে মুছে যাবে।
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-red-600">এই নোটিশের কোনো Email Delivery ইতিহাস নেই।</p>
                    ))}
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
              )}
            </li>
          ))}
        </ul>
      )}

      {news.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>মোট {news.total}টি পোস্ট — পৃষ্ঠা {news.page} / {news.totalPages}</span>
          <span className="flex gap-2">
            <button type="button" disabled={news.page <= 1} onClick={() => news.setPage(news.page - 1)} className={whiteBtn}>← আগের</button>
            <button type="button" disabled={news.page >= news.totalPages} onClick={() => news.setPage(news.page + 1)} className={whiteBtn}>পরের</button>
          </span>
        </div>
      )}

      {emailPost && (
        <NoticeEmailPanel post={emailPost} onClose={() => setEmailPost(null)} />
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="পোস্ট প্রিভিউ">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-500">
                প্রিভিউ — {preview.is_published ? "এটি এখন Public-এ প্রকাশিত" : "খসড়া: Public এখনো এটি দেখতে পাচ্ছে না"}
              </p>
              <button type="button" onClick={() => setPreview(null)} className={whiteBtn}>বন্ধ করুন</button>
            </div>
            <span className="rounded bg-gold/25 px-2 py-0.5 text-[11px] font-semibold text-brand-dark">
              {POST_TYPE_LABELS[preview.type] ?? preview.type}
            </span>
            <h2 className="mt-2 text-2xl font-bold text-brand-dark">{preview.title}</h2>
            {(preview.published_at ?? preview.created_at) && (
              <p className="mt-1 text-sm text-neutral-500">{formatDateBn(preview.published_at ?? preview.created_at)}</p>
            )}
            {preview.cover_image_url && (
              <img loading="lazy" src={preview.cover_image_url} alt="" className="mt-4 aspect-[16/9] w-full rounded-xl object-cover" />
            )}
            {preview.content ? (
              <div className="mt-4 grid gap-3 text-[15px] leading-relaxed text-neutral-700">
                {preview.content.split(/\n+/).filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-neutral-500">বিস্তারিত লেখা নেই।</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
