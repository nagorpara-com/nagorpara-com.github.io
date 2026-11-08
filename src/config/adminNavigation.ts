import type { UserRole } from "../types/database.types";

/**
 * Central Admin Navigation configuration — the single source for the
 * Admin sidebar, mobile menu and breadcrumbs.
 *
 * Rules (per the owner's architecture audit):
 * - Labels are Bengali; icons are named keys resolved by
 *   components/admin/icons.tsx (no icon dependency is used).
 * - `route` is set ONLY where a real route already exists. Groups
 *   whose admin pages do not exist yet keep their structure here with
 *   route-less children, which the sidebar renders as clearly marked
 *   "আসছে" (coming) items — never as fake working links, and no
 *   duplicate routes are created for them.
 * - `roles` is DISPLAY metadata only (which roles normally see the
 *   item). Hiding a menu is never security: the route guard
 *   (RequireAdmin) and database RLS remain the enforcement, exactly
 *   as before.
 */
export type AdminIconName =
  | "dashboard"
  | "content"
  | "village"
  | "football"
  | "cricket"
  | "trophy"
  | "news"
  | "gallery"
  | "members"
  | "finance"
  | "mail"
  | "users"
  | "settings"
  | "audit";

export interface AdminNavChild {
  label: string;
  /** Existing route; omit while the page does not exist yet. */
  route?: string;
  /** Query string appended to the route (e.g. "?sport=cricket"). */
  search?: string;
  /** Sub-group (e.g. ফুটবল under ক্রীড়া প্রতিযোগিতা): a child
   * with its own children renders as a nested expandable section
   * instead of a link. Added 2026-10-26 for the sports grouping. */
  children?: AdminNavChild[];
}

export interface AdminNavItem {
  label: string;
  icon: AdminIconName;
  /** Direct route for single-item entries (e.g. Dashboard). */
  route?: string;
  children?: AdminNavChild[];
  /** Display metadata — see the rules above. Omit = all panel roles. */
  roles?: UserRole[];
  order: number;
}

const CONTENT_ROLES: UserRole[] = ["admin", "editor"];
const ADMIN_ROLES: UserRole[] = ["admin"];

export const ADMIN_NAVIGATION: AdminNavItem[] = [
  { label: "ড্যাশবোর্ড", icon: "dashboard", route: "/admin", order: 1 },
  {
    label: "ওয়েবসাইট কনটেন্ট",
    icon: "content",
    order: 2,
    roles: CONTENT_ROLES,
    children: [
      { label: "হোমপেজ পরিচালনা", route: "/admin/content/home" },
      { label: "হোমপেজ ব্যানার", route: "/admin/content/home-banners" },
      { label: "হেডার ও ফুটার", route: "/admin/content/header-footer" },
      { label: "পেজ ও সেকশন", route: "/admin/content/pages" },
      { label: "SEO ও মেটা", route: "/admin/content/seo" },
    ],
  },
  {
    label: "গ্রামের পরিচিতি",
    icon: "village",
    order: 3,
    roles: CONTENT_ROLES,
    children: [
      { label: "গ্রামের পরিচিতি ও ইতিহাস", route: "/admin/village" },
      { label: "অবস্থান ও ঠিকানা", route: "/admin/village/location" },
      { label: "গুরুত্বপূর্ণ স্থান", route: "/admin/village/places" },
      { label: "গ্রামের ছবি", route: "/admin/village/photos" },
      { label: "ক্যাটাগরি পরিচালনা", route: "/admin/village/categories" },
    ],
  },
  {
    // Owner's restructure, 2026-10-26: football, cricket and
    // matches/tournaments no longer sit as three separate top
    // menus — they live under ONE sports group whose first level
    // is exactly ফুটবল / ক্রিকেট / টুর্নামেন্ট. All routes are
    // unchanged; only the menu structure moved.
    label: "ক্রীড়া প্রতিযোগিতা",
    icon: "trophy",
    order: 4,
    roles: CONTENT_ROLES,
    children: [
      // Owner's FINAL sidebar layout, 2026-11-02 ("এটা একদম
      // ফাইনাল"): ফুটবল first, ক্রিকেট second, and the "ম্যাচ ও
      // টুর্নামেন্ট" group LAST — টুর্নামেন্ট and ম্যাচ are two
      // SEPARATE pages since the owner's 2026-11-03 split order
      // (/admin/tournaments and /admin/matches), and টিম-নিবন্ধন
      // sits inside this group. Each
      // sport group carries its own players entry with its
      // ?sport= link. The ব্যানার leaf was added FIRST by the
      // owner's order of 2026-11-03 (the two /sports page
      // banners are managed there); the three blocks below keep
      // their final order.
      { label: "ক্রীড়া প্রতিযোগিতা ব্যানার", route: "/admin/sports-banners" },
      {
        label: "ফুটবল",
        children: [
          { label: "প্লেয়ার", route: "/admin/players", search: "?sport=football" },
          { label: "পরিসংখ্যান ও প্রকাশ", route: "/admin/player-stats", search: "?sport=football" },
          { label: "টিম সেটিংস", route: "/admin/team-settings", search: "?sport=football" },
        ],
      },
      {
        label: "ক্রিকেট",
        children: [
          { label: "প্লেয়ার", route: "/admin/players", search: "?sport=cricket" },
          { label: "পরিসংখ্যান ও প্রকাশ", route: "/admin/player-stats", search: "?sport=cricket" },
          { label: "টিম সেটিংস", route: "/admin/team-settings", search: "?sport=cricket" },
        ],
      },
      {
        label: "ম্যাচ ও টুর্নামেন্ট",
        children: [
          { label: "টুর্নামেন্ট", route: "/admin/tournaments" },
          { label: "ম্যাচ", route: "/admin/matches" },
          { label: "টিম-নিবন্ধন", route: "/admin/teams" },
          { label: "বিজয়ী দল ঘোষণা", route: "/admin/winner-declaration" },
        ],
      },
    ],
  },
  {
    label: "নোটিফিকেশন ও বিজ্ঞপ্তি",
    icon: "news",
    order: 5,
    roles: CONTENT_ROLES,
    children: [
      { label: "নোটিফিকেশন", route: "/admin/notifications" },
      { label: "খবর ও বিজ্ঞপ্তি", route: "/admin/news" },
      { label: "ইমেইল গ্রাহক", route: "/admin/subscribers" },
      { label: "Welcome ইমেইল", route: "/admin/welcome-email" },
    ],
  },
  {
    label: "সদস্য ও কমিটি",
    icon: "members",
    order: 7,
    roles: CONTENT_ROLES,
    children: [
      { label: "সদস্য", route: "/admin/members" },
      { label: "কমিটি", route: "/admin/committee" },
      { label: "ব্যানার", route: "/admin/members-banners" },
    ],
  },
  {
    label: "আর্থিক ব্যবস্থাপনা",
    icon: "finance",
    order: 8,
    roles: ["admin", "finance_manager"],
    children: [{ label: "আর্থিক ব্যবস্থাপনা", route: "/admin/finance" }],
  },
  {
    label: "যোগাযোগ বার্তা",
    icon: "mail",
    order: 9,
    // Admin-only in the database (is_admin() policies on
    // contact_messages), so the menu is shown to Admin only too.
    roles: ADMIN_ROLES,
    children: [{ label: "সব বার্তা", route: "/admin/messages" }],
  },
  {
    label: "ব্যবহারকারী ও অনুমতি",
    icon: "users",
    order: 10,
    roles: ADMIN_ROLES,
    children: [{ label: "ব্যবহারকারী ও ভূমিকা", route: "/admin/users" }],
  },
  {
    label: "ওয়েবসাইট সেটিংস",
    icon: "settings",
    order: 11,
    roles: ADMIN_ROLES,
    children: [{ label: "সাধারণ সেটিংস", route: "/admin/settings" }],
  },
  {
    label: "নিরীক্ষা লগ",
    icon: "audit",
    order: 12,
    roles: ADMIN_ROLES,
    children: [{ label: "কার্যক্রমের ইতিহাস", route: "/admin/audit-log" }],
  },
];

/** Bengali labels for roles, used in the admin header. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  finance_manager: "Finance Manager",
  editor: "Editor",
  viewer: "Viewer",
};
