import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import RouteFallback from "../components/RouteFallback";
import Header from "../components/Header";
import AnnouncementBar from "../components/AnnouncementBar";
import NotificationPopup from "../components/NotificationPopup";
import SubscriptionPopup from "../components/SubscriptionPopup";
import PopupCoordinatorProvider from "../context/PopupCoordinatorContext";
import Footer from "../components/Footer";

/**
 * Public site shell — Phase 3.
 * Header (logo, navigation, mobile menu, login) and Footer (organization
 * info + page links) are separate components so later phases and the
 * Admin-managed site settings can evolve them independently.
 * Page content itself is still built phase by phase.
 *
 * Phase 5C: the whole shell sits inside the Popup Coordinator —
 * it owns the shared notice feed (one central poller for the
 * Header bell, the Announcement Bar and the Notification Popup)
 * and the one-modal-at-a-time coordination between popups.
 */
export default function PublicLayout() {
  return (
    <PopupCoordinatorProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <AnnouncementBar />
        <main className="flex-1">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
        <Footer />
        <NotificationPopup />
        <SubscriptionPopup />
      </div>
    </PopupCoordinatorProvider>
  );
}
