import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { HeroConfig } from "../../config/homepage";
import { usePublicHomeBanners } from "../../hooks/usePublicHomeBanners";
import { useSiteSettings } from "../../hooks/useSiteSettings";

/**
 * Hero — from Reference Panel 01: full-width banner, big white headline
 * (the organization's own words from its reference), one-line subtitle,
 * two working CTAs. Until the organization provides a real hero photo
 * (or an admin sets one via the home_sections config), the banner uses
 * the brand-green background — no fabricated scenery photo is shown.
 * Owner decision 2026-10-27: no organization logo inside the
 * banner itself (the header already carries it) — the banner is
 * headline, subtitle and CTAs only.
 *
 * Owner's order 2026-10-29: up to THREE banner photos managed from
 * Admin ওয়েবসাইট কনটেন্ট হোমপেজ ব্যানার (migration 0033's
 * `home_page_banners`) rotate here as a slider behind the SAME
 * headline, subtitle and CTAs — exactly the arrangement the
 * Members & Committee page uses. When no banner is published,
 * the hero falls back to the single config photo, then to the
 * plain brand green — unchanged.
 */
const SLIDE_MS = 5000;

export default function HeroSection({ hero }: { hero: HeroConfig }) {
  const settings = useSiteSettings();
  const bannerUrls = usePublicHomeBanners();
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slides = bannerUrls.filter((u) => !broken.has(u));
  const hasSlides = slides.length > 0;
  const active = hasSlides ? Math.min(index, slides.length - 1) : 0;

  useEffect(() => {
    if (!hasSlides || slides.length < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [hasSlides, slides.length, paused]);

  return (
    <section
      aria-label="পরিচিতি"
      className="relative overflow-hidden bg-brand-dark"
      style={
        !hasSlides && hero.imageUrl
          ? { backgroundImage: `url(${hero.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
          : undefined
      }
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* Banner slider (published home banners) — crossfading
          photo layers behind the headline. */}
      {hasSlides &&
        slides.map((url, i) => (
          <img
            key={url}
            src={url}
            loading={i === 0 ? "eager" : "lazy"}
            alt=""
            aria-hidden="true"
            onError={() => setBroken((prev) => new Set(prev).add(url))}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              i === active ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
      {/* readability overlay / brand gradient when no photo is set */}
      <div
        className={
          hasSlides || hero.imageUrl
            ? "absolute inset-0 bg-brand-dark/60"
            : "absolute inset-0 bg-gradient-to-br from-brand-dark via-brand to-brand-dark"
        }
        aria-hidden="true"
      />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-start gap-5 px-4 py-14 sm:py-20">
        <h1 className="max-w-3xl text-3xl font-extrabold leading-snug text-white sm:text-5xl sm:leading-tight">
          {hero.title}{" "}
          <span className="text-gold">{settings.nameBn}</span>
        </h1>
        <p className="max-w-2xl text-base text-white/90 sm:text-lg">{hero.subtitle}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            to={hero.primaryCta.to}
            className="rounded-full bg-gold px-6 py-2.5 font-semibold text-brand-dark transition-colors hover:bg-gold-dark"
          >
            {hero.primaryCta.label}
          </Link>
          <Link
            to={hero.secondaryCta.to}
            className="rounded-full bg-white px-6 py-2.5 font-semibold text-brand-dark transition-colors hover:bg-brand-light"
          >
            {hero.secondaryCta.label}
          </Link>
        </div>
      </div>
      {/* Slider dots — only when more than one banner rotates. */}
      {hasSlides && slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
          {slides.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`ব্যানার ${i + 1}`}
              aria-current={i === active}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
