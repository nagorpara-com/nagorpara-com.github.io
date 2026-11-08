import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePopupCoordinator } from "../context/PopupCoordinatorContext";
import { formatDateBn } from "../utils/format";
import { isNoticeSeen, markNoticeSeen, readSeenIds, SEEN_CHANGED_EVENT } from "../utils/noticeSeen";

/**
 * Public Announcement Bar (Phase C / C3 Step 2) — sits directly
 * under the Header on public pages only.
 *
 * Behaviour, kept deliberately simple and predictable:
 *  - It shows the LATEST published notice, and only while this
 *    visitor has not seen it yet. "Seen" happens when the visitor
 *    opens the notice (the details link, or arriving on its page),
 *    or dismisses the bar with the close button.
 *  - A newer notice (a different id) is unseen by definition, so
 *    it appears again — with the "নতুন" badge, which every shown
 *    bar carries because shown means unseen.
 *  - Nothing published, still loading, or a failed fetch: the bar
 *    renders nothing at all. It never blocks or breaks the page.
 *
 * The seen memory lives in localStorage (see utils/noticeSeen) and
 * is a convenience only — the database policy is what decides who
 * may read a notice, and it allows everyone the published ones.
 */
export default function AnnouncementBar() {
  // Data comes from the shared central feed (Phase 5C) — the bar
  // no longer fetches on its own, so it can never disagree with
  // the bell or the popup about the latest published notice.
  const { latestNotice: notice, feedLoading: loading, popupClaimedNoticeId } =
    usePopupCoordinator();
  const [seenIds, setSeenIds] = useState<string[]>(() => readSeenIds());
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();

  const onOwnPage = notice ? location.pathname === `/news/${notice.slug}` : false;

  // Arriving on the notice's own page counts as having seen it.
  useEffect(() => {
    if (notice && onOwnPage && !isNoticeSeen(notice.id, seenIds)) {
      setSeenIds(markNoticeSeen(notice.id));
    }
  }, [notice, onOwnPage, seenIds]);

  // Reading the notice anywhere else (e.g. the /notifications
  // list) clears this bar immediately too.
  useEffect(() => {
    const refresh = () => setSeenIds(readSeenIds());
    window.addEventListener(SEEN_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SEEN_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // While the popup mechanism claims this notice (its popup is
  // open, waiting, or was closed in this very view), the bar
  // stays silent for it — the visitor is never nagged twice
  // about the same notice in the same view (decision D-3). From
  // the next page view the bar resumes its reminder role.
  if (
    loading ||
    !notice ||
    dismissed ||
    onOwnPage ||
    popupClaimedNoticeId === notice.id ||
    isNoticeSeen(notice.id, seenIds)
  ) {
    return null;
  }

  const dismiss = () => {
    setSeenIds(markNoticeSeen(notice.id));
    setDismissed(true);
  };

  return (
    <div className="bg-gold text-brand-dark" role="region" aria-label="সর্বশেষ নোটিশ">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          নতুন
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          <span className="mr-2 font-bold">নোটিশ:</span>
          {notice.title}
          {notice.published_at && (
            <span className="ml-2 whitespace-nowrap text-xs font-medium text-brand-dark/70">
              {formatDateBn(notice.published_at)}
            </span>
          )}
        </p>
        <Link
          to={`/news/${notice.slug}`}
          onClick={() => setSeenIds(markNoticeSeen(notice.id))}
          className="shrink-0 text-sm font-bold text-brand-dark underline decoration-2 underline-offset-2 hover:text-brand"
        >
          বিস্তারিত দেখুন
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="নোটিশ বার বন্ধ করুন"
          className="shrink-0 rounded-full px-1.5 text-base font-bold leading-none text-brand-dark/70 transition hover:text-brand-dark"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
