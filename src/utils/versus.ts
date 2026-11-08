import type { Match, Team } from "../types/database.types";
import { findOpponentTeam } from "../hooks/useTeams";

/**
 * Versus side resolution for public match displays (owner's
 * order, v179): a match shows the two LINKED teams instead of
 * the old fixed "নগর পাড়া বনাম {opponent}" line. The rules
 * mirror the conventions the site already uses (match
 * details header, BracketView, the print sheet):
 *
 * - A linked team is returned as-is; renderers show its real
 *   logo or its initial-letter placeholder (TeamLogo).
 * - Team B unpicked (team_b_id empty) is the OUTSIDE
 *   opponent: the free-text name with the print sheet's
 *   "বাইরের টিম" treatment, and a logo ONLY when a published
 *   team of that sport has exactly that name and a logo —
 *   never a fabricated one.
 * - A side whose team link does not resolve (unpicked, or
 *   the team was deleted — migration 0044's SET NULL) falls
 *   back honestly: Team A is "টিম নির্ধারিত নয়" with no
 *   logo (the BracketView convention); Team B falls back to
 *   the opponent text. No name or logo is ever invented.
 */

export interface VersusSide {
  name: string;
  /** Team rendered via TeamLogo; null renders no logo. */
  logoTeam: Team | null;
  /** True only for the outside (unregistered) opponent. */
  outside: boolean;
}

export function versusSides(
  match: Match,
  teamById: Map<string, Team>,
  teams: Team[],
): { a: VersusSide; b: VersusSide } {
  const aTeam = match.team_a_id ? teamById.get(match.team_a_id) ?? null : null;
  const a: VersusSide = {
    name: aTeam?.name ?? "টিম নির্ধারিত নয়",
    logoTeam: aTeam,
    outside: false,
  };
  let b: VersusSide;
  if (match.team_b_id) {
    const bTeam = teamById.get(match.team_b_id) ?? null;
    b = { name: bTeam?.name ?? match.opponent, logoTeam: bTeam, outside: false };
  } else {
    const matched = findOpponentTeam(teams, match.sport, match.opponent);
    b = {
      name: match.opponent,
      logoTeam: matched?.logo_url ? matched : null,
      outside: true,
    };
  }
  return { a, b };
}
