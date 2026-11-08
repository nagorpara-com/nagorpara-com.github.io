import { Link } from "react-router-dom";

/**
 * Quick-access cards under the hero — four real route links.
 *
 * Icon design (owner's choice, 2026-10-30 — "সেট গ"): soft
 * green rounded-square tiles with deep-green line icons, one
 * colour family (the site's green) for all four cards,
 * replacing the earlier four mismatched circle colours
 * (green / red / blue / gold). Labels per the owner's word the
 * same day: no "টিম" — just ফুটবল / ক্রিকেট.
 */
const ITEMS = [
  {
    to: "/football",
    label: "ফুটবল",
    desc: "প্লেয়ার ও পরিসংখ্যান",
    icon: (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="24" cy="24" r="15" />
        <polygon points="24,18.2 29.6,22.2 27.4,28.8 20.6,28.8 18.4,22.2" fill="currentColor" stroke="none" />
        <path d="M24 18.2 V9.5 M29.6 22.2 L38 19.4 M27.4 28.8 L32.2 35.6 M20.6 28.8 L15.8 35.6 M18.4 22.2 L10 19.4" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    to: "/cricket",
    label: "ক্রিকেট",
    desc: "প্লেয়ার ও পরিসংখ্যান",
    icon: (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
        <g transform="rotate(32 22 24)">
          <rect x="20.6" y="5" width="2.8" height="10" rx="1.4" />
          <path d="M18.5 15 h7 v15 a3.5 5 0 0 1 -7 0 z" />
        </g>
        <circle cx="35.5" cy="35.5" r="5.5" />
        <path d="M32.8 31.8 Q35.5 35.5 32.8 39.2 M38.2 31.8 Q35.5 35.5 38.2 39.2" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    to: "/news",
    label: "সামাজিক কার্যক্রম",
    desc: "কার্যক্রম, সংবাদ ও নোটিশ",
    icon: (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="24" cy="16.5" r="4.6" />
        <path d="M14.8 36.5 c1-6.2 4.8-9.3 9.2-9.3 s8.2 3.1 9.2 9.3" />
        <circle cx="10" cy="20" r="3.4" strokeWidth="1.8" />
        <path d="M3.8 34.5 c.6-4.2 2.8-6.6 6-7.2" strokeWidth="1.8" />
        <circle cx="38" cy="20" r="3.4" strokeWidth="1.8" />
        <path d="M44.2 34.5 c-.6-4.2 -2.8-6.6 -6-7.2" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    to: "/finance",
    label: "আর্থিক হিসাব",
    desc: "প্রকাশিত আর্থিক সারসংক্ষেপ",
    icon: (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 13.5 V12 a3 3 0 0 1 3-3 h17 a3 3 0 0 1 3 3 v1.5" />
        <rect x="6.5" y="13.5" width="35" height="23" rx="5" />
        <path d="M41.5 22.5 h-9 a3.5 3.5 0 0 0 0 7 h9" />
        <circle cx="35.8" cy="26" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export default function QuickAccess() {
  return (
    <section aria-label="দ্রুত অ্যাক্সেস" className="mx-auto w-full max-w-7xl px-4">
      {/* Mobile: two cards per row (owner's layout, 2026-10-30),
          stacked icon-above-text so the narrow cards stay
          readable; sm and up: icon beside text; lg: four in a row. */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ITEMS.map((item) => (
          <Link
            key={item.to + item.label}
            to={item.to}
            className="np-card np-card-hover flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-3.5 sm:p-4"
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E9F4EC] text-brand-dark"
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <span>
              <span className="block font-bold text-brand-dark">{item.label}</span>
              <span className="block text-xs text-neutral-500">{item.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
