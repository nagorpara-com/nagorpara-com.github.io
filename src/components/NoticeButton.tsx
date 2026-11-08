import { isSafeButtonUrl } from "../utils/newsPost";

/**
 * A notice's optional call-to-action button (migration 0027).
 * Renders NOTHING unless both halves of the pair are stored
 * and the URL is http(s) — the same rule the database CHECK
 * enforces, re-checked at render time so a legacy or hand-made
 * row can never produce a dangerous link. Shared by the
 * notification popup, the public notifications list and the
 * notice detail page so the button looks identical everywhere.
 */
export default function NoticeButton({
  post,
  variant = "gold",
}: {
  post: { button_text?: string | null; button_url?: string | null };
  variant?: "gold" | "brand";
}) {
  if (!post.button_text || !isSafeButtonUrl(post.button_url)) return null;
  return (
    <a
      href={post.button_url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        variant === "gold"
          ? "inline-block rounded-md bg-gold px-4 py-2 text-sm font-bold text-dark-green transition hover:brightness-95"
          : "inline-block rounded-md bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-dark-green"
      }
    >
      {post.button_text}
    </a>
  );
}
