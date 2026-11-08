import { Link, useParams } from "react-router-dom";
import { usePublicNewsPost } from "../../hooks/usePublicNews";
import { formatDateBn } from "../../utils/format";
import { POST_TYPE_LABELS, NOTICE_CATEGORY_LABELS } from "../../utils/newsPost";
import NoticeButton from "../../components/NoticeButton";

/**
 * Public post detail (Phase C / C3). The query requires the slug AND
 * is_published = true, and the database policy refuses drafts to the
 * public role as well — so a draft's direct URL shows the same honest
 * "not found" as a slug that never existed.
 */
export default function NewsDetailsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { post, loading, error, isConfigured } = usePublicNewsPost(slug);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link to="/news" className="text-sm font-semibold text-brand hover:underline">
        ← সব সংবাদ, কার্যক্রম ও নোটিশ
      </Link>

      <div className="mt-6">
        {!isConfigured ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
            সার্ভার সংযোগ এখনো সেট করা হয়নি — কিছুদিন পর আবার চেষ্টা করুন।
          </p>
        ) : loading ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">লোড হচ্ছে…</p>
        ) : error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-12 text-center text-sm text-red-700">{error}</p>
        ) : !post ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center">
            <p className="font-semibold text-brand-dark">পোস্টটি পাওয়া যায়নি</p>
            <p className="mt-1 text-sm text-neutral-500">এই ঠিকানায় কোনো প্রকাশিত পোস্ট নেই — এটি সরানো হয়ে থাকতে পারে অথবা এখনো প্রকাশ হয়নি।</p>
          </div>
        ) : (
          <article>
            <span className="rounded bg-gold/25 px-2 py-0.5 text-[11px] font-semibold text-brand-dark">
              {POST_TYPE_LABELS[post.type] ?? "সংবাদ"}
            </span>
            {post.type === "notice" && (
              <span className="ml-2 rounded bg-brand-light px-2 py-0.5 text-[11px] font-semibold text-brand-dark">
                {NOTICE_CATEGORY_LABELS[post.notice_category ?? "info"]}
              </span>
            )}
            <h1 className="mt-3 text-2xl font-bold leading-snug text-brand-dark sm:text-3xl">{post.title}</h1>
            {post.published_at && (
              <p className="mt-2 text-sm text-neutral-500">প্রকাশ: {formatDateBn(post.published_at)}</p>
            )}
            {post.cover_image_url && (
              <img src={post.cover_image_url} alt="" className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover" />
            )}
            {post.content ? (
              <div className="mt-6 grid gap-4 text-[15px] leading-relaxed text-neutral-700">
                {post.content.split(/\n+/).filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-neutral-500">এই পোস্টে বিস্তারিত লেখা যোগ করা হয়নি।</p>
            )}
            {post.type === "notice" && post.button_text && (
              <div className="mt-6">
                <NoticeButton post={post} variant="brand" />
              </div>
            )}
          </article>
        )}
      </div>
    </main>
  );
}
