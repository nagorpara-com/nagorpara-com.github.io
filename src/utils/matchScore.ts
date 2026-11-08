import type { Match, MatchPerformance } from "../types/database.types";

/**
 * Score-vs-performance consistency checks (§6 Part 3).
 *
 * Match scores are free text by design (migration 0001), so only
 * IMPOSSIBLE mismatches are flagged — and only as a warning in the
 * admin panel, never as a block:
 * - Football: our score is a plain goal count, so the players' total
 *   goals must equal it exactly.
 * - Cricket batting: the team's total includes extras (wides, no
 *   balls), so the batsmen's combined runs may be LOWER than the
 *   team score — but never higher.
 */

/** Parse a plain integer score ("2") — null when it is not one. */
export function parsePlainScore(text: string | null): number | null {
  if (!text) return null;
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** Parse a cricket score ("245/8", "245/8 (50 ov)", "245") into runs/wickets. */
export function parseCricketScore(
  text: string | null,
): { runs: number; wickets: number | null } | null {
  if (!text) return null;
  const m = text.trim().match(/^(\d+)(?:\s*\/\s*(\d+))?/);
  if (!m) return null;
  return { runs: Number(m[1]), wickets: m[2] !== undefined ? Number(m[2]) : null };
}

/**
 * Returns a Bengali warning when the recorded performances cannot
 * possibly match the match score, otherwise null. Warn-only —
 * never a block (Step C extends the Step-3 checks with the new
 * performance fields: own goals count toward the OPPONENT's
 * score, and cricket extras (wides + no-balls) count toward the
 * team total, so batsmen + extras can never exceed it).
 */
export function scoreConsistencyWarning(
  match: Pick<Match, "sport" | "status" | "our_score" | "opponent_score">,
  performances: Pick<
    MatchPerformance,
    "goals" | "runs" | "own_goals" | "wides" | "no_balls"
  >[],
): string | null {
  if (match.status !== "completed" || performances.length === 0) return null;

  if (match.sport === "football") {
    const teamGoals = parsePlainScore(match.our_score);
    if (teamGoals === null) return null;
    const playerGoals = performances.reduce((sum, p) => sum + (p.goals || 0), 0);
    if (playerGoals !== teamGoals) {
      return `সতর্কতা: দলের স্কোরের সঙ্গে প্লেয়ারদের গোলের যোগফল মিলছে না — ম্যাচের স্কোর অনুযায়ী আমাদের গোল ${teamGoals}টি, কিন্তু প্লেয়ারদের Performance-এ মোট গোল ${playerGoals}টি। যেকোনো একটি ঠিক করুন।`;
    }
    const oppGoals = parsePlainScore(match.opponent_score);
    const ownGoals = performances.reduce((sum, p) => sum + (p.own_goals ?? 0), 0);
    if (oppGoals !== null && ownGoals > oppGoals) {
      return `সতর্কতা: দলের স্কোরের সঙ্গে প্লেয়ারদের গোলের যোগফল মিলছে না — প্রতিপক্ষের স্কোর ${oppGoals}টি, কিন্তু আমাদের প্লেয়ারদের আত্মঘাতী গোলই ${ownGoals}টি, যা প্রতিপক্ষের মোট গোলের বেশি হতে পারে না।`;
    }
    return null;
  }

  const team = parseCricketScore(match.our_score);
  if (team === null) return null;
  const playerRuns = performances.reduce((sum, p) => sum + (p.runs || 0), 0);
  const extras = performances.reduce(
    (sum, p) => sum + (p.wides ?? 0) + (p.no_balls ?? 0),
    0,
  );
  if (playerRuns + extras > team.runs) {
    return `স্কোর সতর্কতা: টিমের মোট রান ${team.runs}, কিন্তু ব্যাটসম্যানদের রান ও অতিরিক্ত (ওয়াইড/নো-বল)-এর যোগফল ${playerRuns + extras} — যোগফল টিমের রানের বেশি হতে পারে না।`;
  }
  return null;
}
