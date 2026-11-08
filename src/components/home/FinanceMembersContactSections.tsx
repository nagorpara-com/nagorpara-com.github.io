import { useState } from "react";
import SectionHeading from "./SectionHeading";
import EmptyState from "./EmptyState";
import { formatBdt } from "../../utils/format";
import { intlBdPhone } from "../../utils/member";
import { useSiteSettings } from "../../hooks/useSiteSettings";

function SvgIcon({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}
const IconPhone = ({ className }: { className?: string }) => (
  <SvgIcon className={className}>
    <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.8 1.8 0 0 1-2 2A16.5 16.5 0 0 1 3 6a1.8 1.8 0 0 1 2-2Z" />
  </SvgIcon>
);
const IconChat = ({ className }: { className?: string }) => (
  <SvgIcon className={className}>
    <path d="M21 12a8 8 0 0 1-8 8c-1.2 0-2.4-.3-3.4-.7L4 20l.8-5.4A8 8 0 1 1 21 12Z" />
  </SvgIcon>
);
import type { CommitteeRow, FinancePublicSummary, MemberRow } from "../../hooks/useHomepageData";

/**
 * Section 9 — public finance summary.
 * Built ONLY from transactions the organization flagged `is_public`
 * (RLS already hides everything else from anonymous visitors), using
 * the approved rule: withdrawals and transfers are NOT expenses, and
 * balance = income − expense. Nothing sensitive is shown.
 */
export function FinancePreview({ finance, headingTitle }: { finance: FinancePublicSummary | null; headingTitle?: string }) {
  return (
    <section aria-label="আর্থিক সারসংক্ষেপ" className="mx-auto w-full max-w-7xl px-4 pt-12">
      <SectionHeading title={headingTitle ?? "আর্থিক সারসংক্ষেপ"} linkTo="/finance" />
      {finance === null ? (
        <EmptyState message="প্রকাশযোগ্য আর্থিক সারসংক্ষেপ এখনো প্রকাশ করা হয়নি। সংগঠন প্রকাশের জন্য হিসাব চিহ্নিত করলে এখানে সারসংক্ষেপ দেখা যাবে।" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-brand p-5 text-white">
              <p className="text-sm text-white/85">বর্তমান ব্যালেন্স (প্রকাশিত)</p>
              <p className="mt-1 text-2xl font-extrabold">{formatBdt(finance.balance)}</p>
            </div>
            <div className="np-card p-5">
              <p className="text-sm text-neutral-500">মোট আয় (প্রকাশিত)</p>
              <p className="mt-1 text-2xl font-extrabold text-brand">{formatBdt(finance.totalIncome)}</p>
            </div>
            <div className="np-card p-5">
              <p className="text-sm text-neutral-500">মোট ব্যয় (প্রকাশিত)</p>
              <p className="mt-1 text-2xl font-extrabold text-red-600">{formatBdt(finance.totalExpense)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            এটি শুধুমাত্র প্রকাশের জন্য চিহ্নিত হিসাবের সারসংক্ষেপ। উত্তোলন ও স্থানান্তরকে ব্যয় হিসেবে গণনা করা হয়নি।
          </p>
        </>
      )}
    </section>
  );
}

/** Section 10 — members & committee preview (owner, 2026-10-28;
 *  filter + counts per his spec, 2026-10-29): the portrait card
 *  design stays as it was (gold top line, 4:5 portrait photo —
 *  a square 1:1 variant tried on 2026-10-29 was reverted the
 *  same day on his explicit choice — name contact role
 *  chip, group tag on the photo, কল / মেসেজ strip). A filter
 *  box under the heading opens the সদস্য / কমিটি options;
 *  only the selected category shows, SIX most recently added profiles
 *  each (mobile 2 per row, desktop 4 per row — the existing
 *  grid). No search here by design: search lives only on the
 *  Members & Committee page. Everyone else is one tap away via
 *  the heading's সব দেখুন link. */
interface PreviewPerson {
  id: string;
  name: string;
  photo_url: string | null;
  phone: string | null;
  facebook_url: string | null;
}

function MemberPreviewCard({ person, tag, chip, index }: { person: PreviewPerson; tag: string; chip: string; index: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!person.photo_url && !imgFailed;
  const stripBtn =
    "flex h-11 flex-1 items-center justify-center gap-1.5 text-sm font-semibold text-brand transition hover:bg-brand-light lg:h-10";
  return (
    <div
      className="animate-card-rise group np-card np-card-hover flex h-full flex-col"
      style={{ animationDelay: `${Math.min(index, 11) * 60}ms` }}
    >
      <span className="np-gold-line" aria-hidden="true" />
      <div className="np-media aspect-[4/5]">
        <span className="pointer-events-none absolute left-1/2 top-8 h-44 w-44 -translate-x-1/2 rounded-full bg-gold/15 blur-2xl" aria-hidden="true" />
        {showPhoto ? (
          <img
            src={person.photo_url ?? undefined}
            alt={person.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="relative h-full w-full object-cover object-top transition duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="relative flex h-full w-full items-center justify-center text-6xl font-bold text-brand/40" aria-hidden="true">
            {person.name.trim().charAt(0) || "স"}
          </span>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-brand-dark/85 px-2.5 py-0.5 text-[11px] font-bold text-gold">
          {tag}
        </span>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-brand-dark/25 to-transparent" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col items-center p-3 text-center sm:p-4">
        <p className="w-full truncate font-bold text-brand-dark" title={person.name}>{person.name}</p>
        {(person.phone || person.facebook_url) && (
          <div className="mt-2 flex w-full flex-wrap items-center justify-center gap-1.5">
            {person.phone && (
              <a
                href={`tel:${person.phone}`}
                className="inline-block rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-dark transition hover:bg-accent/40"
              >
                {person.phone}
              </a>
            )}
            {person.facebook_url && (
              <a
                href={person.facebook_url}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-dark transition hover:bg-accent/40"
              >
                Facebook
              </a>
            )}
          </div>
        )}
        <p className="mt-auto w-full pt-2.5">
          <span className="np-chip">{chip}</span>
        </p>
      </div>
      {(person.phone || person.facebook_url) && (
        <div className="flex border-t border-neutral-100">
          {person.phone && (
            <a href={`tel:${intlBdPhone(person.phone)}`} className={stripBtn} aria-label={`${person.name}-কে কল করুন`}>
              <IconPhone className="h-[18px] w-[18px]" />
              কল
            </a>
          )}
          {(person.facebook_url || person.phone) &&
            (person.facebook_url ? (
              <a
                href={person.facebook_url}
                target="_blank"
                rel="noreferrer"
                className={stripBtn + (person.phone ? " border-l border-neutral-100" : "")}
                aria-label={`${person.name}-কে মেসেজ করুন`}
              >
                <IconChat className="h-[18px] w-[18px]" />
                মেসেজ
              </a>
            ) : (
              <a
                href={`sms:${intlBdPhone(person.phone!)}`}
                className={stripBtn + " border-l border-neutral-100"}
                aria-label={`${person.name}-কে মেসেজ করুন`}
              >
                <IconChat className="h-[18px] w-[18px]" />
                মেসেজ
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

export function MembersPreview({ members, committee, headingTitle }: { members: MemberRow[]; committee: CommitteeRow[]; headingTitle?: string }) {
  const memberCards: { person: PreviewPerson; tag: string; chip: string }[] = members.map((m) => ({
    person: m,
    tag: "সদস্য",
    chip: "সাধারণ সদস্য",
  }));
  const committeeCards: { person: PreviewPerson; tag: string; chip: string }[] = committee.map((c) => ({
    person: c,
    tag: "কমিটি",
    chip: c.role_title,
  }));
  // Filter (owner's decision, 2026-11-02 — REPLACES his
  // 2026-10-29 custom dropdown-box spec): TWO BUTTONS directly
  // under the section heading, named "সদস্য" and "কমিটি", in
  // the same style as the /members page tabs — the selected
  // button is brand green, the other light. Pressing one shows
  // only that category's cards (the other category is hidden;
  // switching is instant, no reload). Default = সদস্য when
  // members exist, else কমিটি; a visitor's own choice always
  // wins, even onto an empty category (which then shows its
  // honest empty note). Same on mobile and desktop.
  const [chosen, setChosen] = useState<"members" | "committee" | null>(null);
  const filter: "members" | "committee" = chosen ?? (memberCards.length > 0 ? "members" : "committee");
  const filterTabCls = (active: boolean) =>
    `flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition lg:flex-none ${active ? "bg-brand text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-brand-light"}`;
  const gridCls = "grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4";
  const activeCards = filter === "members" ? memberCards : committeeCards;
  return (
    <section aria-label="সদস্য ও কমিটি" className="mx-auto w-full max-w-7xl px-4 pt-12">
      <SectionHeading title={headingTitle ?? "সদস্য ও কমিটি"} linkTo="/members" />
      {memberCards.length === 0 && committeeCards.length === 0 ? (
        <EmptyState message="সদস্য বা কমিটির তথ্য এখনো যোগ করা হয়নি। Admin Panel থেকে যোগ হলে এখানে দেখা যাবে।" />
      ) : (
        <>
          <div className="mb-5 flex gap-2">
            <button type="button" aria-pressed={filter === "members"} onClick={() => setChosen("members")} className={filterTabCls(filter === "members")}>
              সদস্য
            </button>
            <button type="button" aria-pressed={filter === "committee"} onClick={() => setChosen("committee")} className={filterTabCls(filter === "committee")}>
              কমিটি
            </button>
          </div>
          {activeCards.length === 0 ? (
            <EmptyState message={filter === "members" ? "এখনো কোনো সদস্য যোগ করা হয়নি।" : "এখনো কোনো কমিটি সদস্য যোগ করা হয়নি।"} />
          ) : (
            <div className={gridCls}>
              {activeCards.map((card, i) => (
                <MemberPreviewCard key={card.person.id} person={card.person} tag={card.tag} chip={card.chip} index={i} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Section 11 — contact information (same source as the footer: useSiteSettings). */
export function ContactSection({ headingTitle }: { headingTitle?: string }) {
  const settings = useSiteSettings();
  return (
    <section aria-label="যোগাযোগ" className="mx-auto w-full max-w-7xl px-4 py-12">
      <SectionHeading title={headingTitle ?? "যোগাযোগ"} linkTo="/contact" linkLabel="যোগাযোগ পেজ" />
      <div className="grid gap-3 rounded-2xl bg-brand-light p-5 sm:grid-cols-3">
        {settings.address && (
          <div>
            <p className="text-xs font-medium text-neutral-500">ঠিকানা</p>
            <p className="mt-0.5 font-semibold text-brand-dark">{settings.address}</p>
          </div>
        )}
        {settings.email && (
          <div>
            <p className="text-xs font-medium text-neutral-500">ইমেইল</p>
            <a href={`mailto:${settings.email}`} className="mt-0.5 block font-semibold text-brand-dark hover:text-brand">
              {settings.email}
            </a>
          </div>
        )}
        {settings.facebookUrl && (
          <div>
            <p className="text-xs font-medium text-neutral-500">ফেসবুক</p>
            <a href={settings.facebookUrl} target="_blank" rel="noreferrer" className="mt-0.5 block font-semibold text-brand-dark hover:text-brand">
              Facebook Page
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
