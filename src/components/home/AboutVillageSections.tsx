import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import { ABOUT_TEXT } from "../../config/homepage";
import { useSiteSettings } from "../../hooks/useSiteSettings";

/** Section 2 — short organization intro (facts provided by the organization only). */
export function AboutSection({ headingTitle }: { headingTitle?: string }) {
  const settings = useSiteSettings();
  return (
    <section aria-label="সংগঠন পরিচিতি" className="mx-auto w-full max-w-7xl px-4 pt-12">
      <SectionHeading title={headingTitle ?? "সংগঠন পরিচিতি"} linkTo="/village-profile" linkLabel="বিস্তারিত" />
      <div className="grid items-center gap-6 lg:grid-cols-[1fr_360px]">
        <p className="leading-relaxed text-neutral-700">{ABOUT_TEXT}</p>
        <div className="flex items-center gap-4 rounded-2xl bg-brand-light p-5">
          <img loading="lazy" src={settings.logoPath} alt="" className="h-16 w-16 shrink-0 object-contain" />
          <div>
            <p className="font-bold text-brand-dark">{settings.nameBn}</p>
            <p className="text-xs text-neutral-500">{settings.nameEn}</p>
            {settings.address && <p className="mt-1 text-sm text-neutral-600">{settings.address}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Section 3 — village preview. Every tile is a part of the address the organization provided. */
const VILLAGE_TILES = [
  { label: "গ্রাম", value: "নগর পাড়া" },
  { label: "উপজেলা", value: "তাড়াশ" },
  { label: "জেলা", value: "সিরাজগঞ্জ" },
  { label: "দেশ", value: "বাংলাদেশ" },
];

export function VillageSection({ headingTitle }: { headingTitle?: string }) {
  return (
    <section aria-label="গ্রাম পরিচিতি" className="mx-auto w-full max-w-7xl px-4 pt-12">
      <SectionHeading title={headingTitle ?? "গ্রাম পরিচিতি"} linkTo="/village-profile" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {VILLAGE_TILES.map((tile) => (
          <div key={tile.label} className="np-card np-card-hover p-5 text-center">
            <p className="text-xs font-medium text-neutral-500">{tile.label}</p>
            <p className="mt-1 text-lg font-bold text-brand">{tile.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-neutral-600">
        গ্রামের ইতিহাস, গুরুত্বপূর্ণ স্থান ও ছবি দেখতে{" "}
        <Link to="/village-profile" className="font-semibold text-brand hover:text-brand-dark">
          গ্রাম পরিচিতি পেজে যান
        </Link>
      </p>
    </section>
  );
}
