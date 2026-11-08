import { useState } from "react";
import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import EmptyState from "./EmptyState";
import { formatDateBn } from "../../utils/format";
import type { NewsRow } from "../../hooks/useHomepageData";

const TYPE_LABELS: Record<string, string> = {
  news: "সংবাদ",
  activity: "কার্যক্রম",
  notice: "নোটিশ",
};

type NewsFilter = "notice" | "activity" | "news";

const FILTERS: { value: NewsFilter; label: string }[] = [
  { value: "notice", label: "নোটিশ" },
  { value: "activity", label: "কার্যক্রম" },
  { value: "news", label: "সংবাদ" },
];

/**
 * Section 7 — latest published news / activities / notices,
 * filtered by the three type buttons.
 *
 * Count rule (owner, 2026-11-02): per category the homepage
 * shows the latest 6 — on mobile only the first 4 (two per
 * row, two below; cards 5–6 are hidden), on desktop all 6
 * (four in the first row, two below). Anything older stays
 * off the homepage and lives on the /news page ("সব দেখুন").
 * Mobile cards use slightly reduced spacing/text below the
 * `sm` breakpoint, sized so all four cards fill one phone
 * screen — fully visible, without the next section peeking
 * in below. Desktop cards keep the original sizes.
 */
export function NewsPreview({ news, headingTitle }: { news: NewsRow[]; headingTitle?: string }) {
  const [chosen, setChosen] = useState<NewsFilter | null>(null);
  const hasPosts = (type: NewsFilter) => news.some((post) => post.type === type);
  const activeFilter: NewsFilter =
    chosen ?? (hasPosts("notice") ? "notice" : hasPosts("activity") ? "activity" : "news");
  const visiblePosts = news.filter((post) => post.type === activeFilter).slice(0, 6);
  const activeLabel = FILTERS.find((filter) => filter.value === activeFilter)?.label ?? "পোস্ট";

  return (
    <section aria-label="সংবাদ, কার্যক্রম ও নোটিশ" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:pt-12">
      <SectionHeading title={headingTitle ?? "সংবাদ, কার্যক্রম ও নোটিশ"} linkTo="/news" />
      {news.length === 0 ? (
        <EmptyState message="এখনো কোনো সংবাদ, কার্যক্রম বা নোটিশ প্রকাশ করা হয়নি।" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-1.5 sm:mb-5 sm:flex sm:flex-wrap" role="group" aria-label="ধরন অনুযায়ী ছাঁকনি">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={activeFilter === filter.value}
                onClick={() => setChosen(filter.value)}
                className={
                  activeFilter === filter.value
                    ? "rounded-full bg-brand px-2 py-1.5 text-sm font-semibold text-white sm:px-4"
                    : "rounded-full bg-white px-2 py-1.5 text-sm font-semibold text-brand-dark ring-1 ring-neutral-300 hover:bg-neutral-50 sm:px-4"
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
          {visiblePosts.length === 0 ? (
            <EmptyState message={`এখনো কোনো ${activeLabel} প্রকাশ করা হয়নি।`} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {visiblePosts.map((post, index) => (
            <Link
              key={post.id}
              to={`/news/${post.slug}`}
              className={`group np-card np-card-hover ${index >= 4 ? "hidden sm:block" : "block"}`}
            >
              <span className="np-gold-line" aria-hidden="true" />
              {post.cover_image_url ? (
                <span className="np-media block aspect-[16/9]">
                  <img src={post.cover_image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                </span>
              ) : (
                <span className="np-media flex aspect-[16/9] items-center justify-center text-2xl font-bold text-brand/40" aria-hidden="true">
                  {post.title.charAt(0)}
                </span>
              )}
              <span className="block p-4">
                <span className="np-chip bg-gold/25">
                  {TYPE_LABELS[post.type] ?? "সংবাদ"}
                </span>
                <span className="mt-3 line-clamp-2 block text-sm font-bold leading-6 text-brand-dark sm:mt-2 sm:text-base">{post.title}</span>
                {post.published_at && (
                  <span className="mt-2 block text-xs text-neutral-500 sm:mt-1">{formatDateBn(post.published_at)}</span>
                )}
                {post.content && <span className="mt-2.5 line-clamp-2 block text-xs leading-[22px] text-neutral-600 sm:mt-1.5 sm:text-sm sm:leading-5">{post.content}</span>}
              </span>
            </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
