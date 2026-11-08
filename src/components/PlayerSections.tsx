import type {
  PlayerProfileSection,
  PlayerSectionItem,
} from "../types/database.types";
import { safeHttpUrl } from "../utils/safeUrl";

/**
 * Public rendering of a player's dynamic profile sections
 * (migration 0009). Media sections are NOT rendered here — they feed
 * the profile (retired Gallery tab, owner decision 2026-10-27), so a photo is
 * never shown twice. A section with no renderable content (empty
 * body, no usable items, only unsafe URLs) renders nothing at all:
 * the public page never shows an empty shell. When a player has no
 * sections, this component returns null and the profile looks
 * exactly as it did before Phase 3.
 */

function usableItems(section: PlayerProfileSection): PlayerSectionItem[] {
  return (section.items ?? []).filter((it) =>
    [it.label, it.value, it.title, it.year, it.period, it.description, it.url, it.caption].some(
      (v) => (v ?? "").trim() !== "",
    ),
  );
}

function hasContent(section: PlayerProfileSection): boolean {
  if (section.section_type === "media") return false;
  if (section.section_type === "text") return (section.body ?? "").trim() !== "";
  if (section.section_type === "links")
    return usableItems(section).some((it) => safeHttpUrl(it.url) !== null);
  return usableItems(section).length > 0;
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="np-card p-5">
      <h2 className="text-lg font-bold text-brand-dark">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function PlayerSections({ sections }: { sections: PlayerProfileSection[] }) {
  const visible = sections.filter(hasContent);
  if (visible.length === 0) return null;
  return (
    <div className="mt-8 space-y-4">
      {visible.map((section) => {
        const items = usableItems(section);
        switch (section.section_type) {
          case "text":
            return (
              <SectionShell key={section.id} title={section.title}>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-700">
                  {section.body}
                </p>
              </SectionShell>
            );
          case "info_fields":
            return (
              <SectionShell key={section.id} title={section.title}>
                <dl className="grid gap-x-8 gap-y-2 text-[15px] text-neutral-700 sm:grid-cols-2">
                  {items
                    .filter((it) => (it.label ?? "").trim() || (it.value ?? "").trim())
                    .map((it, i) => (
                      <div key={i} className="flex gap-2">
                        <dt className="w-32 shrink-0 font-semibold text-brand-dark">{it.label}</dt>
                        <dd>{it.value}</dd>
                      </div>
                    ))}
                </dl>
              </SectionShell>
            );
          case "achievements":
            return (
              <SectionShell key={section.id} title={section.title}>
                <ul className="space-y-3">
                  {items.map((it, i) => (
                    <li key={i} className="flex gap-3">
                      {it.year && (
                        <span className="h-fit shrink-0 rounded-full bg-gold/30 px-2.5 py-0.5 text-xs font-bold text-brand-dark">
                          {it.year}
                        </span>
                      )}
                      <span>
                        {it.title && <span className="block font-semibold text-brand-dark">{it.title}</span>}
                        {it.description && (
                          <span className="block text-sm leading-relaxed text-neutral-600">{it.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionShell>
            );
          case "career":
            return (
              <SectionShell key={section.id} title={section.title}>
                <ul className="space-y-3">
                  {items.map((it, i) => (
                    <li key={i} className="border-l-2 border-brand/30 pl-3">
                      {it.period && <span className="block text-xs font-bold text-brand">{it.period}</span>}
                      {it.title && <span className="block font-semibold text-brand-dark">{it.title}</span>}
                      {it.description && (
                        <span className="block text-sm leading-relaxed text-neutral-600">{it.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionShell>
            );
          case "links":
            return (
              <SectionShell key={section.id} title={section.title}>
                <ul className="flex flex-wrap gap-2">
                  {items.map((it, i) => {
                    const href = safeHttpUrl(it.url);
                    if (!href) return null;
                    return (
                      <li key={i}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand hover:text-white"
                        >
                          {it.label?.trim() ? it.label : href} ↗
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </SectionShell>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
