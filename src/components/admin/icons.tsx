import type { ReactNode } from "react";
import type { AdminIconName } from "../../config/adminNavigation";

/**
 * Admin icon set — small inline SVGs drawn for this project.
 * No icon library is installed in this project, and the shell needs
 * only this fixed set, so the icons live here as stroke drawings
 * (24×24, currentColor) instead of adding a dependency.
 */
const PATHS: Record<AdminIconName | "chevron" | "menu" | "close" | "external" | "logout", ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  content: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M6.5 6.5h.01M9.5 6.5h.01" />
    </>
  ),
  village: (
    <>
      <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </>
  ),
  football: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8l2.6 1.9-1 3h-3.2l-1-3z" />
      <path d="M12 3v5M19.8 9.4l-5.2.5M17.6 18.6l-4-2.7M6.4 18.6l4-2.7M4.2 9.4l5.2.5" />
    </>
  ),
  cricket: (
    <>
      <path d="M14.5 3.5l6 6L12 18a2.12 2.12 0 0 1-3-3z" />
      <circle cx="5.5" cy="18.5" r="2.3" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v4.5a4 4 0 0 1-8 0z" />
      <path d="M8 5.5H4.5a3.5 3.5 0 0 0 3.6 3.5M16 5.5h3.5a3.5 3.5 0 0 1-3.6 3.5" />
      <path d="M12 12.5V16M8.5 20h7M10 20c0-1.8.8-3 2-4 1.2 1 2 2.2 2 4" />
    </>
  ),
  news: (
    <>
      <path d="M4 5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1z" />
      <path d="M18 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2" />
      <path d="M7 9h7M7 13h7M7 17h4" />
    </>
  ),
  gallery: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18l5-5 3 3 3-3 5 5" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M16.2 14.7c2.2.3 3.7 1.7 4.2 4.3" />
    </>
  ),
  finance: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 9.5h.01M17.5 14.5h.01" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  users: (
    <>
      <path d="M12 3l7 2.5V11c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V5.5z" />
      <path d="M9.3 11.6l2 2 3.6-4.2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h10M20 17h-2" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  audit: (
    <>
      <rect x="6" y="4.5" width="12" height="17" rx="2" />
      <path d="M9.5 4.5V3h5v1.5" />
      <path d="M9.5 11h5M9.5 15h3.5" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9.5 9.5" />
      <path d="M19 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H11" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
      <path d="M10 12h10" />
      <path d="M16.5 8l4 4-4 4" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
