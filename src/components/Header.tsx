import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSiteSettings } from "../hooks/useSiteSettings";
import NotificationBell from "./NotificationBell";

/**
 * Public header — built in Phase 3 from the organization's Reference
 * Images (see docs/REFERENCE_ANALYSIS.md):
 * white bar, circular logo + organization name, and a nav row below
 * with the active item as a green pill. On mobile/tablet the nav
 * collapses behind a menu button and expands as a vertical panel; it
 * closes automatically on navigation.
 * Owner decision 2026-10-23: NO link or button to the Admin Panel
 * anywhere on the public site (header, mobile menu, footer) — the
 * admin login page is reachable only by its direct address.
 * The notification bell beside the menu button (C3 Step A) is a
 * PUBLIC feature linking to /notifications — not an admin entry.
 *
 * Menu restructure (owner, 2026-10-26): ফুটবল, ক্রিকেট and
 * ম্যাচ/টুর্নামেন্ট no longer sit as separate top-level items.
 * They live under ONE "ক্রীড়া প্রতিযোগিতা" group whose first
 * level is exactly ফুটবল / ক্রিকেট / টুর্নামেন্ট — the same
 * structure as the Admin sidebar. টুর্নামেন্ট expands to the two
 * existing pages ম্যাচ and টুর্নামেন্ট. The owner CONFIRMED this
 * exact structure by sending back a screenshot of it the same
 * day ("ঠিক এরকম হবে") after a stricter variant (ম্যাচ removed
 * from the menu) was tried — this screenshot version is the
 * settled one; do not "strictify" it again without his word.
 *
 * Dropdown REMOVED (owner's order, 2026-11-03, supersedes the
 * group above AND the 2026-11-02 hover behaviour): the header
 * has NO dropdown at all — "ক্রীড়া প্রতিযোগিতা" is a plain
 * link to the single sports page /sports, on desktop and in
 * the mobile drawer alike. The /football, /cricket,
 * /tournaments and /matches pages themselves are unchanged.
 *
 * Single-row header (owner decision 2026-10-27, from his design
 * spec sheet): the WHOLE header bar is exactly 72px tall with the
 * menu in the same row as the logo and the bell (24px icon) at the
 * right end — there is no separate nav row any more. Below the xl
 * breakpoint the English name line hides and the pills tighten so
 * the row never wraps; below lg the menu collapses behind the
 * hamburger as before.
 */
export interface NavLeaf {
  to: string;
  label: string;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  children: (NavLeaf | NavGroup)[];
}

export type NavEntry = NavLeaf | NavGroup;

export const NAV_ITEMS: NavEntry[] = [
  { to: "/", label: "হোম", end: true },
  { to: "/village-profile", label: "গ্রাম পরিচিতি" },
  { to: "/sports", label: "ক্রীড়া প্রতিযোগিতা" },
  { to: "/news", label: "কার্যক্রম" },
  { to: "/finance", label: "আর্থিক সারসংক্ষেপ" },
  { to: "/members", label: "সদস্য ও কমিটি" },
  { to: "/contact", label: "যোগাযোগ" },
];

const isGroup = (entry: NavEntry): entry is NavGroup => "children" in entry;

function leavesOf(entry: NavEntry): NavLeaf[] {
  return isGroup(entry) ? entry.children.flatMap(leavesOf) : [entry];
}

/** Every leaf link in menu order — the footer renders this flat list. */
export const NAV_LEAVES: NavLeaf[] = NAV_ITEMS.flatMap(leavesOf);

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? "whitespace-nowrap rounded-full bg-brand px-2 py-1.5 font-semibold text-white xl:px-3.5"
    : "whitespace-nowrap rounded-full px-2 py-1.5 text-neutral-700 transition-colors hover:bg-brand-light hover:text-brand-dark xl:px-3.5";
}

export default function Header() {
  const settings = useSiteSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // The sports entry also lights up on the sport sub-pages,
  // which are reached from the /sports page and the homepage.
  const sportsPathActive = ["/sports", "/football", "/cricket", "/tournaments", "/matches"].some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
  );

  const renderDesktopEntry = (entry: NavEntry) => {
    if (isGroup(entry)) return null; // no groups remain in NAV_ITEMS
    const leaf = entry;
    return (
      <NavLink
        key={leaf.to}
        to={leaf.to}
        end={leaf.end ?? false}
        className={({ isActive }) =>
          navLinkClass({ isActive: isActive || (leaf.to === "/sports" && sportsPathActive) })
        }
      >
        {leaf.label}
      </NavLink>
    );
  };

  const renderMobileEntry = (entry: NavEntry) => {
    if (isGroup(entry)) return null; // no groups remain in NAV_ITEMS
    const leaf = entry;
    return (
      <NavLink
        key={leaf.to}
        to={leaf.to}
        end={leaf.end ?? false}
        className={({ isActive }) =>
          isActive || (leaf.to === "/sports" && sportsPathActive)
            ? "rounded-lg bg-brand px-3.5 py-2.5 font-semibold text-white"
            : "rounded-lg px-3.5 py-2.5 text-neutral-700 hover:bg-brand-light"
        }
      >
        {leaf.label}
      </NavLink>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center gap-2 px-4 xl:gap-3">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5 lg:flex-none xl:gap-3">
            <img
              src={settings.logoPath}
              alt={settings.nameBn}
              className="h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12"
            />
            <span className="min-w-0">
              <span className="block truncate text-base font-bold leading-tight text-brand-dark sm:text-lg">
                {settings.nameBn}
              </span>
              {settings.tagline && (
                <span className="block truncate text-xs leading-tight text-neutral-500">
                  {settings.tagline}
                </span>
              )}
            </span>
          </Link>

        {/* Desktop nav — in the SAME single row (owner decision
            2026-10-27: the whole header is 72px, menu included). */}
        <nav aria-label="প্রধান মেনু" className="ml-5 hidden min-w-0 flex-1 items-center justify-center gap-0.5 text-[13px] lg:flex xl:ml-8 xl:gap-1 xl:text-sm">
          {NAV_ITEMS.map(renderDesktopEntry)}
        </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
            {/* Notification bell — restored to the header
                (owner's order, 2026-11-04; it had been removed
                on 2026-11-02). It sits beside the menu button
                exactly as before; /notifications page and the
                notice popups are unchanged. */}
            <NotificationBell />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "মেনু বন্ধ করুন" : "মেনু খুলুন"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-dark hover:bg-brand-light lg:hidden"
            >
              {menuOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
      </div>

      {/* Mobile / tablet expandable nav */}
      {menuOpen && (
        <nav id="mobile-nav" aria-label="মোবাইল মেনু" className="border-t border-neutral-100 bg-white lg:hidden">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-3 text-sm">
            {NAV_ITEMS.map(renderMobileEntry)}
          </div>
        </nav>
      )}
    </header>
  );
}
