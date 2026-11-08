import { useMemo, useState } from "react";
import CricketPlayerCard from "../../components/CricketPlayerCard";
import EmptyState from "../../components/home/EmptyState";
import SectionHeading from "../../components/home/SectionHeading";
import { ORGANIZATION } from "../../config/organization";
import { CRICKET_ROLES, positionGroupOf } from "../../config/positions";
import { useCricketSettings } from "../../hooks/useCricketSettings";
import { useCricketSquad } from "../../hooks/useCricketPlayers";
import { formatSeasonLabel } from "../../utils/format";

/**
 * Cricket Squad — Reference Panel 05, mirroring the football squad:
 * team name + current season from the database settings, player
 * search, playing-role filter tabs (no counts shown — the owner's
 * rule: the public site displays no tallies), and a card grid in
 * Admin-set custom order. Only Published +
 * Active + unarchived players are read — no sample players exist.
 */
export default function CricketPage() {
  const { players } = useCricketSquad();
  const settings = useCricketSettings();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");

  // Team identity header (owner's order, 2026-11-02 — cricket
  // parity with the football page): the cricket team's own logo
  // from the Admin Panel (migration 0042), or the organization
  // logo until one is set.
  const logoSrc = settings.teamLogoUrl ?? `${import.meta.env.BASE_URL}${ORGANIZATION.logoPath}`;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (group !== "all" && positionGroupOf(p.position, CRICKET_ROLES) !== group) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.jersey_no !== null && String(p.jersey_no).includes(q))
      );
    });
  }, [players, query, group]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="sr-only">{settings.teamName}</h1>

      <div className="np-card overflow-hidden">
        <span className="np-gold-line" aria-hidden="true" />
        <div className="bg-gradient-to-r from-brand-dark via-brand to-brand-dark px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-lg sm:h-32 sm:w-32">
              <img src={logoSrc} alt="টিমের লোগো" className="max-h-full max-w-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gold sm:text-sm">
                {ORGANIZATION.nameBn}
              </span>
              <span className="mt-1 block text-2xl leading-tight font-extrabold text-white sm:text-4xl">
                {settings.teamName}
              </span>
              <span className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white sm:text-sm">
                  গ্রাম: {ORGANIZATION.villageNameBn}
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white sm:text-sm">
                  মৌসুম: {formatSeasonLabel(settings.currentSeason)}
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="cricket-player-search" className="sr-only">
          প্লেয়ারের নাম খুঁজুন
        </label>
        <input
          id="cricket-player-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="প্লেয়ারের নাম খুঁজুন..."
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-neutral-400 focus:border-brand"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="ভূমিকা অনুযায়ী ফিল্টার">
        <button
          type="button"
          role="tab"
          aria-selected={group === "all"}
          onClick={() => setGroup("all")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
            group === "all" ? "bg-brand text-white" : "bg-brand-light text-brand-dark hover:bg-brand/10"
          }`}
        >
          সব প্লেয়ার
        </button>
        {CRICKET_ROLES.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={group === g.key}
            onClick={() => setGroup(g.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              group === g.key ? "bg-brand text-white" : "bg-brand-light text-brand-dark hover:bg-brand/10"
            }`}
          >
            {g.labelBn}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {players.length === 0 ? (
          <EmptyState message="এখনো কোনো ক্রিকেট প্লেয়ার যোগ করা হয়নি। প্লেয়ারের তথ্য যোগ হলে এখানে দেখানো হবে।" />
        ) : visible.length === 0 ? (
          <EmptyState message="এই খোঁজে কোনো প্লেয়ার পাওয়া যায়নি।" />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => (
              <CricketPlayerCard key={p.id} player={p} cardStats={settings.cardStats} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        <SectionHeading title="টিমের তথ্য" />
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-neutral-700">
          স্কোয়াডের প্রতিটি প্লেয়ারের নাম, ভূমিকা, ব্যাটিং ও বোলিং ধরন, জার্সি নম্বর ও
          পরিসংখ্যান Admin Panel থেকে যোগ ও হালনাগাদ করা হয়। কোনো প্লেয়ারের কার্ডে ক্লিক
          করলে তার পূর্ণ প্রোফাইল, মৌসুমভিত্তিক ব্যাটিং-বোলিং পরিসংখ্যান ও ম্যাচ ইতিহাস দেখা যাবে।
        </p>
      </div>
    </section>
  );
}
