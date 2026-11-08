import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePublicNews } from "../../hooks/usePublicNews";
import {
  isSafeButtonUrl,
  makeExcerpt,
  NOTICE_CATEGORY_LABELS,
} from "../../utils/newsPost";
import NoticeButton from "../../components/NoticeButton";
import { formatDateBn } from "../../utils/format";
import { isNoticeSeen, markNoticeSeen, readSeenIds } from "../../utils/noticeSeen";

const PAGE_SIZE = 12;

/**
 * Public Notifications page (Phase C / C3 Step A) — every
 * published notice in one list, newest first.
 *
 * The list itself always comes from the database (published
 * notices only — the query filters on type + is_published and the
 * RLS policy refuses anything else), so it survives reloads and
 * new sessions. localStorage holds ONLY this browser's read
 * preference: which notices it has already opened. Opening an
 * item marks it read; "সব পড়া হয়েছে" marks every published
 * notice read. Dismissing/reading never deletes anything.
 */
export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const { posts: allPosts, loading, error } = usePublicNews("notice");
  const [seenIds, setSeenIds] = useState<string[]>(() => readSeenIds());

  // Returning to this page (or arriving after reading via the bar)
  // re-reads the shared seen set.
  useEffect(() => {
    setSeenIds(readSeenIds());
  }, []);

  const totalPages = Math.max(1, Math.ceil(allPosts.length / PAGE_SIZE));
  const posts = useMemo(
    () => allPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [allPosts, page],
  );

  const openNotice = (id: string) => setSeenIds(markNoticeSeen(id));

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">নোটিশ ও বিজ্ঞপ্তি</h1>

      <div className="mt-6">
        {loading ? (
          <p className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-100">
            লোড হচ্ছে…
          </p>
        ) : error ? (
          <p role="alert" className="rounded-2xl bg-white p-8 text-center text-red-700 shadow-sm ring-1 ring-slate-100">
            {error}
          </p>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-100">
            <p className="font-semibold text-slate-700">এখনো কোনো প্রকাশিত নোটিশ নেই</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              নতুন নোটিশ প্রকাশিত হলে এখানে দেখা যাবে এবং ওয়েবসাইটের
              উপরের বার ও ঘণ্টা চিহ্নে জানানো হবে।
            </p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {posts.map((post) => {
                const unread = !isNoticeSeen(post.id, seenIds);
                return (
                  <li
                    key={post.id}
                    className={`flex flex-col overflow-hidden rounded-2xl border-t-4 border-t-gold bg-white shadow-sm ring-1 ring-slate-100 ${unread ? "bg-gold/10" : ""}`}
                  >
                    <Link
                      to={`/news/${post.slug}`}
                      onClick={() => openNotice(post.id)}
                      className="flex flex-1 flex-col p-4 transition hover:bg-brand-light/50"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`h-2 w-2 shrink-0 rounded-full ${unread ? "bg-brand" : "bg-slate-300"}`}
                        />
                        <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold text-brand-dark">
                          {NOTICE_CATEGORY_LABELS[post.notice_category ?? "info"]}
                        </span>
                        {unread && (
                          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
                            নতুন
                          </span>
                        )}
                      </span>
                      <span className={`mt-2 text-sm leading-snug text-slate-800 sm:text-[15px] ${unread ? "font-bold" : "font-semibold"}`}>
                        {post.title}
                      </span>
                      {post.published_at && (
                        <span className="mt-1 text-xs text-slate-500">
                          {formatDateBn(post.published_at)}
                        </span>
                      )}
                      <span className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-slate-600">
                        {makeExcerpt(post.content, 150)}
                      </span>
                      <span className="mt-auto inline-flex pt-3">
                        <span className="rounded-lg bg-brand px-3.5 py-1.5 text-xs font-bold text-white">
                          বিস্তারিত
                        </span>
                      </span>
                    </Link>
                    {post.button_text && isSafeButtonUrl(post.button_url) && (
                      <div className="px-4 pb-4">
                        <NoticeButton post={post} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <div className="mt-5 flex items-center justify-center gap-3 text-sm">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-full border border-slate-300 px-4 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
                >
                  ← আগের
                </button>
                <span className="text-slate-600">
                  পৃষ্ঠা {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-full border border-slate-300 px-4 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
                >
                  পরের
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
