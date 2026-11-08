/**
 * Cricket derived statistics — calculated ONLY from recorded raw
 * numbers. Averages and rates are never stored and never invented:
 * when the inputs needed for a figure do not exist (or a divisor is
 * zero), the result is null and the UI shows "—".
 */

export interface CricketRawStats {
  matches: number;
  innings: number;
  runs: number;
  highest_score: number;
  not_outs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  wickets: number;
  balls_bowled: number;
  runs_conceded: number;
  maidens: number;
  catches: number;
  stumpings: number;
  run_outs: number;
}

export const EMPTY_CRICKET_RAW: CricketRawStats = {
  matches: 0,
  innings: 0,
  runs: 0,
  highest_score: 0,
  not_outs: 0,
  balls_faced: 0,
  fours: 0,
  sixes: 0,
  fifties: 0,
  hundreds: 0,
  wickets: 0,
  balls_bowled: 0,
  runs_conceded: 0,
  maidens: 0,
  catches: 0,
  stumpings: 0,
  run_outs: 0,
};

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

/** Batting average = runs / dismissals (innings − not outs). */
export function battingAverage(s: CricketRawStats): number | null {
  return ratio(s.runs, s.innings - s.not_outs);
}

/** Batting strike rate = runs per 100 balls faced. */
export function battingStrikeRate(s: CricketRawStats): number | null {
  return ratio(s.runs * 100, s.balls_faced);
}

/** Bowling economy = runs conceded per over (6 balls). */
export function bowlingEconomy(s: CricketRawStats): number | null {
  return ratio(s.runs_conceded * 6, s.balls_bowled);
}

/** Bowling average = runs conceded per wicket. */
export function bowlingAverage(s: CricketRawStats): number | null {
  return ratio(s.runs_conceded, s.wickets);
}

/** Bowling strike rate = balls bowled per wicket. */
export function bowlingStrikeRate(s: CricketRawStats): number | null {
  return ratio(s.balls_bowled, s.wickets);
}

/** Cricket overs notation: 65 balls = "10.5" (10 overs, 5 balls). */
export function oversText(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

/** Parse overs notation "10.5" back to balls (65). Invalid null. */
export function oversToBalls(text: string): number | null {
  const match = /^(\d+)(?:\.([0-5]))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 6 + (match[2] ? Number(match[2]) : 0);
}

export interface BowlingPerformance {
  wickets: number;
  runs_conceded: number;
}

/**
 * Best bowling figures from match-by-match records: most wickets;
 * ties broken by fewest runs conceded. Returns e.g. "4/23", or null
 * when the player has no bowling record.
 */
export function bestBowlingFigures(perfs: BowlingPerformance[]): string | null {
  let best: BowlingPerformance | null = null;
  for (const p of perfs) {
    if (p.wickets <= 0) continue;
    if (
      best === null ||
      p.wickets > best.wickets ||
      (p.wickets === best.wickets && p.runs_conceded < best.runs_conceded)
    ) {
      best = p;
    }
  }
  return best ? `${best.wickets}/${best.runs_conceded}` : null;
}
