import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePopupCoordinator } from "../context/PopupCoordinatorContext";
import { fetchPublishedNotices } from "../hooks/usePublicNews";
import type { NewsPost } from "../types/database.types";
import { formatDateBn } from "../utils/format";
import { makeExcerpt, NOTICE_CATEGORY_LABELS } from "../utils/newsPost";
import {
  isNoticeSeen,
  markNoticeSeen,
  readSeenIds,
  SEEN_CHANGED_EVENT,
} from "../utils/noticeSeen";

/**
 * Header notification bell + dropdown panel (owner design,
 * 2026-10-27).
 *
 * Clicking the bell opens a panel over the page listing every
 * published notice as a small box, newest first — the list is
 * scrollable and each box carries a "ভিউ" button that opens the
 * full notice (the news detail page) and marks it read. The badge
 * keeps counting this browser's unseen published notices from the
 * shared central feed (Phase 5C), so the bell, the bar and the
 * popup can never disagree. The panel's list is fetched fresh each
 * time it opens (no extra polling loop). A link at the panel's
 * foot leads to the full /notifications page. Public only — never
 * an admin entry point.
 */
export default function NotificationBell() {
  const { publishedNoticeIds: ids } = usePopupCoordinator();
  const [seenIds, setSeenIds] = useState<string[]>(() => readSeenIds());
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const location = useLocation();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeenIds(readSeenIds());
    setOpen(false);
  }, [location.pathname]);

  // Another component (bar, notifications page) marking a notice
  // seen refreshes this badge immediately, without navigation.
  useEffect(() => {
    const refresh = () => setSeenIds(readSeenIds());
    window.addEventListener(SEEN_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SEEN_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Fetch the panel list fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchPublishedNotices().then((rows) => {
      if (!cancelled) setPosts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open ]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const unread = ids.filter((id) => !isNoticeSeen(id, seenIds)).length;

  const openNotice = (id: string) => {
    setSeenIds(markNoticeSeen(id));
    setOpen(false);
  };

  const markAllRead = () => {
    let next = seenIds;
    for (const id of ids) next = markNoticeSeen(id);
    setSeenIds(next);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `নোটিশ — ${unread}টি অপঠিত` : "নোটিশ"}
        aria-haspopup="true"
        aria-expanded={open}
        title="নোটিশ"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-dark transition hover:bg-brand-light"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-brand-dark ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2 bg-brand px-4 py-3">
            <span className="font-bold text-white">নোটিফিকেশন</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-gold transition hover:text-white"
              >
                সব পড়া হয়েছে চিহ্নিত করুন
              </button>
            )}
          </div>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto bg-slate-50 p-2.5">
            {posts === null ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">লোড হচ্ছে…</p>
            ) : posts.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">
                এখনো কোনো প্রকাশিত নোটিশ নেই।
              </p>
            ) : (
              posts.map((post) => {
                const itemUnread = !isNoticeSeen(post.id, seenIds);
                return (
                  <div
                    key={post.id}
                    className={`flex items-start gap-2.5 rounded-xl border-l-4 border-l-gold bg-white p-3 ring-1 ring-slate-200 ${itemUnread ? "bg-gold/10" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`h-2 w-2 shrink-0 rounded-full ${itemUnread ? "bg-brand" : "bg-slate-300"}`}
                        />
                        <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold text-brand-dark">
                          {NOTICE_CATEGORY_LABELS[post.notice_category ?? "info"]}
                        </span>
                        {itemUnread && (
                          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
                            নতুন
                          </span>
                        )}
                      </p>
                      <p className={`mt-1 text-sm leading-snug text-slate-800 ${itemUnread ? "font-bold" : "font-semibold"}`}>
                        {post.title}
                      </p>
                      {post.published_at && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDateBn(post.published_at)}
                        </p>
                      )}
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-600">
                        {makeExcerpt(post.content, 110)}
                      </p>
                    </div>
                    <Link
                      to={`/news/${post.slug}`}
                      onClick={() => openNotice(post.id)}
                      className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-dark"
                    >
                      ভিউ
                    </Link>
                  </div>
                );
              })
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block bg-white px-4 py-2.5 text-center text-sm font-bold text-brand transition hover:bg-brand-light"
          >
            সব নোটিশ দেখুন
          </Link>
        </div>
      )}
    </div>
  );
}
