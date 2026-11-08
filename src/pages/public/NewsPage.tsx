import { useState } from "react";
import NewsPostCard from "../../components/NewsPostCard";
import { usePublicNews } from "../../hooks/usePublicNews";
import type { NewsPostType } from "../../types/database.types";
import { POST_TYPE_LABELS, POST_TYPES } from "../../utils/newsPost";

/**
 * Public News, Activities & Notices (Phase C / C3). One list for all
 * three kinds on the news_posts table, separated by the Type filter.
 * Only published posts are requested — and RLS enforces the same, so
 * drafts never appear here.
 */
const FILTERS: { value: "all" | NewsPostType; label: string }[] = [
  { value: "all", label: "সব" },
  ...POST_TYPES.map((t) => ({ value: t as "all" | NewsPostType, label: POST_TYPE_LABELS[t] })),
];

export default function NewsPage() {
  const [filter, setFilter] = useState<"all" | NewsPostType>("all");
  const { posts, loading, error, isConfigured } = usePublicNews(filter);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">সংবাদ, কার্যক্রম ও নোটিশ</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">
        সংঘের সব সংবাদ, কার্যক্রমের খবর ও সরকারি নোটিশ এখানে প্রকাশ করা হয়।
      </p>

      <div className="mt-6 flex flex-wrap gap-1.5" role="group" aria-label="ধরন অনুযায়ী ছাঁকনি">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? "rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-brand-dark ring-1 ring-neutral-300 hover:bg-neutral-50"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {!isConfigured ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
            সার্ভার সংযোগ এখনো সেট করা হয়নি — কিছুদিন পর আবার চেষ্টা করুন।
          </p>
        ) : error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-12 text-center text-sm text-red-700">{error}</p>
        ) : loading ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">লোড হচ্ছে…</p>
        ) : posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
            এই ধরনের কোনো প্রকাশিত পোস্ট এখনো নেই।
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {posts.map((post) => (
              <NewsPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
