import { Link } from "react-router-dom";
import type { NewsPost } from "../types/database.types";
import { formatDateBn } from "../utils/format";
import { makeExcerpt, POST_TYPE_LABELS } from "../utils/newsPost";

/**
 * Shared public card for a news / activity / notice post (Phase C /
 * C3) — same visual language as the homepage news section, so the
 * /news list and any future surface stay consistent.
 *
 * Layout rule (owner, 2026-11-02): the /news grid follows the
 * homepage section's rule — two cards per row on mobile, four
 * per row on desktop — and below the `sm` breakpoint the card
 * uses the same mobile text sizes as the homepage card.
 * Desktop sizes are unchanged.
 */
export default function NewsPostCard({ post }: { post: NewsPost }) {
  const excerpt = makeExcerpt(post.content);
  return (
    <Link
      to={`/news/${post.slug}`}
      className="group np-card np-card-hover block"
    >
      <span className="np-gold-line" aria-hidden="true" />
      {post.cover_image_url ? (
        <span className="np-media block aspect-[16/9]">
          <img src={post.cover_image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        </span>
      ) : (
        <span
          className="np-media flex aspect-[16/9] items-center justify-center text-2xl font-bold text-brand/40"
          aria-hidden="true"
        >
          {post.title.charAt(0)}
        </span>
      )}
      <span className="block p-4">
        <span className="np-chip bg-gold/25">
          {POST_TYPE_LABELS[post.type] ?? "সংবাদ"}
        </span>
        <span className="mt-3 line-clamp-2 block text-sm font-bold leading-6 text-brand-dark sm:mt-2 sm:text-base">{post.title}</span>
        {post.published_at && (
          <span className="mt-2 block text-xs text-neutral-500 sm:mt-1">{formatDateBn(post.published_at)}</span>
        )}
        {excerpt && <span className="mt-2.5 line-clamp-2 block text-xs leading-[22px] text-neutral-600 sm:mt-1.5 sm:text-sm sm:leading-5">{excerpt}</span>}
      </span>
    </Link>
  );
}
