import { useMemo, useState } from "react";
import PlayerCard from "../../components/PlayerCard";
import EmptyState from "../../components/home/EmptyState";
import SectionHeading from "../../components/home/SectionHeading";
import { FOOTBALL_POSITIONS, positionGroupOf } from "../../config/positions";
import { ORGANIZATION } from "../../config/organization";
import { useFootballSettings } from "../../hooks/useFootballSettings";
import { useFootballSquad } from "../../hooks/usePlayers";
import { formatSeasonLabel } from "../../utils/format";

/**
 * Football — team-first view (owner's instruction, 2026-10-26).
 * The page opens with ONE team card: the team logo in a square
 * 1:1 frame (96px on mobile, 128px on desktop — the international
 * crest standard; the team's own logo from the Admin Panel, or
 * the organization logo until one is set), the team name, the
 * village name and the current season. Tapping the card opens
 * the full squad below it: search, position filters (no counts
 * shown — the owner's rule: the public site displays no tallies)
 * and the player-card grid (portrait 4:5 cards). Players come
 * from the Admin-managed `players` table; with no players yet an
 * honest empty state shows — no sample players are ever shown.
 */
export default function FootballPage() {
  const { players } = useFootballSquad();
  const settings = useFootballSettings();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [squadOpen, setSquadOpen] = useState(false);

  const logoSrc = settings.teamLogoUrl ?? `${import.meta.env.BASE_URL}${ORGANIZATION.logoPath}`;
  const hasPlayers = players.length > 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (group !== "all" && positionGroupOf(p.position, FOOTBALL_POSITIONS) !== group) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.jersey_no !== null && String(p.jersey_no).includes(q))
      );
    });
  }, [players, query, group]);

  const teamIdentity = (
    <div className="bg-gradient-to-r from-brand-dark via-brand to-brand-dark px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-lg sm:h-32 sm:w-32">
          <img src={logoSrc} alt="টিমের লোগো" className="max-h-full max-w-full object-contain" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gold sm:text-sm">
            {ORGANIZATION.nameBn}
          </span>
          <span className="mt-1 block leading-tight text-2xl font-extrabold text-white sm:text-4xl">
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
          {hasPlayers && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-brand-dark">
              {squadOpen ? "টিম লুকান" : "পুরো টিম দেখুন"}
              <span aria-hidden="true">{squadOpen ? "▲" : "▼"}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="sr-only">{settings.teamName}</h1>

      <div className="np-card overflow-hidden">
        <span className="np-gold-line" aria-hidden="true" />
        {hasPlayers ? (
          <button
            type="button"
            onClick={() => setSquadOpen((o) => !o)}
            aria-expanded={squadOpen}
            aria-controls="football-squad"
            className="block w-full text-left"
          >
            {teamIdentity}
          </button>
        ) : (
          teamIdentity
        )}
      </div>

      {!hasPlayers ? (
        <div className="mt-6">
          <EmptyState message="এখনো কোনো ফুটবল প্লেয়ার যোগ করা হয়নি। প্লেয়ারের তথ্য যোগ হলে এখানে দেখানো হবে।" />
        </div>
      ) : squadOpen ? (
        <div id="football-squad" className="mt-6">
          <div>
            <label htmlFor="player-search" className="sr-only">
              প্লেয়ারের নাম খুঁজুন
            </label>
            <input
              id="player-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="প্লেয়ারের নাম খুঁজুন..."
              className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-neutral-400 focus:border-brand"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="পজিশন অনুযায়ী ফিল্টার">
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
            {FOOTBALL_POSITIONS.map((g) => (
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
            {visible.length === 0 ? (
              <EmptyState message="এই খোঁজে কোনো প্লেয়ার পাওয়া যায়নি।" />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {visible.map((p) => (
                  <PlayerCard key={p.id} player={p} cardStats={settings.cardStats} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-10">
        <SectionHeading title="টিমের তথ্য" />
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-neutral-700">
          স্কোয়াডের প্রতিটি প্লেয়ারের নাম, পজিশন, জার্সি নম্বর ও পরিসংখ্যান Admin Panel থেকে
          যোগ ও হালনাগাদ করা হয়। কোনো প্লেয়ারের কার্ডে ক্লিক করলে তার পূর্ণ প্রোফাইল,
          ক্যারিয়ার পরিসংখ্যান ও ম্যাচ ইতিহাস দেখা যাবে।
        </p>
      </div>
    </section>
  );
}
