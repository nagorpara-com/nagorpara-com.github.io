import { Link } from "react-router-dom";
import { toBn } from "../utils/format";
import { CRICKET_DEFAULTS, CRICKET_STAT_LABELS, type CricketStatKey } from "../config/cricket";
import { cricketRoleLabelBn } from "../config/positions";
import type { CricketSquadPlayer } from "../hooks/useCricketPlayers";

/**
 * Cricket squad card — same design language as the football card
 * (Reference Panel 05): photo with jersey badge, Bengali name,
 * playing role · jersey number, and a stat line driven by the team
 * settings (`cricket_card_stats`). A player without a photo gets a
 * neutral initial tile — never a fake photo.
 */
export default function CricketPlayerCard({
  player,
  cardStats = CRICKET_DEFAULTS.cardStats,
}: {
  player: CricketSquadPlayer;
  cardStats?: CricketStatKey[];
}) {
  return (
    <Link
      to={`/cricket/player/${player.id}`}
      className="group np-card np-card-hover block"
    >
      <span className="np-gold-line" aria-hidden="true" />
      <div className="np-media aspect-[4/3]">
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-brand/40" aria-hidden="true">
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
          {cricketRoleLabelBn(player.role) ?? player.position}
          {player.jersey_no !== null && ` · #${player.jersey_no}`}
        </p>
        {player.totals && (
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-neutral-600">
            {cardStats.map((key) => `${toBn(player.totals![key])} ${CRICKET_STAT_LABELS[key]}`).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
