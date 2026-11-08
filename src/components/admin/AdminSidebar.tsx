import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ADMIN_NAVIGATION, type AdminNavChild, type AdminNavItem } from "../../config/adminNavigation";
import { useAuth } from "../../context/AuthContext";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import Icon from "./icons";

/**
 * Admin navigation list — shared by the desktop sidebar and the
 * mobile drawer so both always show the same structure.
 *
 * Items come from src/config/adminNavigation.ts. Role metadata only
 * controls DISPLAY (a finance manager does not need content menus);
 * it is not security — RequireAdmin and database RLS enforce access.
 * Children without a route are future modules: they render as
 * clearly marked "আসছে" items, never as working links. A child
 * with its own children (e.g. ফুটবল under ক্রীড়া প্রতিযোগিতা,
 * 2026-10-26) renders as a nested expandable sub-group.
 */
export function AdminNavList({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { profile } = useAuth();

  const isChildActive = (childRoute?: string, childSearch?: string) => {
    if (!childRoute) return false;
    if (location.pathname !== childRoute) return false;
    if (childSearch) return location.search === childSearch;
    return true;
  };

  const subtreeHasActive = (child: AdminNavChild): boolean =>
    child.children
      ? child.children.some(subtreeHasActive)
      : isChildActive(child.route, child.search);

  const groupHasActive = (item: AdminNavItem) =>
    item.children?.some(subtreeHasActive) ?? false;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isOpen = (key: string, hasActive: boolean) => openGroups[key] ?? hasActive;
  const toggle = (key: string, hasActive: boolean) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !isOpen(key, hasActive) }));

  const visibleItems = ADMIN_NAVIGATION.filter(
    (item) => !item.roles || !profile?.role || item.roles.includes(profile.role),
  );

  const renderChildren = (children: AdminNavChild[], parentKey: string, depth: number) => (
    <ul className="mb-1 ml-5 flex flex-col gap-0.5 border-l border-white/15 pl-3">
      {children.map((child) => {
        if (child.children) {
          const key = `${parentKey}>${child.label}`;
          const hasActive = subtreeHasActive(child);
          const open = isOpen(key, hasActive);
          return (
            <li key={child.label}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(key, hasActive)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  hasActive ? "text-gold" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex-1 text-left">{child.label}</span>
                <Icon
                  name="chevron"
                  className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                />
              </button>
              {open && renderChildren(child.children, key, depth + 1)}
            </li>
          );
        }
        return child.route ? (
          <li key={child.label}>
            <NavLink
              to={child.search ? `${child.route}${child.search}` : child.route}
              onClick={onNavigate}
              className={() =>
                `block rounded-md px-2.5 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  isChildActive(child.route, child.search)
                    ? "bg-brand font-semibold text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {child.label}
            </NavLink>
          </li>
        ) : (
          <li key={child.label}>
            <span
              aria-disabled="true"
              className="flex cursor-not-allowed items-center justify-between rounded-md px-2.5 py-2 text-white/45"
            >
              {child.label}
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold/80">
                আসছে
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 px-3 pb-6 text-sm">
      {visibleItems.map((item) => {
        if (item.route) {
          return (
            <NavLink
              key={item.label}
              to={item.route}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  isActive ? "bg-brand text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              {item.label}
            </NavLink>
          );
        }

        const hasActive = groupHasActive(item);
        const open = isOpen(item.label, hasActive);
        return (
          <div key={item.label}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(item.label, hasActive)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                hasActive ? "text-gold" : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              <Icon
                name="chevron"
                className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
              />
            </button>
            {open && item.children && renderChildren(item.children, item.label, 1)}
          </div>
        );
      })}
    </nav>
  );
}

/** Sidebar brand block: the organization's REAL logo and name. */
export function AdminBrand() {
  const settings = useSiteSettings();
  return (
    <Link to="/admin" className="flex items-center gap-3 px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold">
      <img
        src={settings.logoPath}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full bg-white object-contain p-0.5"
      />
      <span className="min-w-0">
        {/* v180 D3: the organization's own name was cut off with an
            ellipsis on both lines — let it wrap in the same slot
            (sidebar width unchanged). */}
        <span className="block text-sm font-bold leading-snug text-white">{settings.nameBn}</span>
        <span className="block text-[11px] text-white/65">{settings.nameEn}</span>
      </span>
    </Link>
  );
}

/** Desktop sidebar (hidden on mobile — the drawer covers mobile). */
export default function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto bg-brand-dark md:block">
      <AdminBrand />
      <AdminNavList />
    </aside>
  );
}
