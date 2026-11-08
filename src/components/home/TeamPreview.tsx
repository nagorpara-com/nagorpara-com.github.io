import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import EmptyState from "./EmptyState";
import { toBn } from "../../utils/format";
import type { PlayerWithStats } from "../../hooks/useHomepageData";

interface TeamPreviewProps {
  sport: "football" | "cricket";
  players: PlayerWithStats[];
  /** Admin-edited section title (v180 A1); falls back to the built-in heading. */
  headingTitle?: string;
}

/**
 * Team preview (homepage sections 4/5) — card layout follows Reference
 * Panels 03/05: photo with jersey badge, name, position · jersey no,
 * and a stat line. Renders only real players from the database; with
 * no players yet it shows an honest empty state.
 */
export default function TeamPreview({ sport, players, headingTitle }: TeamPreviewProps) {
  const isFootball = sport === "football";
  const title = headingTitle ?? (isFootball ? "ফুটবল টিম" : "ক্রিকেট টিম");
  const listPath = isFootball ? "/football" : "/cricket";
  const statLabel = isFootball
    ? { primary: "গোল", secondary: "অ্যাসিস্ট" }
    : { primary: "রান", secondary: "উইকেট" };

  return (
    <section aria-label={title} className="mx-auto w-full max-w-7xl px-4 pt-12">
      <SectionHeading title={title} linkTo={listPath} />
      {players.length === 0 ? (
        <EmptyState message={`এখনো কোনো ${title}র প্লেয়ার যোগ করা হয়নি। Admin Panel থেকে প্লেয়ার যোগ হলে এখানে দেখা যাবে।`} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {players.map((player) => (
            <Link
              key={player.id}
              to={`${listPath}/player/${player.id}`}
              className="group np-card np-card-hover block"
            >
              <span className="np-gold-line" aria-hidden="true" />
              <div className="np-media aspect-[4/3]">
                {player.photo_url ? (
                  <img src={player.photo_url} alt={player.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-brand/50" aria-hidden="true">
                    {player.name.charAt(0)}
                  </span>
                )}
                {player.jersey_no !== null && (
                  <span className="absolute bottom-2 left-2 rounded bg-brand-dark/85 px-1.5 py-0.5 text-xs font-bold text-white">
                    #{toBn(player.jersey_no)}
                  </span>
                )}
              </div>
              <div className="p-3.5">
                <p className="truncate font-bold text-brand-dark">{player.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {player.position}
                  {player.jersey_no !== null && ` · #${player.jersey_no}`}
                </p>
                <p className="mt-1.5 text-xs font-medium text-neutral-600">
                  {toBn(player.matches)} ম্যাচ · {toBn(player.primaryStat)} {statLabel.primary} · {toBn(player.secondaryStat)} {statLabel.secondary}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
