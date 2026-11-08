import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import RouteFallback from "../components/RouteFallback";
import AdminBreadcrumbs from "../components/admin/AdminBreadcrumbs";
import AdminHeader from "../components/admin/AdminHeader";
import AdminMobileMenu from "../components/admin/AdminMobileMenu";
import AdminSidebar from "../components/admin/AdminSidebar";

/**
 * Admin panel shell: dark-green sidebar (desktop) / slide-in drawer
 * (mobile), top header with profile + logout, and route breadcrumbs.
 * Navigation structure comes from src/config/adminNavigation.ts.
 * Access control is unchanged: RequireAdmin guards every route under
 * this layout and database RLS enforces permissions.
 */
export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <AdminSidebar />
      <AdminMobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader onMenuClick={() => setMobileOpen(true)} />
        <AdminBreadcrumbs />
        <main className="flex-1 p-4 sm:p-6">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
