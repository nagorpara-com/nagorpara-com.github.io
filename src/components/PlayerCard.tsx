import { Link } from "react-router-dom";
import { toBn } from "../utils/format";
import { FOOTBALL_DEFAULTS, STAT_LABELS, type StatKey } from "../config/football";
import type { SquadPlayer } from "../hooks/usePlayers";

/**
 * Football player card — international squad-card layout (owner's
 * standard, 2026-10-26): a PORTRAIT 4:5 photo (the size club and
 * FIFA-style squad pages use; ideal upload 800×1000), the jersey
 * number as a gold badge over the photo, a position chip, then
 * name, position · club, and the settings-chosen stat line. All
 * cards in the grid share the exact same size. Clicking opens the
 * player's full biodata profile. A player without a photo gets a
 * neutral initial tile — never a fake photo. The club line shows
 * only when a club is actually recorded (migration 0025) — never
 * an invented one.
 */
export default function PlayerCard({
  player,
  cardStats = FOOTBALL_DEFAULTS.cardStats,
}: {
  player: SquadPlayer;
  cardStats?: StatKey[];
}) {
  return (
    <Link
      to={`/football/player/${player.id}`}
      className="group np-card np-card-hover flex h-full flex-col"
    >
      <span className="np-gold-line" aria-hidden="true" />
      <div className="np-media aspect-[4/5]">
        {player.photo_url ? (
          <img
            src={player.photo_url}
            alt={player.name}
            className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-5xl font-bold text-brand/40" aria-hidden="true">
            {player.name.charAt(0)}
          </span>
        )}
        {player.jersey_no !== null && (
          <span className="absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-gold text-sm font-extrabold text-brand-dark shadow">
            {toBn(player.jersey_no)}
          </span>
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-brand-dark/85 px-2.5 py-1 text-[11px] font-semibold text-white">
          {player.position}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="truncate font-bold text-brand-dark">{player.name}</p>
        <p className="truncate text-xs text-neutral-500">
          {player.position}
          {player.jersey_no !== null && ` · #${toBn(player.jersey_no)}`}
        </p>
        {player.club ? (
          <p className="mt-1 truncate text-xs font-medium text-neutral-600">
            ক্লাব: {player.club}
          </p>
        ) : null}
        {player.stats && (
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-neutral-600">
            {cardStats.map((key) => `${toBn(player.stats![key])} ${STAT_LABELS[key]}`).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
