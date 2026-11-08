import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Route guard for everything under /admin (except the login page).
 * - Supabase not configured yet -> send to login, which explains the state.
 * - Not logged in -> login.
 * - Logged in but the profile is inactive -> login.
 * Fine-grained per-role checks (finance_manager, editor, ...) are added
 * with the Admin phases; RLS in the database is the real enforcement.
 */
export default function RequireAdmin() {
  const { isConfigured, loading, user, profile } = useAuth();

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-neutral-500">Loading…</p>
    );
  }

  if (!isConfigured || !user || (profile && !profile.is_active)) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
