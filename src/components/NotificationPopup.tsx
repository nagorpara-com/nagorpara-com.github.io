import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePopupCoordinator } from "../context/PopupCoordinatorContext";
import { formatDateBn } from "../utils/format";
import { makeExcerpt } from "../utils/newsPost";
import NoticeButton from "./NoticeButton";

/**
 * Notification Popup (Phase 5C) — the modal that shows the
 * LATEST published notice when a visitor arrives, and when the
 * central poller discovers a newly published one.
 *
 * Behaviour (finalized decisions):
 *  - Only the single latest published notice ever gets a popup;
 *    older notices live in the bell count and /notifications —
 *    never a serial chain of popups.
 *  - Closing (✕, backdrop, Escape) marks the notice
 *    POPUP-SHOWN only — it does NOT mark it seen (D-3). The
 *    bell badge therefore still counts it, and the Announcement
 *    Bar may remind about it from the next page view.
 *  - Choosing to read (details) marks it seen through the
 *    existing noticeSeen path, exactly like the bar's link.
 *  - Display and coordination are owned by the Popup
 *    Coordinator; this component only renders what it is told.
 *
 * Design follows the site's existing modal pattern (gallery
 * lightbox): fixed overlay, dialog role, rounded card — brand
 * green / gold, Hind Siliguri via the site font stack. A
 * CENTERED modal on every screen — the owner ordered on
 * 2026-11-02 that the mobile popup must sit in the middle of
 * the screen, not at the bottom (the bottom-sheet layout is
 * retired), and that the notice's photo shows SMALL —
 * passport size — beside the headline.
 *
 * Owner's rule (2026-11-02, later the same day): the popup
 * must NEVER need an internal scroll on mobile — the card is
 * compact on small screens (smaller padding/title, title
 * clamped to 3 lines, excerpt to 4 lines; desktop unchanged)
 * so the WHOLE card is visible at once. Full notice text
 * lives on the detail page; the popup is a teaser.
 */
export default function NotificationPopup() {
  const {
    notificationPopupNotice: notice,
    closeNotificationPopup,
    readNotificationPopup,
    browseAllNoticesFromPopup,
  } = usePopupCoordinator();

  useEffect(() => {
    if (!notice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNotificationPopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notice, closeNotificationPopup]);

  if (!notice) return null;

  const excerpt = makeExcerpt(notice.content, 220);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="সর্বশেষ নোটিশ"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeNotificationPopup();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
            নতুন নোটিশ
          </span>
          <button
            type="button"
            onClick={closeNotificationPopup}
            aria-label="নোটিশ পপআপ বন্ধ করুন"
            className="shrink-0 rounded-full px-2 text-lg font-bold leading-none text-slate-500 transition hover:text-brand-dark"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex items-start gap-3">
          {notice.cover_image_url && (
            <img
              src={notice.cover_image_url}
              alt=""
              loading="lazy"
              className="h-20 w-16 shrink-0 rounded-lg border border-neutral-200 object-cover"
            />
          )}
          <div className="min-w-0">
            <h2 className="line-clamp-3 text-lg font-bold leading-snug text-brand-dark sm:line-clamp-none sm:text-xl">
              {notice.title}
            </h2>
            {notice.published_at && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                {formatDateBn(notice.published_at)}
              </p>
            )}
          </div>
        </div>
        {excerpt && (
          <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-slate-600 sm:line-clamp-none sm:text-sm">{excerpt}</p>
        )}
        {notice.button_text && (
          <div className="mt-3">
            <NoticeButton post={notice} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
          <Link
            to={`/news/${notice.slug}`}
            onClick={readNotificationPopup}
            className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-dark-green"
          >
            বিস্তারিত দেখুন
          </Link>
          <Link
            to="/notifications"
            onClick={browseAllNoticesFromPopup}
            className="rounded-md border border-brand/30 px-4 py-2 text-sm font-semibold text-brand-dark transition hover:bg-brand-light"
          >
            সব নোটিশ
          </Link>
          <button
            type="button"
            onClick={closeNotificationPopup}
            className="px-2 py-2 text-sm font-medium text-slate-500 transition hover:text-brand-dark"
          >
            পরে দেখব
          </button>
        </div>

      </div>
    </div>
  );
}
