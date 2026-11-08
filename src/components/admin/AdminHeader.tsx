import { Link, useNavigate } from "react-router-dom";
import { ROLE_LABELS } from "../../config/adminNavigation";
import { useAuth } from "../../context/AuthContext";
import Icon from "./icons";

/**
 * Admin top bar: mobile menu button, "সাইট দেখুন" link to the public
 * site, the signed-in profile (from the real AuthContext) and logout.
 *
 * There is deliberately NO notification bell: no notification system
 * exists yet, and a fake count must never be displayed. No name,
 * email or date is hardcoded here.
 */
export default function AdminHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="মেনু খুলুন"
        className="rounded-lg p-2 text-neutral-700 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
      >
        <Icon name="menu" className="h-6 w-6" />
      </button>

      <span className="hidden text-sm font-semibold text-brand-dark sm:block">Admin Panel</span>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name="external" className="h-4 w-4" />
          সাইট দেখুন
        </Link>

        {profile && (
          <span className="hidden text-right leading-tight lg:block">
            <span className="block text-sm font-semibold text-neutral-800">{profile.full_name}</span>
            <span className="block text-xs text-neutral-500">{ROLE_LABELS[profile.role]}</span>
          </span>
        )}

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon name="logout" className="h-4 w-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
