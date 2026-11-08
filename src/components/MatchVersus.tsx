import type { Match, Team } from "../types/database.types";
import { TeamLogo } from "./tournament/TournamentViews";
import { versusSides } from "../utils/versus";

// The gold premium stage badge lives with TeamLogo in
// TournamentViews (the bracket needs it too — one direction
// of imports only); re-exported here for the card surfaces.
export { PremiumStageBadge } from "./tournament/TournamentViews";

/** The versus row inside a public match card: logo + name,
 * "বনাম", name + logo — names truncate on narrow cards. */
export function MatchVersusRow({
  match,
  teamById,
  teams,
}: {
  match: Match;
  teamById: Map<string, Team>;
  teams: Team[];
}) {
  const { a, b } = versusSides(match, teamById, teams);
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {a.logoTeam ? <TeamLogo team={a.logoTeam} size={28} /> : null}
        <span className="truncate font-semibold text-neutral-800">{a.name}</span>
      </span>
      <span className="shrink-0 text-xs font-bold text-neutral-400">বনাম</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className="flex min-w-0 flex-col items-end">
          <span className="max-w-full truncate font-semibold text-neutral-800">
            {b.name}
          </span>
          {b.outside ? (
            <span className="text-[10px] leading-tight text-neutral-400">
              বাইরের টিম
            </span>
          ) : null}
        </span>
        {b.logoTeam ? <TeamLogo team={b.logoTeam} size={28} /> : null}
      </span>
    </div>
  );
}
