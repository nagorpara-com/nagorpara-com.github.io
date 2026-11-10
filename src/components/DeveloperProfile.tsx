import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { DEVELOPER } from "../config/developer";

/**
 * Developer profile block — the owner's reference design
 * (2026-10-24): circular photo with a gold border on the left;
 * bold name, gold role and the line "Designed & Developed this
 * Website" on the right; a thin divider; then the link items
 * (GitHub Profile, Facebook Profile, Developer Contact, Phone),
 * each with its icon and a gold external-link icon or the
 * number. Compacted hard at the owner's order (2026-10-28):
 * smaller photo/type/padding throughout and the links flow
 * inline, so the whole box takes far less room; the Footer
 * places it as its last block (mobile: the footer's very end;
 * desktop: under the brand row, as before).
 *
 * Desktop one-line row (owner, 2026-11-10): at lg+ the two
 * social links leave the flow row and sit at the RIGHT end of
 * the header row as icon-only round buttons — measured, the
 * labelled links need 575px against the card's 375px content
 * width at 1280 (289px at 1024), so labels cannot fit on one
 * line; the Phone line stays under the divider, unchanged.
 * Below lg nothing changes: all items flow under the divider,
 * exactly as before.
 *
 * Click-to-reveal blur (owner, 2026-11-10): wherever a visitor
 * sees this block — the desktop footer column and the mobile
 * footer end alike, since both render this one component — the
 * contents start BLURRED on every page load. A click/tap on
 * the card lifts the blur; while blurred the content ignores
 * pointer events entirely, so that first click can only reveal
 * and never navigate a link. Once revealed, the links and the
 * phone work exactly as before, and a click on a non-link area
 * of the card blurs it again. The state is per page load only
 * (React state, nothing stored): a fresh load starts blurred.
 * No hint text or icon is added, and the card's size, spacing
 * and colours are unchanged in both states.
 *
 * Rendered ONCE inside the shared public Footer, so it appears
 * in the same place and style on every public page and never in
 * the Admin Panel. All values come from src/config/developer.ts.
 * The Developer Contact item appears only once the owner
 * provides his real developer email (see the config note) —
 * the organization's email is never substituted for it.
 */

function ExternalGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gold" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

const rowClass =
  "flex items-center gap-1.5 rounded-md px-1 py-1 text-white transition hover:bg-white/5";
const rowLabelClass = "text-[13px] font-medium";

export default function DeveloperProfile() {
  // Click-to-reveal blur (owner, 2026-11-10 — see the file
  // header note). Starts blurred on every page load; the state
  // lives only in this component instance, nothing is stored.
  const [revealed, setRevealed] = useState(false);
  // While blurred, every content block carries this veil: a
  // clear blur, no text selection, and no pointer events at
  // all — so a click anywhere lands on the card itself and
  // can only reveal, never reach a link underneath.
  const veilClass = revealed
    ? ""
    : "pointer-events-none select-none blur-[7px]";

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!revealed) {
      setRevealed(true);
      return;
    }
    // Revealed: real links keep their normal behaviour; a
    // click on any non-link area of the card blurs it again.
    if ((event.target as HTMLElement).closest("a")) return;
    setRevealed(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Only when the card itself is focused — Enter/Space on a
    // revealed link inside must stay a normal link activation.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setRevealed((value) => !value);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={revealed}
      aria-label="ডেভলপারের তথ্য"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10${
        revealed ? "" : " cursor-pointer"
      }`}
    >
      {/* Header: photo left, identity right */}
      <div aria-hidden={!revealed} className={`flex items-center gap-3 ${veilClass}`}>
        <img loading="lazy"
          src={DEVELOPER.photoPath}
          alt={DEVELOPER.name}
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-gold"
        />
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight">{DEVELOPER.name}</p>
          <p className="mt-0.5 text-[13px] font-semibold leading-tight text-gold">{DEVELOPER.role}</p>
          <p className="mt-0.5 text-xs leading-snug text-white/85">{DEVELOPER.description}</p>
        </div>

        {/* Social links, desktop: right end of this same row,
            icon-only round buttons (labels measured not to
            fit — see the file header note). Same URLs and
            order as the labelled flow-row links below. */}
        <div className="ml-auto hidden shrink-0 items-center gap-1.5 lg:flex">
          <a
            href={DEVELOPER.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Profile"
            tabIndex={revealed ? undefined : -1}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </a>
          <a
            href={DEVELOPER.facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook Profile"
            tabIndex={revealed ? undefined : -1}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true">
              <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06H293V6.26S259.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
            </svg>
          </a>
        </div>
      </div>

      <div aria-hidden={!revealed} className={`my-1.5 border-t border-white/15 ${veilClass}`} />

      {/* Link items — inline flow (compact, 2026-10-28). At
          lg+ the two social links hide here and appear as the
          icon buttons in the header row instead; the contact
          item (when set) and the Phone line stay in this row
          at every width. */}
      <div aria-hidden={!revealed} className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${veilClass}`}>
        <a
          href={DEVELOPER.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={revealed ? undefined : -1}
          className={`${rowClass} lg:hidden`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span className={rowLabelClass}>GitHub Profile</span>
          <ExternalGlyph />
        </a>

        <a
          href={DEVELOPER.facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={revealed ? undefined : -1}
          className={`${rowClass} lg:hidden`}
        >
          <svg width="18" height="18" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true">
            <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06H293V6.26S259.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
          </svg>
          <span className={rowLabelClass}>Facebook Profile</span>
          <ExternalGlyph />
        </a>

        {DEVELOPER.email && (
          <a href={`mailto:${DEVELOPER.email}`} tabIndex={revealed ? undefined : -1} className={rowClass}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <span className={rowLabelClass}>Developer Contact</span>
            <ExternalGlyph />
          </a>
        )}

        <a href={DEVELOPER.phoneHref} tabIndex={revealed ? undefined : -1} className={rowClass}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.4 11.4 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z" />
          </svg>
          <span className={rowLabelClass}>Phone</span>
          <span className="shrink-0 text-[13px] font-semibold text-gold">{DEVELOPER.phoneDisplay}</span>
        </a>
      </div>
    </div>
  );
}
