import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PlayerCard from "../../components/PlayerCard";
import CricketPlayerCard from "../../components/CricketPlayerCard";
import { usePublishedTeams } from "../../hooks/useTeams";
import { useFootballSquad } from "../../hooks/usePlayers";
import { useCricketSquad } from "../../hooks/useCricketPlayers";
import { useFootballSettings } from "../../hooks/useFootballSettings";
import { useCricketSettings } from "../../hooks/useCricketSettings";
import type { Sport } from "../../types/database.types";
import { SPORT_LABELS_BN } from "../../utils/matchDisplay";
import { formatDateBn, toBn } from "../../utils/format";

/**
 * Best player first (owner's order, v179): within ONE team,
 * players with recorded season totals lead the grid, ordered
 * by the sport's scoring stat (football: goals; cricket:
 * runs, wickets as the secondary); players without recorded
 * totals keep their admin display order after them. The
 * totals are the ones the squad hooks already merged onto
 * each player — no new read. (The /football and /cricket
 * squad pages keep their own display order — not this page.)
 */
function byPerformance<T extends { display_order: number }>(
  list: T[],
  score: (p: T) => { primary: number; secondary: number } | null,
): T[] {
  return [...list].sort((x, y) => {
    const sx = score(x);
    const sy = score(y);
    if (sx && sy) {
      return (
        sy.primary - sx.primary ||
        sy.secondary - sx.secondary ||
        x.display_order - y.display_order
      );
    }
    if (sx) return -1;
    if (sy) return 1;
    return x.display_order - y.display_order;
  });
}

/**
 * Public page for ONE registered team (owner's flow,
 * 2026-11-03): the team's players in the site's international
 * squad-card layout — the same PlayerCard the football and
 * cricket pages use (portrait 4:5 photo, jersey badge, position
 * chip, season stat line). Only published players assigned to
 * this team (players.team_id, migration 0046) are shown.
 */
export default function TeamPlayersPage() {
  const { sport: sportParam, teamId } = useParams();
  const sport: Sport = sportParam === "cricket" ? "cricket" : "football";
  const teams = usePublishedTeams();
  const team = useMemo(
    () => teams.find((t) => t.id === teamId && t.sport === sport) ?? null,
    [teams, teamId, sport],
  );

  const football = useFootballSquad();
  const cricket = useCricketSquad();
  const footballSettings = useFootballSettings();
  const cricketSettings = useCricketSettings();

  const footballPlayers = useMemo(
    () =>
      byPerformance(
        football.players.filter((p) => p.team_id === teamId),
        (p) => (p.stats ? { primary: p.stats.goals, secondary: 0 } : null),
      ),
    [football.players, teamId],
  );
  const cricketPlayers = useMemo(
    () =>
      byPerformance(
        cricket.players.filter((p) => p.team_id === teamId),
        (p) =>
          p.totals
            ? { primary: p.totals.runs, secondary: p.totals.wickets }
            : null,
      ),
    [cricket.players, teamId],
  );
  const playerCount = sport === "football" ? footballPlayers.length : cricketPlayers.length;

  // Player search inside this team's grid (owner's order,
  // v179): filters ONLY this team's players by name, like the
  // squad pages' search; the header count stays the team's
  // full count.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shownFootball = q
    ? footballPlayers.filter((p) => p.name.toLowerCase().includes(q))
    : footballPlayers;
  const shownCricket = q
    ? cricketPlayers.filter((p) => p.name.toLowerCase().includes(q))
    : cricketPlayers;
  const shownCount = sport === "football" ? shownFootball.length : shownCricket.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to={`/teams/${sport}`} className="text-sm font-medium text-brand hover:underline">
        ‹ {SPORT_LABELS_BN[sport]} — টিম
      </Link>

      {team ? (
        <>
          <div className="np-card mt-3 flex flex-wrap items-center gap-4 p-5">
            {team.logo_url ? (
              <img src={team.logo_url} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-light text-3xl font-bold text-brand-dark"
              >
                {team.name.charAt(0)}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-brand-dark">{team.name}</h1>
                <span className="np-chip">{SPORT_LABELS_BN[sport]}</span>
              </div>
              {team.registered_by_name ? (
                <p className="mt-1 text-sm text-neutral-500">
                  দায়িত্বশীল: {team.registered_by_name}
                </p>
              ) : null}
              {team.captain_name ? (
                <p className="mt-0.5 text-sm text-neutral-500">
                  অধিনায়ক: {team.captain_name}
                </p>
              ) : null}
              {team.coach_name ? (
                <p className="mt-0.5 text-sm text-neutral-500">
                  কোচ: {team.coach_name}
                </p>
              ) : null}
              {team.established_date ? (
                <p className="mt-0.5 text-sm text-neutral-500">
                  শুরুর তারিখ: {formatDateBn(team.established_date)}
                </p>
              ) : null}
              <p className="mt-0.5 text-sm font-medium text-neutral-600">
                {toBn(playerCount)} জন প্লেয়ার
              </p>
            </div>
          </div>

          {playerCount === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
              এই টিমে এখনো কোনো প্লেয়ার যোগ হয়নি।
            </p>
          ) : (
            <>
              <div className="mt-6 max-w-md">
                <label htmlFor="team-player-search" className="sr-only">
                  প্লেয়ারের নাম খুঁজুন
                </label>
                <input
                  id="team-player-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="প্লেয়ারের নাম খুঁজুন..."
                  className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-neutral-400 focus:border-brand"
                />
              </div>
              {shownCount === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                  এই খোঁজে কোনো প্লেয়ার পাওয়া যায়নি।
                </p>
              ) : sport === "football" ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {shownFootball.map((p) => (
                    <PlayerCard key={p.id} player={p} cardStats={footballSettings.cardStats} />
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {shownCricket.map((p) => (
                    <CricketPlayerCard key={p.id} player={p} cardStats={cricketSettings.cardStats} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
          টিমটি পাওয়া যায়নি, অথবা এখনো প্রকাশিত হয়নি।
        </p>
      )}
    </div>
  );
}
