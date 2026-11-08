import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  fetchLatestPublishedNotice,
  fetchPublishedNoticeIds,
} from "../hooks/usePublicNews";
import type { NewsPost } from "../types/database.types";
import {
  isNoticeSeen,
  markNoticeSeen,
  readSeenIds,
  SEEN_CHANGED_EVENT,
} from "../utils/noticeSeen";
import {
  isPopupShown,
  markPopupShown,
  markSubscriptionDismissed,
  POPUP_SHOWN_CHANGED_EVENT,
  readPopupShownIds,
  readSubscriptionMemory,
  subscriptionPopupAllowed,
  writeSubscriptionMemory,
} from "../utils/popupState";
import { checkSubscriptionExists } from "../utils/subscription";
import {
  INITIAL_COORDINATOR_STATE,
  popupCoordinatorReducer,
} from "../utils/popupCoordinator";

/**
 * Popup Coordinator provider (Phase 5C) — the single home of:
 *
 *  1. The shared notice FEED: the latest published notice and
 *     all published notice ids, fetched through the one query
 *     definition in `usePublicNews`. The Announcement Bar, the
 *     Header bell and the Notification Popup ALL read this feed;
 *     none of them fetches notice data on its own any more.
 *
 *  2. The ONE central poller (decision D-2): a fetch cycle on
 *     mount, on every route change, when the tab becomes
 *     visible again, and every 30 seconds while the tab is
 *     visible. This is described to visitors as "updates within
 *     about 30 seconds" — it is NOT real-time. There is exactly
 *     one interval in the whole public site; no component may
 *     start another.
 *
 *  3. The modal coordination state machine
 *     (`utils/popupCoordinator`): at most one modal open,
 *     subscription priority, no preemption, no second popup in
 *     the view where one just closed.
 *
 * Routes where NO popup may open (finalized requirements):
 * the subscription verification and unsubscribe pages. The feed
 * itself still runs there (bar/bell keep their normal data).
 */

export const NOTICE_POLL_INTERVAL_MS = 30_000;

const POPUP_EXCLUDED_PATHS: readonly string[] = ["/verify-subscription", "/unsubscribe"];

export interface PopupCoordinatorValue {
  /** Shared feed: latest published notice (null when none). */
  latestNotice: NewsPost | null;
  /** Shared feed: ids of all published notices. */
  publishedNoticeIds: string[];
  /** True until the first feed cycle completes. */
  feedLoading: boolean;
  /** The notice whose popup is currently open, if any. */
  notificationPopupNotice: NewsPost | null;
  /** Notice id the popup mechanism currently "claims" (open,
   * pending, or closed in this view) — the Announcement Bar
   * stays silent for this notice so the two never nag together. */
  popupClaimedNoticeId: string | null;
  /** Visitor closed the notification popup without reading:
   * marks it popup-shown (NOT seen — decision D-3) and closes. */
  closeNotificationPopup: () => void;
  /** Visitor chose to read the notice (details): marks it seen
   * (existing noticeSeen path) and popup-shown, and closes. */
  readNotificationPopup: () => void;
  /** Visitor chose "all notices": popup-shown only, closes. */
  browseAllNoticesFromPopup: () => void;
  /** Subscription popup API (used by the future Subscription
   * Popup component; the state machine and memory rules are
   * already enforced here). */
  subscriptionPopupOpen: boolean;
  requestSubscriptionPopup: () => void;
  closeSubscriptionPopup: (byVisitor: boolean) => void;
  /** A subscription form (footer or popup) reports the visitor
   * is actively filling it — no popup may interrupt (C-3). */
  setSubscriptionFormActive: (active: boolean) => void;
}

const NOOP_VALUE: PopupCoordinatorValue = {
  latestNotice: null,
  publishedNoticeIds: [],
  feedLoading: false,
  notificationPopupNotice: null,
  popupClaimedNoticeId: null,
  closeNotificationPopup: () => undefined,
  readNotificationPopup: () => undefined,
  browseAllNoticesFromPopup: () => undefined,
  subscriptionPopupOpen: false,
  requestSubscriptionPopup: () => undefined,
  closeSubscriptionPopup: () => undefined,
  setSubscriptionFormActive: () => undefined,
};

const PopupCoordinatorContext = createContext<PopupCoordinatorValue>(NOOP_VALUE);

/** Safe outside the provider too (standalone form renders, tests):
 * consumers get the no-op value and simply never see a popup. */
export function usePopupCoordinator(): PopupCoordinatorValue {
  return useContext(PopupCoordinatorContext);
}

export default function PopupCoordinatorProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;

  const [latestNotice, setLatestNotice] = useState<NewsPost | null>(null);
  const [publishedNoticeIds, setPublishedNoticeIds] = useState<string[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [seenIds, setSeenIds] = useState<string[]>(() => readSeenIds());
  const [popupShownIds, setPopupShownIds] = useState<string[]>(() => readPopupShownIds());
  const [popupNotice, setPopupNotice] = useState<NewsPost | null>(null);
  const [closedThisViewId, setClosedThisViewId] = useState<string | null>(null);

  const [coord, dispatch] = useReducer(popupCoordinatorReducer, INITIAL_COORDINATOR_STATE);
  const coordRef = useRef(coord);
  coordRef.current = coord;
  const fetchingRef = useRef(false);

  /* ---------------- the one central feed + poller ---------------- */

  const runCycle = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [latest, ids] = await Promise.all([
        fetchLatestPublishedNotice(),
        fetchPublishedNoticeIds(),
      ]);
      setLatestNotice(latest);
      setPublishedNoticeIds(ids);
    } finally {
      fetchingRef.current = false;
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void runCycle();
  }, [runCycle, pathname]);

  useEffect(() => {
    let interval: number | null = null;
    const start = () => {
      if (interval !== null) return;
      interval = window.setInterval(() => {
        void runCycle();
      }, NOTICE_POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void runCycle();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runCycle]);

  /* ---------------- shared seen / shown memories ---------------- */

  useEffect(() => {
    const refreshSeen = () => setSeenIds(readSeenIds());
    const refreshShown = () => setPopupShownIds(readPopupShownIds());
    window.addEventListener(SEEN_CHANGED_EVENT, refreshSeen);
    window.addEventListener(POPUP_SHOWN_CHANGED_EVENT, refreshShown);
    window.addEventListener("storage", refreshSeen);
    window.addEventListener("storage", refreshShown);
    return () => {
      window.removeEventListener(SEEN_CHANGED_EVENT, refreshSeen);
      window.removeEventListener(POPUP_SHOWN_CHANGED_EVENT, refreshShown);
      window.removeEventListener("storage", refreshSeen);
      window.removeEventListener("storage", refreshShown);
    };
  }, []);

  /* ---------------- coordination wiring ---------------- */

  useEffect(() => {
    dispatch({ type: "VIEW_CHANGED", viewKey: pathname });
    setClosedThisViewId(null);
  }, [pathname]);

  // Raise or retire the notification intent from the feed.
  useEffect(() => {
    const current = coordRef.current;
    const trackedId = current.pendingNotificationId ?? current.openNotificationId;

    if (trackedId !== null) {
      const stillLatest = latestNotice?.id === trackedId;
      const nowSeen = isNoticeSeen(trackedId, seenIds);
      if (!stillLatest || nowSeen) {
        dispatch({ type: "NOTIFICATION_GONE", noticeId: trackedId });
        if (current.openNotificationId === trackedId) setPopupNotice(null);
      }
    }

    if (!latestNotice) return;
    if (POPUP_EXCLUDED_PATHS.includes(pathname)) return;
    if (pathname === `/news/${latestNotice.slug}`) return;
    if (isNoticeSeen(latestNotice.id, seenIds)) return;
    if (isPopupShown(latestNotice.id, popupShownIds)) return;
    setPopupNotice(latestNotice);
    dispatch({ type: "NOTIFICATION_INTENT", noticeId: latestNotice.id });
  }, [latestNotice, seenIds, popupShownIds, pathname]);

  /* ---------------- actions ---------------- */

  const finishNotificationPopup = useCallback(
    (markSeen: boolean) => {
      const id = coordRef.current.openNotificationId;
      if (id === null) return;
      if (markSeen) markNoticeSeen(id);
      markPopupShown(id);
      setClosedThisViewId(id);
      setPopupNotice(null);
      dispatch({ type: "CLOSE_NOTIFICATION" });
    },
    [],
  );

  const closeNotificationPopup = useCallback(() => finishNotificationPopup(false), [finishNotificationPopup]);
  const readNotificationPopup = useCallback(() => finishNotificationPopup(true), [finishNotificationPopup]);
  const browseAllNoticesFromPopup = useCallback(() => finishNotificationPopup(false), [finishNotificationPopup]);

  const existenceCheckedRef = useRef(false);

  const requestSubscriptionPopup = useCallback(() => {
    if (POPUP_EXCLUDED_PATHS.includes(pathname)) return;
    const decide = () => {
      const memory = readSubscriptionMemory();
      if (!subscriptionPopupAllowed(memory, Date.now())) {
        dispatch({ type: "SUBSCRIPTION_CANCELLED" });
        return;
      }
      dispatch({ type: "SUBSCRIPTION_INTENT" });
    };
    // Owner's rule (2026-10-27): if the subscription this
    // browser remembers has been DELETED by the Admin, the
    // local verified/submitted memory is stale — ask the
    // server once per page load, clear the memory when the
    // subscription is gone, and only then decide. An
    // unreachable checker (null) changes nothing.
    const memory = readSubscriptionMemory();
    if (memory.subscriberId && !existenceCheckedRef.current) {
      existenceCheckedRef.current = true;
      const id = memory.subscriberId;
      void checkSubscriptionExists(id).then((exists) => {
        if (exists === false) {
          writeSubscriptionMemory({
            verified: false,
            submittedAt: null,
            subscriberId: null,
          });
        }
        decide();
      });
      return;
    }
    decide();
  }, [pathname]);

  const closeSubscriptionPopup = useCallback((byVisitor: boolean) => {
    // The 5-minute gap until the next showing (owner's rule,
    // 2026-11-01 — supersedes the 7-day cooldown) starts when
    // the popup actually leaves the screen through this call —
    // a coordination deferral never reaches it.
    if (byVisitor) markSubscriptionDismissed(Date.now());
    dispatch({ type: "CLOSE_SUBSCRIPTION" });
  }, []);

  const setSubscriptionFormActive = useCallback((active: boolean) => {
    dispatch({ type: "FORM_ACTIVE", active });
  }, []);

  const popupClaimedNoticeId =
    coord.open === "notification"
      ? coord.openNotificationId
      : coord.pendingNotificationId ?? closedThisViewId;

  const value: PopupCoordinatorValue = {
    latestNotice,
    publishedNoticeIds,
    feedLoading,
    notificationPopupNotice: coord.open === "notification" ? popupNotice : null,
    popupClaimedNoticeId,
    closeNotificationPopup,
    readNotificationPopup,
    browseAllNoticesFromPopup,
    subscriptionPopupOpen: coord.open === "subscription",
    requestSubscriptionPopup,
    closeSubscriptionPopup,
    setSubscriptionFormActive,
  };

  return (
    <PopupCoordinatorContext.Provider value={value}>
      {children}
    </PopupCoordinatorContext.Provider>
  );
}
