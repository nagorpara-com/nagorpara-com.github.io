import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePublicMembers } from "../../hooks/usePublicMembers";
import { usePublicMembersBanners } from "../../hooks/usePublicMembersBanners";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { toBn } from "../../utils/format";
import type { CommitteeMember, PublicMember } from "../../types/database.types";

/**
 * Members & Committee — public page, rebuilt to the owner's
 * reference design (2026-10-28): a light banner with the page
 * title, description and breadcrumb; a toolbar with member /
 * committee tabs (with totals), search by name or phone, a
 * joined-year filter and reset; then the members section FIRST
 * and the committee section below it (the owner's settled
 * order), each with its own sort control and pagination.
 *
 * Cards follow the reference: a gold top line, a small
 * category badge (সদস্য / কমিটি) at the card's top-left
 * corner, a round photo beside the name, a calendar meta
 * line (joined year for members, the term period for
 * committee) and a role chip. The phone number is not
 * displayed anywhere on the card (owner's model,
 * 2026-10-29): the bottom strip's কল button carries it as
 * its tel: link only, beside মেসেজ (the member's Facebook
 * when one is on record, otherwise SMS).
 *
 * Everything shown is Admin-managed data that already exists:
 * members from the `members_public` view (a phone appears only
 * when marked public) and the current term's committee from
 * `committee_public` + `committee_terms` — no new tables, and
 * every field is addable today from Admin সদস্য ও কমিটি.
 */

const PER_PAGE_DESKTOP = 8;
/** Mobile shows 4 cards per page in both sections (owner's
 *  order, 2026-10-28); desktop keeps 8. */
const PER_PAGE_MOBILE = 4;

const PAGE_DESCRIPTION =
  "নগর পাড়া অগ্রগামী যুব সংঘের সম্মানিত সদস্য ও কমিটির সদস্যবৃন্দ। আমাদের সংগঠনের কার্যক্রম, উন্নয়ন ও অগ্রযাত্রায় তারা গুরুত্বপূর্ণ ভূমিকা পালন করছেন।";

/* ---------- small inline icons (stroke style, site-wide pattern) ---------- */

function Svg({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

const IconUsers = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M3.6 19.2c.6-3.1 2.7-4.7 5.4-4.7s4.8 1.6 5.4 4.7" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16.2 14.7c2.1.3 3.6 1.7 4.1 4" />
  </Svg>
);
const IconSearch = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.8-3.8" />
  </Svg>
);
const IconCalendar = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </Svg>
);
const IconPhone = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.8 1.8 0 0 1-2 2A16.5 16.5 0 0 1 3 6a1.8 1.8 0 0 1 2-2Z" />
  </Svg>
);
const IconChat = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M21 12a8 8 0 0 1-8 8c-1.2 0-2.4-.3-3.4-.7L4 20l.8-5.4A8 8 0 1 1 21 12Z" />
  </Svg>
);
const IconHome = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="m4 11 8-7 8 7" />
    <path d="M6 9.5V20h12V9.5" />
  </Svg>
);
const IconChevronRight = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
const IconFilter = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M4 5h16l-6.2 7.2V19l-3.6 1.8v-8.6L4 5Z" />
  </Svg>
);
const IconSliders = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h11M19 17h1" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="12" r="2.2" />
    <circle cx="16.5" cy="17" r="2.2" />
  </Svg>
);

/* ---------- helpers ---------- */

function initials(name: string): string {
  return name.trim().charAt(0) || "স";
}

/** Plausible 4-digit year from an ISO date string, else null —
 * the same guard the page has always used, so a mistyped year
 * in the data never prints as-is. A committee term legitimately
 * ENDS in a future year, so term dates pass a wider cap. */
function yearOf(iso: string | null, maxYear?: number): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const currentYear = new Date().getFullYear();
  const cap = maxYear ?? currentYear + 1;
  if (year < 1950 || year > cap) return null;
  return year;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
/** Bengali digits -> English digits, so a phone search typed as
 *  ০১৭… finds numbers stored as 017… (audit fix, 2026-10-28). */
const toEnDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

function matchesQuery(name: string, phone: string | null, q: string): boolean {
  if (!q) return true;
  if (name.toLowerCase().includes(q.toLowerCase())) return true;
  if (phone) {
    const digits = toEnDigits(q).replace(/[\s-]/g, "");
    if (digits && phone.replace(/[\s-]/g, "").includes(digits)) return true;
  }
  return false;
}

/** Stored numbers are local (01XXXXXXXXX); call/SMS links use the
 *  international form tel:+8801XXXXXXXXX (mobile spec §12). */
const intlPhone = (p: string) => (p.startsWith("+") ? p : p.startsWith("0") ? `+88${p}` : p);

/* ---------- one person card (members and committee share it) ---------- */

function PersonCard({
  name,
  photoUrl,
  phone,
  facebookUrl,
  meta,
  chip,
  variant,
  index,
}: {
  name: string;
  photoUrl: string | null;
  phone: string | null;
  facebookUrl?: string | null;
  meta: string | null;
  chip: string;
  /** Card body order: member cards read name joined line
   * chip; committee cards read name role chip term line,
   * and the committee term line sits in a light pill. A small
   * badge at the card's top-left corner names the category. */
  variant: "member" | "committee";
  index: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!photoUrl && !imgFailed;
  const messageHref = facebookUrl ?? (phone ? `sms:${intlPhone(phone)}` : null);
  const actions: { label: string; href: string; external?: boolean; icon: React.ReactNode }[] = [];
  if (phone) actions.push({ label: "কল", href: `tel:${intlPhone(phone)}`, icon: <IconPhone className="h-4 w-4" /> });
  if (messageHref) actions.push({ label: "মেসেজ", href: messageHref, external: !!facebookUrl, icon: <IconChat className="h-4 w-4" /> });

  return (
    <li
      className="animate-card-rise relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200/80 transition hover:shadow-md lg:h-[220px]"
      style={{ animationDelay: `${Math.min(index, 11) * 60}ms` }}
    >
      <span className="h-[3px] w-full bg-gold" aria-hidden="true" />
      <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-brand px-2.5 py-[3px] text-[11px] font-bold text-white shadow">
        {variant === "member" ? "সদস্য" : "কমিটি"}
      </span>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 lg:flex-row lg:items-center lg:justify-start lg:gap-12 lg:p-4">
        {showPhoto ? (
          <img
            src={photoUrl ?? undefined}
            alt={name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-[72px] w-[72px] shrink-0 rounded-full object-cover ring-2 ring-brand-light lg:h-20 lg:w-20"
          />
        ) : (
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-brand-light text-2xl font-bold text-brand/50 ring-2 ring-brand-light lg:h-20 lg:w-20" aria-hidden="true">
            {initials(name)}
          </span>
        )}
        <div className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
          <p className="max-w-full break-words text-[15px] font-semibold text-neutral-800 lg:truncate lg:text-lg" title={name}>{name}</p>
          {variant === "committee" && (
            <span className="mt-2.5 inline-flex h-7 items-center rounded-full bg-brand-light px-2.5 text-[11px] font-semibold text-brand-dark">
              {chip}
            </span>
          )}
          {meta && (
            variant === "committee" ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500 lg:text-sm">
                <IconCalendar className="h-4 w-4 shrink-0 text-brand-dark" />
                <span className="inline-flex h-7 items-center rounded-full bg-brand-light px-3 text-neutral-600">{meta}</span>
              </p>
            ) : (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500 lg:text-sm">
                <IconCalendar className="h-4 w-4 shrink-0" />
                {meta}
              </p>
            )
          )}
          {variant === "member" && (
            <span className="mt-2.5 inline-flex h-7 items-center rounded-full bg-brand-light px-2.5 text-[11px] font-semibold text-brand-dark">
              {chip}
            </span>
          )}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="mt-auto grid grid-cols-2 divide-x divide-neutral-200 border-t border-neutral-200">
          {actions.map((a) => (
            <a
              key={a.label}
              href={a.href}
              {...(a.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className={`flex h-11 items-center justify-center gap-1.5 text-sm font-semibold text-neutral-700 transition hover:bg-brand-light/70 hover:text-brand-dark lg:h-9 ${actions.length === 1 ? "col-span-2" : ""}`}
            >
              {a.icon}
              {a.label}
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

/* ---------- pagination ---------- */

function pageNumbers(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, total - 1, total, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btn = "flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-semibold ring-1 ring-neutral-300 bg-white text-neutral-700 transition hover:bg-brand-light disabled:opacity-40 lg:h-9 lg:min-w-9";
  return (
    <nav className="mt-6 flex items-center justify-end gap-1.5" aria-label="পেজ নম্বর">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="আগের পেজ">
        <IconChevronRight className="h-4 w-4 rotate-180" />
      </button>
      {pageNumbers(page, totalPages).map((n, i) =>
        n === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-neutral-400">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === page ? "page" : undefined}
            className={n === page ? "flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-bold bg-brand text-white ring-1 ring-brand lg:h-9 lg:min-w-9" : btn}
          >
            {toBn(n)}
          </button>
        ),
      )}
      <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="পরের পেজ">
        <IconChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

/* ---------- section heading (icon + title + total badge) ---------- */

function SectionTitle({ title, total }: { title: string; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
        <IconUsers className="h-5 w-5" />
      </span>
      <h2 className="text-xl font-bold text-brand-dark">{title}</h2>
      <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
        মোট: {toBn(total)} জন
      </span>
    </div>
  );
}

const selectClass =
  "h-11 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm font-medium text-neutral-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

/* ---------- the page ---------- */

export default function MembersPage() {
  const { loading, error, term, committee, members } = usePublicMembers();
  const site = useSiteSettings();

  // Banner headline/description are admin-editable (Admin
  // Website Settings, migration 0029); each falls back to the
  // built-in default text when unset, so the banner never
  // renders empty. There is NO built-in default PHOTO (owner's
  // order, 2026-10-29: no bundled banner/photo in the project —
  // the team adds every photo from the Admin Panel); with no
  // admin banner and no Settings photo the banner is the plain
  // brand-green block with the headline.
  const bannerTitle = site.membersPageTitle || "সদস্য ও কমিটি";
  const bannerDescription = site.membersPageDescription || PAGE_DESCRIPTION;

  // Banner photos: the published rows of Admin সদস্য ও কমিটি
  // ব্যানার (migration 0032, at most 3) rotate here as a slider.
  // When none are published, the banner falls back to the single
  // Settings photo; with neither, there are no slides at all and
  // the banner renders gradient-only (no bundled photo).
  const adminBanners = usePublicMembersBanners();
  const [failedSlides, setFailedSlides] = useState<ReadonlySet<string>>(new Set());
  const allSlides =
    adminBanners.length > 0 ? adminBanners : site.membersBannerUrl ? [site.membersBannerUrl] : [];
  const slides = allSlides.filter((u) => !failedSlides.has(u));
  const [slideIndex, setSlideIndex] = useState(0);
  const [slidePaused, setSlidePaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const activeSlide = slides.length > 0 ? slideIndex % slides.length : 0;
  useEffect(() => {
    if (slides.length <= 1 || slidePaused) return;
    const t = setInterval(() => setSlideIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length, slidePaused]);
  const goSlide = (dir: 1 | -1) =>
    setSlideIndex((i) => (i + dir + slides.length) % Math.max(slides.length, 1));

  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [memberSort, setMemberSort] = useState<"new" | "old" | "name" | "nameDesc">("new");
  const [committeeSort, setCommitteeSort] = useState<"order" | "name" | "nameDesc">("order");
  const [committeeRole, setCommitteeRole] = useState<string>("all");
  const [memberPage, setMemberPage] = useState(1);
  const [committeePage, setCommitteePage] = useState(1);
  const [activeTab, setActiveTab] = useState<"members" | "committee">("members");
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const perPage = isMobile ? PER_PAGE_MOBILE : PER_PAGE_DESKTOP;

  const membersRef = useRef<HTMLElement | null>(null);
  const committeeRef = useRef<HTMLElement | null>(null);

  useEffect(() => { setMemberPage(1); }, [query, year, memberSort]);
  useEffect(() => { setCommitteePage(1); }, [query, committeeSort, committeeRole]);

  const years = useMemo(() => {
    const set = new Set<number>();
    members.forEach((m) => {
      const y = yearOf(m.joined_date);
      if (y) set.add(y);
    });
    return [...set].sort((a, b) => b - a);
  }, [members]);

  const filteredMembers = useMemo(() => {
    const list = members.filter(
      (m) =>
        matchesQuery(m.name, m.phone, query.trim()) &&
        (year === "all" || yearOf(m.joined_date) === Number(year)),
    );
    const byOrder = (a: PublicMember, b: PublicMember) => a.display_order - b.display_order;
    if (memberSort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "bn") || byOrder(a, b));
    if (memberSort === "nameDesc") return [...list].sort((a, b) => b.name.localeCompare(a.name, "bn") || byOrder(a, b));
    const dir = memberSort === "new" ? -1 : 1;
    return [...list].sort((a, b) => {
      const ya = yearOf(a.joined_date);
      const yb = yearOf(b.joined_date);
      if (ya === null && yb === null) return byOrder(a, b);
      if (ya === null) return 1;
      if (yb === null) return -1;
      const ja = a.joined_date ?? "";
      const jb = b.joined_date ?? "";
      return ja === jb ? byOrder(a, b) : (ja < jb ? -1 : 1) * dir;
    });
  }, [members, query, year, memberSort]);

  const roles = useMemo(
    () => [...new Set([...committee].sort((a, b) => a.display_order - b.display_order).map((c) => c.role_title))],
    [committee],
  );

  const filteredCommittee = useMemo(() => {
    const q = query.trim();
    const list = committee.filter(
      (c) =>
        (matchesQuery(c.name, c.phone, q) || c.role_title.toLowerCase().includes(q.toLowerCase())) &&
        (committeeRole === "all" || c.role_title === committeeRole),
    );
    if (committeeSort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "bn"));
    if (committeeSort === "nameDesc") return [...list].sort((a, b) => b.name.localeCompare(a.name, "bn"));
    return [...list].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, "bn"));
  }, [committee, query, committeeSort, committeeRole]);

  const memberTotalPages = Math.max(1, Math.ceil(filteredMembers.length / perPage));
  const committeeTotalPages = Math.max(1, Math.ceil(filteredCommittee.length / perPage));
  const safeMemberPage = Math.min(memberPage, memberTotalPages);
  const safeCommitteePage = Math.min(committeePage, committeeTotalPages);
  const pagedMembers = filteredMembers.slice((safeMemberPage - 1) * perPage, safeMemberPage * perPage);
  const pagedCommittee = filteredCommittee.slice((safeCommitteePage - 1) * perPage, safeCommitteePage * perPage);

  const termMeta = useMemo(() => {
    const termCap = new Date().getFullYear() + 10;
    const start = yearOf(term?.start_date ?? null, termCap);
    const end = yearOf(term?.end_date ?? null, termCap);
    if (start && end) return `মেয়াদ: ${toBn(start)} - ${toBn(end)}`;
    if (start) return `মেয়াদ: ${toBn(start)} থেকে`;
    return null;
  }, [term]);

  const resetAll = () => {
    setQuery("");
    setYear("all");
    setMemberSort("new");
    setCommitteeSort("order");
    setCommitteeRole("all");
    setActiveTab("members");
  };

  const goToSection = (which: "members" | "committee") => {
    // Tab model (owner, 2026-11-02): at EVERY screen size only
    // the selected section shows — সদস্য selected shows members,
    // কমিটি selected shows the committee. The two sections are
    // never stacked together, so there is nothing to scroll to.
    setActiveTab(which);
  };

  const tabClass = (active: boolean) =>
    `flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition lg:flex-none ${active ? "bg-brand text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-brand-light"}`;

  return (
    <div>
      {/* Banner */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#E7F4EC] via-[#F4FAF5] to-[#E7F4EC]">
        <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand/10 blur-2xl" aria-hidden="true" />
        <span className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-gold/20 blur-2xl" aria-hidden="true" />
        {slides.length > 0 ? (
          <>
            <div
              className="absolute inset-0"
              onMouseEnter={() => setSlidePaused(true)}
              onMouseLeave={() => setSlidePaused(false)}
              onTouchStart={(e) => {
                touchX.current = e.touches[0].clientX;
                setSlidePaused(true);
              }}
              onTouchEnd={(e) => {
                if (touchX.current !== null && slides.length > 1) {
                  const dx = e.changedTouches[0].clientX - touchX.current;
                  if (Math.abs(dx) > 40) goSlide(dx < 0 ? 1 : -1);
                }
                touchX.current = null;
                setSlidePaused(false);
              }}
            >
              {slides.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  loading={i === 0 ? "eager" : "lazy"}
                  alt={i === activeSlide ? bannerTitle : ""}
                  aria-hidden={i !== activeSlide}
                  onError={() =>
                    setFailedSlides((prev) => {
                      const next = new Set(prev);
                      next.add(url);
                      return next;
                    })
                  }
                  className={`absolute inset-0 h-full w-full object-cover object-[70%_center] transition-opacity duration-700 ${
                    i === activeSlide ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
            </div>
            <span
              className="absolute inset-0 bg-gradient-to-r from-[#EDF7F0] via-[#EDF7F0]/60 to-transparent lg:via-[#EDF7F0]/45"
              aria-hidden="true"
            />
            <div className="relative z-10 mx-auto flex h-[210px] w-full max-w-[1360px] items-center px-4 sm:h-[240px] lg:h-[300px]">
              <div className="animate-card-rise max-w-xl">
                <h1 className="text-3xl font-bold text-brand-dark sm:text-4xl">{bannerTitle}</h1>
                <p className="mt-3 text-sm leading-relaxed text-neutral-700 lg:text-base">{bannerDescription}</p>
              </div>
            </div>
            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="আগের ব্যানার"
                  onClick={() => goSlide(-1)}
                  className="absolute left-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-brand-dark shadow transition hover:bg-white lg:flex"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="m14.5 5.5-6 6.5 6 6.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="পরের ব্যানার"
                  onClick={() => goSlide(1)}
                  className="absolute right-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-brand-dark shadow transition hover:bg-white lg:flex"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="m9.5 5.5 6 6.5-6 6.5" />
                  </svg>
                </button>
                <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
                  {slides.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      aria-label={`ব্যানার ${i + 1}`}
                      aria-current={i === activeSlide}
                      onClick={() => setSlideIndex(i)}
                      className={`h-2 rounded-full shadow transition-all ${
                        i === activeSlide ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="relative mx-auto w-full max-w-[1360px] px-4 py-10 sm:py-12">
            <div className="animate-card-rise">
              <h1 className="text-3xl font-bold text-brand-dark sm:text-4xl">{bannerTitle}</h1>
              <p className="mt-3 max-w-2xl leading-relaxed text-neutral-600">{bannerDescription}</p>
            </div>
          </div>
        )}
      </section>

      <div className="mx-auto w-full max-w-[1360px] px-4">
        {/* Breadcrumb */}
        <nav aria-label="ব্রেডক্রাম্ব" className="mt-3 flex items-center gap-1.5 px-1 py-1 text-sm text-neutral-600">
          <Link to="/" className="flex items-center gap-1.5 font-medium text-brand-dark hover:underline">
            <IconHome className="h-4 w-4" />
            হোম
          </Link>
          <IconChevronRight className="h-3.5 w-3.5 text-neutral-400" />
          <span className="font-semibold text-neutral-700">সদস্য ও কমিটি</span>
        </nav>

        {error && (
          <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {/* Toolbar: tabs + search + year filter + reset */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-200/80">
          <div className="flex w-full gap-2 lg:w-auto">
            <button type="button" className={tabClass(activeTab === "members")} onClick={() => goToSection("members")}>
              <IconUsers className="h-4.5 w-4.5" />
              সদস্য ({toBn(members.length)})
            </button>
            <button type="button" className={tabClass(activeTab === "committee")} onClick={() => goToSection("committee")}>
              <IconUsers className="h-4.5 w-4.5" />
              কমিটি ({toBn(committee.length)})
            </button>
          </div>
          <div className="relative min-w-[210px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <IconSearch className="h-4.5 w-4.5" />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeTab === "committee" ? "নাম বা পদবি দিয়ে খুঁজুন..." : "নাম বা মোবাইল নম্বর দিয়ে খুঁজুন..."}
              aria-label={activeTab === "committee" ? "নাম বা পদবি দিয়ে খুঁজুন" : "নাম বা মোবাইল নম্বর দিয়ে খুঁজুন"}
              className="h-11 w-full rounded-lg border border-neutral-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </div>
          <select value={year} onChange={(e) => setYear(e.target.value)} className={`${selectClass} ${activeTab === "committee" ? "hidden lg:block" : ""}`} aria-label="যোগদানের বছর">
            <option value="all">সব বছর</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>{toBn(y)}</option>
            ))}
          </select>
          <select value={committeeRole} onChange={(e) => setCommitteeRole(e.target.value)} className={`${selectClass} ${activeTab === "members" ? "hidden lg:block" : ""}`} aria-label="পদবি ফিল্টার">
            <option value="all">সব পদবি</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetAll}
            className="flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-neutral-600 ring-1 ring-neutral-300 transition hover:bg-brand-light hover:text-brand-dark"
          >
            <IconFilter className="h-4 w-4" />
            রিসেট
          </button>
        </div>

        {/* Members FIRST (owner's settled order) */}
        <section ref={membersRef} aria-label="সদস্য" className={`mb-10 mt-8 scroll-mt-24 lg:mb-14 lg:mt-10 ${activeTab !== "members" ? "hidden" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="সদস্য" total={members.length} />
            <span className="flex items-center gap-2">
              <select value={memberSort} onChange={(e) => setMemberSort(e.target.value as typeof memberSort)} className={selectClass} aria-label="সদস্য সাজানো">
                <option value="new">সাম্প্রতিক যোগদান (নতুন)</option>
                <option value="old">আগে যোগদান (পুরনো)</option>
                <option value="name">নাম (A–Z)</option>
                <option value="nameDesc">নাম (Z–A)</option>
              </select>
              <IconSliders className="h-5 w-5 shrink-0 text-neutral-500" />
            </span>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
          ) : members.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
              সদস্য তালিকা এখনো প্রকাশ করা হয়নি।
            </p>
          ) : filteredMembers.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
              কোনো ফলাফল পাওয়া যায়নি — অন্য নাম বা নম্বর দিয়ে চেষ্টা করুন।
            </p>
          ) : (
            <>
              <ul className="mt-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
                {pagedMembers.map((m: PublicMember, i) => {
                  const y = yearOf(m.joined_date);
                  return (
                    <PersonCard
                      key={m.id}
                      name={m.name}
                      photoUrl={m.photo_url}
                      phone={m.phone}
                      facebookUrl={m.facebook_url}
                      meta={y ? `সদস্য: ${toBn(y)} থেকে` : null}
                      chip="সাধারণ সদস্য"
                      variant="member"
                      index={i}
                    />
                  );
                })}
              </ul>
              <Pagination page={safeMemberPage} totalPages={memberTotalPages} onChange={setMemberPage} />
            </>
          )}
        </section>

        {/* Committee — shown only when its tab is selected */}
        <section ref={committeeRef} aria-label="কমিটি" className={`mb-10 mt-10 scroll-mt-24 lg:mb-14 lg:mt-12 ${activeTab !== "committee" ? "hidden" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="কমিটি" total={committee.length} />
            <span className="flex items-center gap-2">
              <select value={committeeSort} onChange={(e) => setCommitteeSort(e.target.value as typeof committeeSort)} className={selectClass} aria-label="কমিটি সাজানো">
                <option value="order">পদক্রম অনুযায়ী</option>
                <option value="name">নাম (A–Z)</option>
                <option value="nameDesc">নাম (Z–A)</option>
              </select>
              <IconSliders className="h-5 w-5 shrink-0 text-neutral-500" />
            </span>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
          ) : committee.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
              বর্তমান কমিটির তালিকা এখনো প্রকাশ করা হয়নি।
            </p>
          ) : filteredCommittee.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
              কোনো ফলাফল পাওয়া যায়নি — অন্য নাম বা নম্বর দিয়ে চেষ্টা করুন।
            </p>
          ) : (
            <>
              <ul className="mt-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
                {pagedCommittee.map((c: CommitteeMember, i) => (
                  <PersonCard
                    key={c.id}
                    name={c.name}
                    photoUrl={c.photo_url}
                    phone={c.phone}
                    facebookUrl={c.facebook_url}
                    meta={termMeta}
                    chip={c.role_title}
                    variant="committee"
                    index={i}
                  />
                ))}
              </ul>
              <Pagination page={safeCommitteePage} totalPages={committeeTotalPages} onChange={setCommitteePage} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
