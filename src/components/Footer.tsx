import { Link } from "react-router-dom";
import { usePopupCoordinator } from "../context/PopupCoordinatorContext";
import { useSiteSettings } from "../hooks/useSiteSettings";
import {
  markSubscriptionSubmitted,
  markSubscriptionVerified,
} from "../utils/popupState";
import { NAV_LEAVES } from "./Header";
import SubscribeForm from "./SubscribeForm";
import DeveloperProfile from "./DeveloperProfile";

/**
 * Public footer — Phase 3.
 * Shows only organization-provided facts: name, logo, address, email,
 * the Facebook Page link, and links to real public routes. Per the
 * owner's correction of 2026-10-24 the phone number is NOT displayed
 * publicly, and the newsletter subscribe box sits inside the contact
 * column (not a separate band) to keep the footer compact. The
 * Facebook URL is the owner's confirmed @nagorpara Page.
 * No establishment year or tagline is shown (none was provided).
 * All values come from useSiteSettings(), so the Admin Panel's
 * site_settings will override them later without code changes.
 */
export default function Footer() {
  const settings = useSiteSettings();
  const { setSubscriptionFormActive } = usePopupCoordinator();
  // Subscription rule (owner, 2026-11-01): ONE subscription per
  // EMAIL address — the server enforces it. The footer box must
  // therefore ALWAYS offer the form: a browser that already
  // subscribed one address can subscribe another. (This replaces
  // the Phase 6A behaviour that swapped the form for an
  // "already subscribed" note once this browser had subscribed.)
  // A successful footer submission still records the browser
  // memory marks so the popup flow stays consistent.
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand-dark text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {/* Identity */}
        <div>
          <div className="flex items-center gap-3">
            <img loading="lazy"
              src={settings.logoPath}
              alt=""
              className="h-12 w-12 rounded-full bg-white object-contain"
            />
            <div>
              <p className="font-bold leading-tight">{settings.nameBn}</p>
              <p className="text-xs text-white/70">{settings.nameEn}</p>
            </div>
          </div>

          {/* Developer profile, desktop placement: directly
              under the brand, as it has always been. The mobile
              placement (footers very end) is the second render
              below — exactly one of the two is ever visible. */}
          <div className="mt-3 hidden lg:block">
            <DeveloperProfile />
          </div>
        </div>

        {/* Quick links — real routes only. The column carries no
            visible heading (owner's instruction, 2026-10-24); the
            aria-label keeps it identifiable for screen readers. */}
        <nav aria-label="ফুটার লিংক">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {NAV_LEAVES.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="text-white/85 hover:text-gold">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Contact — organization-provided details only */}
        <div>
          <p className="text-base font-bold text-gold">যোগাযোগ</p>
          <ul className="mt-2 space-y-1 text-sm text-white/85">
            {settings.address && (
              <li className="flex gap-2">
                <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span>{settings.address}</span>
              </li>
            )}
            {settings.email && (
              <li className="flex gap-2">
                <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
                <a href={`mailto:${settings.email}`} className="hover:text-gold">
                  {settings.email}
                </a>
              </li>
            )}
            {settings.facebookUrl && (
              <li className="flex gap-2">
                <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
                </svg>
                <a href={settings.facebookUrl} target="_blank" rel="noreferrer" className="hover:text-gold">
                  Facebook Page
                </a>
              </li>
            )}
            {settings.youtubeUrl && (
              <li className="flex gap-2">
                <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z" />
                </svg>
                <a href={settings.youtubeUrl} target="_blank" rel="noreferrer" className="hover:text-gold">
                  YouTube Channel
                </a>
              </li>
            )}
          </ul>

          {/* Newsletter subscribe box (Phase C2, moved inside the
              contact column at the owner's request, 2026-10-24).
              Instant model (2026-10-27): submitting activates the
              subscription immediately — no verification email. */}
          <div className="mt-2.5 border-t border-white/10 pt-2.5">
            <p className="text-base font-bold text-gold">নোটিশ ও ঘোষণা ইমেইলে পান</p>
            <div className="mt-1.5">
              <SubscribeForm
                tone="dark"
                showLabel={false}
                onActiveChange={setSubscriptionFormActive}
                onSubmitted={(result) => {
                  markSubscriptionSubmitted(Date.now());
                  markSubscriptionVerified(result.subscriberId);
                }}
              />
            </div>
          </div>
        </div>

        {/* Developer profile, mobile placement (owner,
            2026-10-28): the LAST block of the footer, at the
            very end of the page. Desktop uses the render inside
            the identity column above; exactly one is visible. */}
        <div className="lg:hidden">
          <DeveloperProfile />
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-[13px] text-white/85">
          <span>
            © {year} {settings.nameBn} — সর্বস্বত্ব সংরক্ষিত।
          </span>
        </div>
      </div>
    </footer>
  );
}
