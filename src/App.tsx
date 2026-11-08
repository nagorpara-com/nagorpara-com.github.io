import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useThemeColors } from "./hooks/useThemeColors";
import { useSeoMeta } from "./hooks/useSeoMeta";
import PublicLayout from "./layouts/PublicLayout";
import AdminLayout from "./layouts/AdminLayout";
import RequireAdmin from "./components/RequireAdmin";
import RequireFinanceRole from "./components/admin/RequireFinanceRole";
import RouteFallback from "./components/RouteFallback";

/**
 * Route code-splitting (2026-11-02 audit fix #5): every PAGE is
 * loaded lazily, so the browser downloads only the open page's
 * code chunk instead of the whole app up front. The layouts,
 * guards and providers stay eager — they are the shell every
 * route needs. While a chunk loads, RouteFallback shows (inside
 * the layouts the shell stays mounted; see PublicLayout /
 * AdminLayout).
 */
const HomePage = lazy(() => import("./pages/public/HomePage"));
const VillageProfilePage = lazy(() => import("./pages/public/VillageProfilePage"));
const FootballPage = lazy(() => import("./pages/public/FootballPage"));
const FootballPlayerPage = lazy(() => import("./pages/public/FootballPlayerPage"));
const CricketPage = lazy(() => import("./pages/public/CricketPage"));
const CricketPlayerPage = lazy(() => import("./pages/public/CricketPlayerPage"));
const MatchesPage = lazy(() => import("./pages/public/MatchesPage"));
const MatchDetailsPage = lazy(() => import("./pages/public/MatchDetailsPage"));
const TournamentsPage = lazy(() => import("./pages/public/TournamentsPage"));
const SportsPage = lazy(() => import("./pages/public/SportsPage"));
const SportTeamsPage = lazy(() => import("./pages/public/SportTeamsPage"));
const TeamPlayersPage = lazy(() => import("./pages/public/TeamPlayersPage"));
const NewsPage = lazy(() => import("./pages/public/NewsPage"));
const NewsDetailsPage = lazy(() => import("./pages/public/NewsDetailsPage"));
const NotificationsPage = lazy(() => import("./pages/public/NotificationsPage"));
const FinancePublicPage = lazy(() => import("./pages/public/FinancePublicPage"));
const MembersPage = lazy(() => import("./pages/public/MembersPage"));
const ContactPage = lazy(() => import("./pages/public/ContactPage"));
const VerifySubscriptionPage = lazy(() => import("./pages/public/VerifySubscriptionPage"));
const UnsubscribePage = lazy(() => import("./pages/public/UnsubscribePage"));
const NotFoundPage = lazy(() => import("./pages/public/NotFoundPage"));

const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminPlayersPage = lazy(() => import("./pages/admin/AdminPlayersPage"));
const AdminPlayerStatsPage = lazy(() => import("./pages/admin/AdminPlayerStatsPage"));
const AdminTeamSettingsPage = lazy(() => import("./pages/admin/AdminTeamSettingsPage"));
const AdminTeamsPage = lazy(() => import("./pages/admin/AdminTeamsPage"));
const AdminMatchesPage = lazy(() => import("./pages/admin/AdminMatchesPage"));
const AdminSportsBannersPage = lazy(() => import("./pages/admin/AdminSportsBannersPage"));
const AdminNewsPage = lazy(() => import("./pages/admin/AdminNewsPage"));
const AdminNotificationsPage = lazy(() => import("./pages/admin/AdminNotificationsPage"));
const AdminFinancePage = lazy(() => import("./pages/admin/AdminFinancePage"));
const AdminMembersPage = lazy(() => import("./pages/admin/AdminMembersPage"));
const AdminCommitteePage = lazy(() => import("./pages/admin/AdminCommitteePage"));
const AdminMembersBannersPage = lazy(() => import("./pages/admin/AdminMembersBannersPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminAuditLogPage = lazy(() => import("./pages/admin/AdminAuditLogPage"));
const AdminMessagesPage = lazy(() => import("./pages/admin/AdminMessagesPage"));
const AdminSubscribersPage = lazy(() => import("./pages/admin/AdminSubscribersPage"));
const AdminWelcomeEmailPage = lazy(() => import("./pages/admin/AdminWelcomeEmailPage"));
const AdminHomeContentPage = lazy(() => import("./pages/admin/AdminHomeContentPage"));
const AdminHomeBannersPage = lazy(() => import("./pages/admin/AdminHomeBannersPage"));
const AdminHeaderFooterPage = lazy(() => import("./pages/admin/AdminHeaderFooterPage"));
const AdminPagesSectionsPage = lazy(() => import("./pages/admin/AdminPagesSectionsPage"));
const AdminSeoPage = lazy(() => import("./pages/admin/AdminSeoPage"));
const AdminVillagePage = lazy(() => import("./pages/admin/AdminVillagePage"));
const AdminVillageLocationPage = lazy(() => import("./pages/admin/AdminVillageLocationPage"));
const AdminImportantPlacesPage = lazy(() => import("./pages/admin/AdminImportantPlacesPage"));
const AdminVillagePhotosPage = lazy(() => import("./pages/admin/AdminVillagePhotosPage"));
const AdminVillageCategoriesPage = lazy(() => import("./pages/admin/AdminVillageCategoriesPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));

/**
 * Routing strategy — GitHub Pages (decided in Phase 2, per the Phase 1
 * condition): HashRouter.
 *
 * GitHub Pages is a static host with no SPA fallback. With BrowserRouter,
 * opening or refreshing a shared link like /football would return 404.
 * With HashRouter the route lives after "#" (e.g. /#/football), the
 * server only ever serves index.html, and every page can be opened
 * directly, refreshed and shared without a 404.
 *
 * Public Website and Admin Panel live in this ONE React app.
 */
/** Applies the admin-chosen theme colors (Website Settings,
 *  migration 0037) to the whole app on load. Renders nothing. */
function ThemeApplier() {
  useThemeColors();
  return null;
}

/** Applies the admin-saved SEO ও মেটা values (migration 0039)
 *  to the document head on load. Renders nothing. */
function SeoApplier() {
  useSeoMeta();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeApplier />
      <SeoApplier />
      <HashRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* ---------- Public Website ---------- */}
            <Route element={<PublicLayout />}>
              <Route index element={<HomePage />} />
              <Route path="village-profile" element={<VillageProfilePage />} />
              <Route path="history" element={<Navigate to="/village-profile" replace />} />
              <Route path="football" element={<FootballPage />} />
              <Route path="football/player/:id" element={<FootballPlayerPage />} />
              <Route path="cricket" element={<CricketPage />} />
              <Route path="cricket/player/:id" element={<CricketPlayerPage />} />
              <Route path="matches" element={<MatchesPage />} />
              <Route path="matches/:id" element={<MatchDetailsPage />} />
              <Route path="tournaments" element={<TournamentsPage />} />
              <Route path="sports" element={<SportsPage />} />
              <Route path="teams/:sport" element={<SportTeamsPage />} />
              <Route path="teams/:sport/:teamId" element={<TeamPlayersPage />} />
              <Route path="news" element={<NewsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="news/:slug" element={<NewsDetailsPage />} />
              <Route path="finance" element={<FinancePublicPage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="committee" element={<Navigate to="/members" replace />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="verify-subscription" element={<VerifySubscriptionPage />} />
              <Route path="unsubscribe" element={<UnsubscribePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* ---------- Admin Panel ---------- */}
            <Route path="admin/login" element={<AdminLoginPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="players" element={<AdminPlayersPage />} />
                <Route path="player-stats" element={<AdminPlayerStatsPage />} />
                <Route path="team-settings" element={<AdminTeamSettingsPage />} />
                <Route path="teams" element={<AdminTeamsPage />} />
                <Route path="matches" element={<AdminMatchesPage />} />
                <Route path="tournaments" element={<AdminMatchesPage section="tournaments" />} />
                <Route path="winner-declaration" element={<AdminMatchesPage section="declare" />} />
                <Route path="sports-banners" element={<AdminSportsBannersPage />} />
                <Route path="news" element={<AdminNewsPage />} />
                <Route path="notifications" element={<AdminNotificationsPage />} />
                <Route element={<RequireFinanceRole />}>
                  <Route path="finance" element={<AdminFinancePage />} />
                </Route>
                <Route path="members" element={<AdminMembersPage />} />
                <Route path="committee" element={<AdminCommitteePage />} />
                <Route path="members-banners" element={<AdminMembersBannersPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="messages" element={<AdminMessagesPage />} />
                <Route path="subscribers" element={<AdminSubscribersPage />} />
                <Route path="welcome-email" element={<AdminWelcomeEmailPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="content/home" element={<AdminHomeContentPage />} />
                <Route path="content/home-banners" element={<AdminHomeBannersPage />} />
                <Route path="content/header-footer" element={<AdminHeaderFooterPage />} />
                <Route path="content/pages" element={<AdminPagesSectionsPage />} />
                <Route path="content/seo" element={<AdminSeoPage />} />
                <Route path="village" element={<AdminVillagePage />} />
                <Route path="village/location" element={<AdminVillageLocationPage />} />
                <Route path="village/places" element={<AdminImportantPlacesPage />} />
                <Route path="village/photos" element={<AdminVillagePhotosPage />} />
                <Route path="village/categories" element={<AdminVillageCategoriesPage />} />
                <Route path="audit-log" element={<AdminAuditLogPage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  );
}
