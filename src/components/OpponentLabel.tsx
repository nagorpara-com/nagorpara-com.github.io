import { findOpponentTeam, usePublishedTeams } from "../hooks/useTeams";

/**
 * A match's opponent name, with the team's logo in front when a
 * PUBLISHED team of that sport has exactly that name (Teams
 * system, migration 0043). Free-text opponents — and anything
 * before 0043 is live — render as the plain name, unchanged.
 */
export default function OpponentLabel({
  sport,
  opponent,
}: {
  sport: string;
  opponent: string;
}) {
  const teams = usePublishedTeams();
  const team = findOpponentTeam(teams, sport, opponent);
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {team?.logo_url && (
        <img
          src={team.logo_url}
          alt=""
          loading="lazy"
          className="h-5 w-5 shrink-0 rounded-full border border-neutral-200 bg-white object-contain"
        />
      )}
      <span>{opponent}</span>
    </span>
  );
}
