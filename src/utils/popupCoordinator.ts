/**
 * Popup Coordinator — the pure state machine behind the shared
 * modal coordination (Coordination Plan §৪, decisions D-3–D-5).
 *
 * Rules encoded here, and nowhere else:
 *  C-1  At most ONE modal is open at any moment.
 *  C-2  The subscription popup has priority over the
 *       notification popup when a display slot is granted
 *       (owner's rule, 2026-10-27: Subscribe Popup first; the
 *       Notification Popup comes after it — this REPLACED the
 *       original notification-first order of 2026-10-25).
 *  C-3  An open modal is NEVER preempted — a waiting intent
 *       stays pending. A visitor filling the subscription form
 *       (`formActive`) blocks every grant until they finish.
 *  C-4  After a popup closes, the next one may not be forced
 *       into the same page view: grants resume only after the
 *       view (route) changes.
 *  C-5  Coordination deferral is not a visitor close — this
 *       machine never writes the subscription cooldown; that
 *       happens only on an explicit visitor close, handled by
 *       the caller through `popupState`.
 *
 * This module is pure (no React, no storage) so every transition
 * is unit-testable; the React provider wires real events
 * (feed updates, route changes, seen events) to these actions.
 */

export type OpenModal = "none" | "notification" | "subscription";

export interface CoordinatorState {
  open: OpenModal;
  /** Notice id whose popup is open (when open === "notification"). */
  openNotificationId: string | null;
  /** Notice id waiting for a display slot. */
  pendingNotificationId: string | null;
  /** Subscription popup waiting for a display slot. */
  pendingSubscription: boolean;
  /** Visitor is actively filling a subscription form. */
  formActive: boolean;
  /** Current route key (pathname). */
  viewKey: string;
  /** Route key where the last popup closed (C-4), or null. */
  lastClosedViewKey: string | null;
}

export const INITIAL_COORDINATOR_STATE: CoordinatorState = {
  open: "none",
  openNotificationId: null,
  pendingNotificationId: null,
  pendingSubscription: false,
  formActive: false,
  viewKey: "",
  lastClosedViewKey: null,
};

export type CoordinatorAction =
  | { type: "VIEW_CHANGED"; viewKey: string }
  | { type: "NOTIFICATION_INTENT"; noticeId: string }
  | { type: "NOTIFICATION_GONE"; noticeId: string }
  | { type: "SUBSCRIPTION_INTENT" }
  | { type: "SUBSCRIPTION_CANCELLED" }
  | { type: "FORM_ACTIVE"; active: boolean }
  | { type: "CLOSE_NOTIFICATION" }
  | { type: "CLOSE_SUBSCRIPTION" };

/**
 * Grants a display slot if the rules allow it. Priority:
 * subscription before notification (C-2). Blocked while any
 * modal is open (C-1/C-3), while the visitor is filling a form
 * (C-3), and in the view where the last popup closed (C-4).
 */
function tryGrant(state: CoordinatorState): CoordinatorState {
  if (state.open !== "none") return state;
  if (state.formActive) return state;
  if (state.lastClosedViewKey !== null && state.lastClosedViewKey === state.viewKey) {
    return state;
  }
  if (state.pendingSubscription) {
    return { ...state, open: "subscription", pendingSubscription: false };
  }
  if (state.pendingNotificationId !== null) {
    return {
      ...state,
      open: "notification",
      openNotificationId: state.pendingNotificationId,
      pendingNotificationId: null,
    };
  }
  return state;
}

export function popupCoordinatorReducer(
  state: CoordinatorState,
  action: CoordinatorAction,
): CoordinatorState {
  switch (action.type) {
    case "VIEW_CHANGED": {
      if (action.viewKey === state.viewKey) return state;
      return tryGrant({ ...state, viewKey: action.viewKey });
    }
    case "NOTIFICATION_INTENT": {
      // The same notice already open: nothing to do. A different
      // notice replaces a merely-pending one (only the LATEST
      // published notice ever gets a popup).
      if (state.open === "notification" && state.openNotificationId === action.noticeId) {
        return state;
      }
      if (state.pendingNotificationId === action.noticeId && state.open !== "notification") {
        return tryGrant(state);
      }
      return tryGrant({ ...state, pendingNotificationId: action.noticeId });
    }
    case "NOTIFICATION_GONE": {
      // The notice was seen elsewhere, unpublished or deleted:
      // its pending intent dies, and its open popup closes.
      let next = state;
      if (next.pendingNotificationId === action.noticeId) {
        next = { ...next, pendingNotificationId: null };
      }
      if (next.open === "notification" && next.openNotificationId === action.noticeId) {
        next = {
          ...next,
          open: "none",
          openNotificationId: null,
          lastClosedViewKey: next.viewKey,
        };
      }
      return next;
    }
    case "SUBSCRIPTION_INTENT": {
      if (state.open === "subscription" || state.pendingSubscription) {
        return tryGrant(state);
      }
      return tryGrant({ ...state, pendingSubscription: true });
    }
    case "SUBSCRIPTION_CANCELLED": {
      return { ...state, pendingSubscription: false };
    }
    case "FORM_ACTIVE": {
      if (action.active === state.formActive) return state;
      // Releasing the form re-evaluates waiting intents (C-3).
      return tryGrant({ ...state, formActive: action.active });
    }
    case "CLOSE_NOTIFICATION": {
      if (state.open !== "notification") return state;
      return {
        ...state,
        open: "none",
        openNotificationId: null,
        lastClosedViewKey: state.viewKey,
      };
    }
    case "CLOSE_SUBSCRIPTION": {
      if (state.open !== "subscription") return state;
      return {
        ...state,
        open: "none",
        lastClosedViewKey: state.viewKey,
      };
    }
    default:
      return state;
  }
}
