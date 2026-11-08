import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SectionHeading from "../../components/home/SectionHeading";
import EmptyState from "../../components/home/EmptyState";
import { useVillageSections, type VillageSectionRow } from "../../hooks/useVillageSections";
import { useVillageCategories, FALLBACK_VILLAGE_CATEGORIES } from "../../hooks/useVillageCategories";
import VillagePhotosBlock from "../../components/public/VillagePhotosBlock";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { usePublicVillageBanners, type VillageBannerSlide } from "../../hooks/usePublicVillageBanners";
import { useVillageLocationPublic } from "../../hooks/useVillageLocation";
import { safeHttpUrl } from "../../utils/safeUrl";
import type { VillageCategory } from "../../types/database.types";
import { ABOUT_TEXT } from "../../config/homepage";

/**
 * Village Profile & History — Phase 5 (Reference Panel 02).
 *
 * Content rules (strict): only facts the organization has confirmed are
 * written — the village name and the address (নগর পাড়া, তাড়াশ,
 * সিরাজগঞ্জ, বাংলাদেশ). History, important places and nature have NO
 * confirmed details yet, so they show explicit empty states instead of
 * invented text.
 *
 * Owner decision 2026-10-27: the Gallery section was retired
 * everywhere (website + Admin Panel) — this page no longer renders
 * a gallery strip; the village banner above is unaffected.
 *
 * Admin path: published rows of the existing `village_sections` table
 * (title / content / image_url / display_order / is_published) replace
 * the default content sections below — no new schema was needed.
 *
 * Block routing (Phase V-1D, on migration 0022): each row carries an
 * `area` — one of this page's own anchor ids — and renders inside
 * that block (পরিচিতি / ইতিহাস / স্থান / প্রকৃতি / কার্যক্রম). A block
 * with no published rows of its own keeps exactly the default or
 * empty-state content it has always shown. Rows stored before the
 * column existed are 'porichiti', where they always rendered.
 *
 * Category routing (migration 0054): the chips and sections
 * themselves — label, heading, kind, order, published flag — are
 * rows of `village_categories`, managed from Admin ক্যাটাগরি
 * পরিচালনা. Until that migration is live (or the table is
 * empty) the hook returns null and the page renders
 * FALLBACK_VILLAGE_CATEGORIES: the same eight categories, in the
 * same order, with the same labels, headings and blocks as
 * before — so nothing changes for a visitor.
 */

/* The অবস্থান tiles' values come from useVillageLocationPublic
 * (Admin অবস্থান ও ঠিকানা, migration 0034); the hook itself
 * carries these same confirmed facts as its built-in defaults. */

/** Objectives from the organization's own Master Prompt (Phase 1). */
const OBJECTIVES = [
  "গ্রামের ফুটবল ও ক্রিকেট টিম পরিচালনা এবং প্লেয়ারদের সঠিক পরিচিতি ও পরিসংখ্যান সংরক্ষণ করা।",
  "খেলাধুলা ও সামাজিক কার্যক্রমের মাধ্যমে গ্রামের যুবসমাজকে সংগঠিত করা।",
  "সংগঠনের কার্যক্রম, সংবাদ ও নোটিশ সবার কাছে পৌঁছে দেওয়া।",
  "সদস্যদের চাঁদা, অনুদান ও ব্যয়ের হিসাব স্বচ্ছ ও যাচাইযোগ্যভাবে রাখা।",
];

function AnchorNav({ anchors }: { anchors: { id: string; label: string }[] }) {
  // NOTE: plain <a href="#id"> anchors cannot be used here — the app
  // uses HashRouter, so changing location.hash would be read as a
  // route change. Buttons + scrollIntoView scroll within the page
  // without touching the URL.
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <nav aria-label="এই পেজের বিভাগ" className="sticky top-[104px] z-40 -mx-4 overflow-x-auto bg-white/95 px-4 py-2 backdrop-blur lg:top-[121px]">
      <div className="flex gap-1.5 whitespace-nowrap text-sm">
        {anchors.map((anchor) => (
          <button
            key={anchor.id}
            type="button"
            onClick={() => scrollTo(anchor.id)}
            className="rounded-full bg-brand-light px-3.5 py-1.5 font-medium text-brand-dark hover:bg-brand hover:text-white"
          >
            {anchor.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function SectionShell({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-36 pt-10">
      <SectionHeading title={title} />
      {children}
    </section>
  );
}

/** One block's published sections, in the page's article layout. */
function SectionArticles({ sections }: { sections: VillageSectionRow[] }) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <article key={section.id}>
          <h3 className="text-lg font-bold text-brand-dark">{section.title}</h3>
          {section.image_url && (
            <img src={section.image_url} alt="" className="mt-3 aspect-[16/7] w-full rounded-2xl object-cover" loading="lazy" />
          )}
          {section.video_url && (
            <video
              src={section.video_url}
              controls
              preload="metadata"
              className="mt-3 aspect-video w-full rounded-2xl bg-black object-contain"
            />
          )}
          {section.content && <p className="mt-2 whitespace-pre-line leading-relaxed text-neutral-700">{section.content}</p>}
        </article>
      ))}
    </div>
  );
}

/** A banner CTA link resolves to an internal route ("/ দিয়ে
 * শুরু" — rendered with the router's Link) or a safe external
 * http(s) URL; anything else renders no button at all. */
function ctaTarget(link: string | null): { internal: string } | { external: string } | null {
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return { internal: link };
  const ext = safeHttpUrl(link);
  return ext ? { external: ext } : null;
}

/** True when a slide carries text that should replace the
 * static heading block: the visibility switch is on AND there
 * is something to show (a heading, a description, or a complete
 * CTA). A slide with no visible text never renders an empty
 * text container — the static block shows instead. */
function slideHasVisibleText(slide: VillageBannerSlide): boolean {
  if (!slide.showText) return false;
  return Boolean(
    slide.heading || slide.description || (slide.ctaText && ctaTarget(slide.ctaLink)),
  );
}

/** Small stroke icons for the অবস্থান tiles + address bar
 * (owner's order, 2026-10-29: a prettier template with hover).
 * No icon library in this project — simple inline SVGs in the
 * site's own style. */
const LOCATION_ICON_PATHS: Record<string, React.ReactNode> = {
  village: (
    <>
      <path d="M3 11.2 12 3l9 8.2" />
      <path d="M5.2 9.8V21h13.6V9.8" />
      <path d="M9.6 21v-5.4h4.8V21" />
    </>
  ),
  upazila: (
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M5 9.5V18M9.7 9.5V18M14.3 9.5V18M19 9.5V18" />
      <path d="M3 21h18M3 18h18" />
    </>
  ),
  district: (
    <>
      <path d="M9 4 3 6.2v13.3L9 17.3l6 2.2 6-2.2V4L15 6.2 9 4Z" />
      <path d="M9 4v13.3M15 6.2v13.3" />
    </>
  ),
  country: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5s1.3-6.2 3.9-8.5Z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.2S5 15.4 5 9.9a7 7 0 1 1 14 0c0 5.5-7 11.3-7 11.3Z" />
      <circle cx="12" cy="9.9" r="2.6" />
    </>
  ),
};

function LocationIcon({ kind, className = "h-6 w-6" }: { kind: string; className?: string }) {
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
      {LOCATION_ICON_PATHS[kind]}
    </svg>
  );
}

export default function VillageProfilePage() {
  const settings = useSiteSettings();
  const dbSections = useVillageSections();
  const location = useVillageLocationPublic();
  const sliderBanners = usePublicVillageBanners();
  const locationTiles = [
    { label: "গ্রাম", value: location.villageName, icon: "village" },
    { label: "উপজেলা", value: location.upazilaName, icon: "upazila" },
    { label: "জেলা", value: location.districtName, icon: "district" },
    { label: "দেশ", value: location.countryName, icon: "country" },
  ];

  /* Settings banner photo (Phase VG-2D, migration 0023): when
   * the admin has set a banner photo it renders behind the SAME
   * gradient (kept as an overlay, so the design and text
   * contrast do not change); no URL — or a URL that fails to
   * load (VG2D-R4) — leaves the gradient-only banner exactly as
   * before. Since migration 0057 this single photo is the
   * FALLBACK: it shows only when no slider banner is published. */
  const settingsBannerUrl = ((): string | null => {
    const raw = settings.villageBannerUrl?.trim();
    if (!raw) return null;
    const absolute = safeHttpUrl(raw);
    if (absolute) return absolute;
    /* A bundled relative path (e.g. "banner.jpg" from public/)
     * is allowed too — the same way the Members page banner
     * treats its Settings photo (2026-10-29). Anything carrying
     * a non-http(s) scheme stays blocked. */
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.startsWith("//")
      ? null
      : raw;
  })();

  /* Banner slider (migration 0057, owner's order 2026-11-05 —
   * the Members page banner model of migration 0032): the
   * PUBLISHED `village_page_banners` rows rotate here as a
   * crossfade slider, pausing while the visitor hovers or
   * touches the banner. When none are published — including
   * before the migration is live — the slides are just the
   * single Settings photo above; with neither, there are no
   * slides and the banner renders gradient-only, exactly as
   * before. A slide whose photo fails to load drops out, like
   * the Members slider.
   *
   * Owner's "Complete Banner & Media Enhancement" spec
   * (2026-11-05) for THIS page only: the village slider advances
   * every 3 seconds (the Members/Home sliders keep their own
   * 5 seconds), loops from the last slide back to the first,
   * and — whenever there are 2+ slides — offers the Members
   * pattern of prev/next arrows, pagination dots and touch
   * swipe. One slide stays fully static. The frame is a FIXED
   * height (188px mobile / 224px from sm up — the exact size
   * this banner has always rendered at, since its height used
   * to come from the heading block's padding) so every slide
   * has identical dimensions and changing slides never shifts
   * the layout.
   *
   * Each slide may carry its own text (migration 0058): when
   * the ACTIVE slide has visible text, that text — left-aligned
   * heading, description and an optional CTA button — replaces
   * the static heading block for that slide; a slide without
   * visible text shows the static block (আমাদের গ্রাম / নগর
   * পাড়া / ঠিকানা) exactly as before. */
  const settingsSlide: VillageBannerSlide | null = settingsBannerUrl
    ? { url: settingsBannerUrl, heading: null, description: null, ctaText: null, ctaLink: null, showText: false }
    : null;
  const allSlides = sliderBanners.length > 0 ? sliderBanners : settingsSlide ? [settingsSlide] : [];
  const [failedSlides, setFailedSlides] = useState<ReadonlySet<string>>(new Set());
  const slides = allSlides.filter((s) => !failedSlides.has(s.url));
  const [slideIndex, setSlideIndex] = useState(0);
  const [slidePaused, setSlidePaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const activeSlide = slides.length > 0 ? slideIndex % slides.length : 0;
  const activeHasText = slides.length > 0 && slideHasVisibleText(slides[activeSlide]);
  useEffect(() => {
    if (slides.length <= 1 || slidePaused) return;
    const t = setInterval(() => setSlideIndex((i) => (i + 1) % slides.length), 3000);
    return () => clearInterval(t);
  }, [slides.length, slidePaused, slideIndex]);
  const goSlide = (dir: 1 | -1) =>
    setSlideIndex((i) => (i + dir + slides.length) % Math.max(slides.length, 1));

  /* Categories drive the chips and the sections (migration
   * 0054); until the table is live the fallback list renders
   * the page exactly as before. */
  const dbCategories = useVillageCategories();
  const categories = dbCategories ?? FALLBACK_VILLAGE_CATEGORIES;

  /** Published rows routed to one category (empty when none). */
  const rowsFor = (key: string): VillageSectionRow[] =>
    (dbSections ?? []).filter((s) => (s.area as string) === key);

  /** One category's block body. The built-in blocks keep their
   * exact content (defaults, empty states, tiles, cards) —
   * keyed by the category key; a new Admin-created category
   * shows its published sections, or an honest empty state. */
  const blockBody = (cat: VillageCategory): React.ReactNode => {
    if (cat.kind === "location") {
      /* অবস্থান ও ঠিকানা — confirmed facts only. Template
          upgraded at the owner's order (2026-10-29): icon tiles
          with the site's gold-line + hover lift, and the full
          address as a highlighted pin bar. Values stay
          Admin-driven (migration 0034); 2 tiles per row on
          mobile, 4 on desktop. */
      return (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {locationTiles.map((tile) => (
              <div
                key={tile.label}
                className="group np-card np-card-hover relative overflow-hidden p-5 pt-6 text-center"
              >
                <span className="np-gold-line absolute inset-x-0 top-0" aria-hidden="true" />
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand-dark transition-colors duration-300 group-hover:bg-brand group-hover:text-white">
                  <LocationIcon kind={tile.icon} />
                </span>
                <p className="mt-3 text-xs font-medium tracking-wide text-neutral-500">{tile.label}</p>
                <p className="mt-1 text-lg font-bold text-brand-dark sm:text-xl">{tile.value}</p>
              </div>
            ))}
          </div>
          {settings.address && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand/15 bg-brand-light/60 px-4 py-3.5 transition-shadow duration-300 hover:shadow-[0_10px_24px_rgba(23,98,61,0.14)] sm:gap-4 sm:px-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                <LocationIcon kind="pin" className="h-5.5 w-5.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-500">পূর্ণ ঠিকানা</p>
                <p className="mt-0.5 font-semibold leading-snug text-brand-dark">{settings.address}</p>
              </div>
            </div>
          )}
        </>
      );
    }
    if (cat.kind === "photos") {
      /* গ্রামের ছবি — the published "গ্রামের ছবি" gallery album
          (Admin গ্রামের পরিচিতি গ্রামের ছবি), grid + viewer */
      return <VillagePhotosBlock />;
    }
    const rows = rowsFor(cat.key);
    if (cat.kind === "places") {
      /* গুরুত্বপূর্ণ স্থান — Admin-published places, else the honest empty state */
      return rows.length > 0 ? (
        <SectionArticles sections={rows} />
      ) : (
        <EmptyState message="গুরুত্বপূর্ণ স্থান ও স্থাপনার তালিকা এখনো যোগ করা হয়নি। তথ্য পাওয়া গেলে ছবি ও বিবরণসহ এখানে দেখা যাবে।" />
      );
    }
    switch (cat.key) {
      case "porichiti":
        /* পরিচিতি — default confirmed-facts text, or this block's Admin-published sections */
        return rows.length > 0 ? (
          <SectionArticles sections={rows} />
        ) : (
          <p className="max-w-3xl leading-relaxed text-neutral-700">
            নগর পাড়া সিরাজগঞ্জ জেলার তাড়াশ উপজেলার একটি গ্রাম। এই গ্রামের যুবকদের সংগঠন{" "}
            <strong className="text-brand-dark">{settings.nameBn}</strong> গ্রামে খেলাধুলা ও সামাজিক
            কার্যক্রম পরিচালনা করে। গ্রামের বিস্তারিত পরিচিতি সংগঠনের পক্ষ থেকে Admin Panel-এ যোগ করা
            হলে এখানে প্রকাশিত হবে।
          </p>
        );
      case "itihash":
        /* ইতিহাস — Admin-published history sections, else the honest empty state */
        return rows.length > 0 ? (
          <SectionArticles sections={rows} />
        ) : (
          <EmptyState message="গ্রামের ইতিহাস এখনো যোগ করা হয়নি। সংগঠনের কাছে নিশ্চিত তথ্য পাওয়া গেলে Admin Panel থেকে যাচাই করে এখানে প্রকাশ করা হবে — অনুমান করে কোনো ইতিহাস লেখা হয়নি।" />
        );
      case "prokriti":
        /* প্রকৃতি ও পরিবেশ — Admin-published sections replace the empty state
          and the photo placeholder (whose own text promises exactly that) */
        return rows.length > 0 ? (
          <SectionArticles sections={rows} />
        ) : (
          <>
            <EmptyState message="গ্রামের প্রকৃতি ও পরিবেশ সম্পর্কে বিস্তারিত তথ্য এখনো যোগ করা হয়নি।" />
            <div className="mt-3 rounded-xl border border-dashed border-gold-dark/60 bg-gold/10 px-4 py-6 text-center text-sm text-neutral-600">
              গ্রামের আসল ছবি এখনো দেওয়া হয়নি। আসল ছবি পাওয়া গেলে (বা Admin Panel থেকে আপলোড
              হলে) এই জায়গায় দেখানো হবে।
            </div>
          </>
        );
      case "karjokrom":
        /* কার্যক্রম — Admin-published sections, else the confirmed default text;
          the links below always stay */
        return (
          <>
            {rows.length > 0 ? (
              <SectionArticles sections={rows} />
            ) : (
              <p className="max-w-3xl leading-relaxed text-neutral-700">
                নগর পাড়া গ্রামের যুবকদের নিয়ে সংগঠনটি ফুটবল ও ক্রিকেট টিম পরিচালনা করে, ম্যাচ ও
                টুর্নামেন্টের আয়োজন করে এবং বিভিন্ন সামাজিক কার্যক্রম পরিচালনা করে। সব কার্যক্রমের খবর
                ও ছবি নিয়মিত প্রকাশ করা হয়।
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/news" className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                কার্যক্রম ও সংবাদ দেখুন
              </Link>
              <Link to="/matches" className="rounded-full bg-brand-light px-5 py-2 text-sm font-semibold text-brand-dark hover:bg-brand hover:text-white">
                ম্যাচের সময়সূচি
              </Link>
            </div>
          </>
        );
      case "songothon":
        /* সংগঠনের পরিচিতি ও উদ্দেশ্য */
        return (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Admin-published 'songothon' sections (migration 0035)
              replace the built-in পরিচিতি + উদ্দেশ্য text, the
              same pattern as every other block on this page; the
              organization card beside it is settings-driven and
              always stays. */}
            {rows.length > 0 ? (
              <SectionArticles sections={rows} />
            ) : (
              <div>
                <p className="leading-relaxed text-neutral-700">{ABOUT_TEXT}</p>
                <h3 className="mt-5 font-bold text-brand-dark">উদ্দেশ্য</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-neutral-700">
                  {OBJECTIVES.map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex h-fit items-center gap-4 rounded-2xl bg-brand-light p-5">
              <img loading="lazy" src={settings.logoPath} alt="" className="h-16 w-16 shrink-0 object-contain" />
              <div>
                <p className="font-bold text-brand-dark">{settings.nameBn}</p>
                <p className="text-xs text-neutral-500">{settings.nameEn}</p>
                {settings.address && <p className="mt-1 text-sm text-neutral-600">{settings.address}</p>}
              </div>
            </div>
          </div>
        );
      default:
        /* An Admin-created category (migration 0054): its own
           published sections, or an honest empty state. */
        return rows.length > 0 ? (
          <SectionArticles sections={rows} />
        ) : (
          <EmptyState message="এই বিভাগের তথ্য এখনো যোগ করা হয়নি। Admin Panel থেকে যোগ করা হলে এখানে প্রকাশিত হবে।" />
        );
    }
  };

  return (
    <>
      {/* Page banner — FULL WIDTH like the homepage hero (owner's
          order, 2026-10-29: it previously stopped at the 1280px
          page container, leaving white margins on wide screens).
          Brand gradient; the published slider banners (migration
          0057) — or, as fallback, the single Settings photo
          (site_settings.village_banner_url) — render behind the
          same gradient as an overlay (Phase VG-2D). */}
      <div
        className="relative h-[210px] overflow-hidden bg-gradient-to-br from-brand-dark via-brand to-brand-dark sm:h-[240px] lg:h-[300px]"
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
        {slides.map((slide, i) => (
          <img loading="lazy"
            key={`${slide.url}-${i}`}
            src={slide.url}
            alt={i === activeSlide ? (slide.heading ?? "নগর পাড়া গ্রাম পরিচিতি ব্যানার") : ""}
            aria-hidden={i !== activeSlide}
            onError={() =>
              setFailedSlides((prev) => {
                const next = new Set(prev);
                next.add(slide.url);
                return next;
              })
            }
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              i === activeSlide ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        {slides.length > 0 && (
          <div
            className="absolute inset-0 bg-gradient-to-br from-brand-dark/85 via-brand/60 to-brand-dark/85"
            aria-hidden="true"
          />
        )}
        {/* Extra left-side scrim, only while a text-bearing slide
            is active, so the banner text keeps its contrast. */}
        <div
          className={`absolute inset-0 bg-gradient-to-r from-brand-dark/75 via-brand-dark/40 to-transparent transition-opacity duration-700 ${
            activeHasText ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
        />
        {/* Per-slide text (migration 0058): each text-bearing
            slide's own block, stacked and crossfaded with its
            photo; only the active slide's block is interactive. */}
        {slides.map(
          (slide, i) =>
            slideHasVisibleText(slide) && (
              <div
                key={`text-${slide.url}-${i}`}
                aria-hidden={i !== activeSlide}
                className={`absolute inset-0 flex items-center transition-opacity duration-700 ${
                  i === activeSlide ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <div className="mx-auto w-full max-w-7xl px-4 lg:px-16">
                  <div className="max-w-xl text-left">
                    {slide.heading && (
                      <h1 className="line-clamp-2 text-2xl font-extrabold leading-snug text-white sm:text-4xl">
                        {slide.heading}
                      </h1>
                    )}
                    {slide.description && (
                      <p className="mt-2 line-clamp-2 leading-relaxed text-white/90 sm:line-clamp-3 sm:text-lg">
                        {slide.description}
                      </p>
                    )}
                    {slide.ctaText &&
                      (() => {
                        const target = ctaTarget(slide.ctaLink);
                        if (!target) return null;
                        const cls =
                          "mt-4 inline-block rounded-full bg-gold px-5 py-2 text-sm font-semibold text-brand-dark transition hover:bg-white";
                        return "internal" in target ? (
                          <Link to={target.internal} className={cls}>
                            {slide.ctaText}
                          </Link>
                        ) : (
                          <a href={target.external} target="_blank" rel="noreferrer" className={cls}>
                            {slide.ctaText}
                          </a>
                        );
                      })()}
                  </div>
                </div>
              </div>
            ),
        )}
        {/* Static heading block — the fallback whenever the
            active slide carries no visible text (and when there
            are no slides at all), exactly as this banner has
            always shown it. */}
        <div
          aria-hidden={activeHasText}
          className={`absolute inset-0 flex items-center justify-center px-4 text-center transition-opacity duration-700 ${
            activeHasText ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <div>
            <p className="text-sm font-medium text-gold">আমাদের গ্রাম</p>
            <h1 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl">নগর পাড়া</h1>
            <p className="mt-2 text-white/85">{settings.address}</p>
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
              {slides.map((slide, i) => (
                <button
                  key={`dot-${slide.url}-${i}`}
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
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-14">
      <AnchorNav anchors={categories.map((c) => ({ id: c.key, label: c.label }))} />

      {categories.map((cat) => (
        <SectionShell key={cat.id} id={cat.key} title={cat.title}>
          {blockBody(cat)}
        </SectionShell>
      ))}
      </div>
    </>
  );
}
