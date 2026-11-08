import { Link } from "react-router-dom";

interface SectionHeadingProps {
  title: string;
  linkTo?: string;
  linkLabel?: string;
  /** Heading level — "h2" everywhere by default; a standalone page
   *  whose title this is (e.g. /finance, v180 D4) passes "h1" so the
   *  page has a proper top-level heading. Appearance is identical. */
  as?: "h1" | "h2";
}

/** Shared homepage section heading: title + gold rule + optional "see all" link to a real route. */
export default function SectionHeading({ title, linkTo, linkLabel = "সব দেখুন", as = "h2" }: SectionHeadingProps) {
  const HeadingTag = as;
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <HeadingTag className="text-xl font-bold text-brand-dark sm:text-2xl">
        {title}
        <span className="mt-1.5 block h-1 w-14 rounded bg-gold" aria-hidden="true" />
      </HeadingTag>
      {linkTo && (
        <Link to={linkTo} className="shrink-0 text-sm font-semibold text-brand hover:text-brand-dark">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
