import type { Match, Team, Tournament } from "../types/database.types";

/**
 * Tournament computations (owner's Additional Rules, 2026-11-02).
 *
 * Everything here is COMPUTED from recorded results — nothing is
 * stored, so editing a result automatically corrects the points
 * table, the bracket progression and the champion. Scores are free
 * text (cricket "245/8 (50 ov)"), so numeric comparison only ever
 * uses the leading number of a score, and only for goal/run
 * difference columns — wins, draws and points always come from the
 * structured winner_team_id / is_draw fields the Admin records.
 */

/** Leading number of a free-text score ("245/8 (50 ov)" -> 245). */
export function parseScore(score: string | null | undefined): number | null {
  if (!score) return null;
  const m = /^\s*(\d+)/.exec(score);
  return m ? Number(m[1]) : null;
}

/**
 * Cricket overs notation to balls: "19.4" -> 118, "20" -> 120.
 * The part after the dot is BALLS (0-5), not a decimal fraction,
 * so "19.7" is invalid and returns null (Step C, 2026-11-03).
 * Empty input also returns null (field not recorded).
 */
export function oversToBalls(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /^(\d+)(?:\.([0-5]))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 6 + (m[2] ? Number(m[2]) : 0);
}

/** Balls back to overs notation: 118 -> "19.4", 120 -> "20.0". */
export function ballsToOvers(balls: number | null | undefined): string {
  if (balls === null || balls === undefined) return "";
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export interface PointsRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Goals (football) or runs (cricket) scored / conceded. */
  scored: number;
  conceded: number;
  diff: number;
  points: number;
  /**
   * Net Run Rate (cricket only, Step C): computed from the
   * recorded per-side balls/wickets of completed matches. Null
   * when the tournament has no match with balls data (or for
   * football) — the table then shows "—" with an honest note.
   */
  nrr: number | null;
}

/** League points table for one tournament, from its linked matches. */
export function computePointsTable(
  tournament: Tournament,
  teams: Team[],
  matches: Match[],
): PointsRow[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rows = new Map<string, PointsRow>();
  const rowFor = (teamId: string): PointsRow | null => {
    const team = byId.get(teamId);
    if (!team) return null;
    let row = rows.get(teamId);
    if (!row) {
      row = {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        scored: 0,
        conceded: 0,
        diff: 0,
        points: 0,
        nrr: null,
      };
      rows.set(teamId, row);
    }
    return row;
  };

  const win = tournament.points_win ?? 3;
  const draw = tournament.points_draw ?? 1;
  const loss = tournament.points_loss ?? 0;

  // NRR accumulators (cricket, Step C): runs and balls for/against
  // per team, from completed matches that carry balls data.
  const isCricket = tournament.sport === "cricket";
  const nrrAcc = new Map<
    string,
    { runsFor: number; ballsFaced: number; runsAgainst: number; ballsBowled: number }
  >();
  const accFor = (teamId: string) => {
    let acc = nrrAcc.get(teamId);
    if (!acc) {
      acc = { runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0 };
      nrrAcc.set(teamId, acc);
    }
    return acc;
  };
  // Balls an innings counts for: an all-out side (10 wickets) is
  // deemed to have used the tournament's full allocation when the
  // overs are set; without the allocation, the balls it actually
  // faced stand (owner's Step C NRR rule).
  const inningsBalls = (
    balls: number | null | undefined,
    wickets: number | null | undefined,
  ): number | null => {
    if (balls === null || balls === undefined) return null;
    if (wickets === 10 && tournament.cricket_overs) {
      return tournament.cricket_overs * 6;
    }
    return balls;
  };
  let anyBallsData = false;

  for (const m of matches) {
    if (m.tournament_id !== tournament.id) continue;
    if (m.status !== "completed") continue;
    if (!m.team_a_id || !m.team_b_id) continue;
    const a = rowFor(m.team_a_id);
    const b = rowFor(m.team_b_id);
    if (!a || !b) continue;
    a.played += 1;
    b.played += 1;
    const aScore = parseScore(m.our_score);
    const bScore = parseScore(m.opponent_score);
    if (aScore !== null && bScore !== null) {
      a.scored += aScore;
      a.conceded += bScore;
      b.scored += bScore;
      b.conceded += aScore;
    }
    if (isCricket && aScore !== null && bScore !== null) {
      const aBalls = inningsBalls(m.team_a_balls, m.team_a_wickets);
      const bBalls = inningsBalls(m.team_b_balls, m.team_b_wickets);
      if (aBalls !== null && bBalls !== null) {
        anyBallsData = true;
        const accA = accFor(m.team_a_id);
        accA.runsFor += aScore;
        accA.ballsFaced += aBalls;
        accA.runsAgainst += bScore;
        accA.ballsBowled += bBalls;
        const accB = accFor(m.team_b_id);
        accB.runsFor += bScore;
        accB.ballsFaced += bBalls;
        accB.runsAgainst += aScore;
        accB.ballsBowled += aBalls;
      }
    }
    if (m.winner_team_id === m.team_a_id) {
      // A recorded winner decides the match — including a
      // tiebreaker winner after a drawn game (is_draw may also be
      // true then; the winner still takes the win).
      a.won += 1;
      b.lost += 1;
      a.points += win;
      b.points += loss;
    } else if (m.winner_team_id === m.team_b_id) {
      b.won += 1;
      a.lost += 1;
      b.points += win;
      a.points += loss;
    } else if (m.is_draw) {
      a.drawn += 1;
      b.drawn += 1;
      a.points += draw;
      b.points += draw;
    }
    // A completed match with no recorded winner and no draw flag is
    // an incomplete record: it counts as played, nothing more, and
    // the Admin sees it in the match list.
  }
  for (const row of rows.values()) row.diff = row.scored - row.conceded;

  if (isCricket && anyBallsData) {
    for (const row of rows.values()) {
      const acc = nrrAcc.get(row.team.id);
      if (acc && acc.ballsFaced > 0 && acc.ballsBowled > 0) {
        row.nrr = acc.runsFor / (acc.ballsFaced / 6) - acc.runsAgainst / (acc.ballsBowled / 6);
      }
    }
  }

  return [...rows.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (isCricket) {
      // NRR is the first tiebreak for cricket; a team without
      // balls data sorts below one that has it.
      const xn = x.nrr ?? Number.NEGATIVE_INFINITY;
      const yn = y.nrr ?? Number.NEGATIVE_INFINITY;
      if (yn !== xn) return yn - xn;
    }
    return (
      y.diff - x.diff ||
      y.scored - x.scored ||
      x.team.name.localeCompare(y.team.name, "bn")
    );
  });
}

/**
 * Canonical knockout round order (owner's Round Management list,
 * 2026-11-02 Phase A): group stage first, the optional third-place
 * match sits between the semi-final and the final. The league
 * "রাউন্ড N" labels are separate and rank after these.
 */
export const KNOCKOUT_ROUNDS = [
  "গ্রুপ পর্ব",
  "প্রথম রাউন্ড",
  "রাউন্ড অফ ৩২",
  "প্রি-কোয়ার্টার ফাইনাল (রাউন্ড অফ ১৬)",
  "কোয়ার্টার ফাইনাল",
  "সেমিফাইনাল",
  "তৃতীয় স্থান নির্ধারণী",
  "ফাইনাল",
] as const;

/**
 * The late knockout stages that carry the gold premium badge
 * on public match displays (owner's order, v179): quarter-
 * final, semi-final and final ONLY. Referenced out of
 * KNOCKOUT_ROUNDS itself so the strings can never drift
 * apart — a match qualifies only when its `round` is EXACTLY
 * one of these canonical values; ordinal / free-text rounds
 * ("প্রথম রাউন্ড" etc.) never do.
 */
export const PREMIUM_ROUNDS: readonly string[] = [
  KNOCKOUT_ROUNDS[4], // কোয়ার্টার ফাইনাল
  KNOCKOUT_ROUNDS[5], // সেমিফাইনাল
  KNOCKOUT_ROUNDS[7], // ফাইনাল
];

export function isPremiumRound(round: string | null | undefined): boolean {
  return !!round && PREMIUM_ROUNDS.includes(round);
}

const ORDINAL_ROUND_WORDS = [
  "প্রথম",
  "দ্বিতীয়",
  "তৃতীয়",
  "চতুর্থ",
  "পঞ্চম",
  "ষষ্ঠ",
  "সপ্তম",
  "অষ্টম",
  "নবম",
  "দশম",
] as const;

/**
 * Sequential round name (owner's Match Creation rule,
 * 2026-11-05): the Nth match created in a tournament carries
 * the Nth round — 1 "প্রথম রাউন্ড", 2 "দ্বিতীয় রাউন্ড", …,
 * 10 "দশম রাউন্ড", 11+ "<Bengali digits>তম রাউন্ড".
 */
export function ordinalRoundName(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "";
  const i = Math.floor(n);
  if (i <= ORDINAL_ROUND_WORDS.length) return `${ORDINAL_ROUND_WORDS[i - 1]} রাউন্ড`;
  return `${bnNum(i)}তম রাউন্ড`;
}

/** Reverse of ordinalRoundName; null for any other label. */
export function parseOrdinalRound(round: string | null | undefined): number | null {
  if (!round) return null;
  const s = round.trim();
  for (let i = 0; i < ORDINAL_ROUND_WORDS.length; i += 1) {
    if (s === `${ORDINAL_ROUND_WORDS[i]} রাউন্ড`) return i + 1;
  }
  const m = /^([০-৯]+)তম রাউন্ড$/.exec(s) ?? /^([0-9]+)তম রাউন্ড$/.exec(s);
  if (!m) return null;
  const digits = m[1].replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  const n = Number(digits);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Round ordering for grouped listings (groupByRound and the
 * "later rounds" comparisons). Interleave rule (v166): the
 * group stage (গ্রুপ পর্ব) comes first; SEQUENTIAL rounds
 * (ordinalRoundName) follow by their number — "প্রথম রাউন্ড"
 * counts as number 1, exactly where it already sat; the
 * remaining knockout stage labels keep their KNOCKOUT_ROUNDS
 * relative order after them; unrecognized labels come last.
 * Pure stage tournaments therefore display exactly as before.
 */
export function roundRank(round: string | null | undefined): number {
  if (!round) return 20000;
  if (round === KNOCKOUT_ROUNDS[0]) return 0;
  const ord = parseOrdinalRound(round);
  if (ord !== null) return ord;
  const idx = (KNOCKOUT_ROUNDS as readonly string[]).indexOf(round);
  return idx === -1 ? 20000 : 10000 + idx;
}

/** Round label for a knockout round entered by `teamCount` teams. */
export function knockoutRoundLabel(teamCount: number): string {
  if (teamCount <= 2) return "ফাইনাল";
  if (teamCount <= 4) return "সেমিফাইনাল";
  if (teamCount <= 8) return "কোয়ার্টার ফাইনাল";
  if (teamCount <= 16) return "প্রি-কোয়ার্টার ফাইনাল (রাউন্ড অফ ১৬)";
  if (teamCount <= 32) return "রাউন্ড অফ ৩২";
  return "প্রথম রাউন্ড";
}

/**
 * The rounds a single-elimination bracket of `teamCount` teams is
 * expected to have, in order, with the number of matches in each.
 * Used ONLY to project future rounds in the bracket display
 * ("বিজয়ী নির্ধারিত হয়নি") — nothing is stored (owner's Phase A
 * rule: button-based generation + display projection). The
 * optional third-place match is never projected; the Admin adds
 * it manually when wanted.
 */
export function expectedKnockoutRounds(
  teamCount: number,
): { round: string; matches: number }[] {
  const rounds: { round: string; matches: number }[] = [];
  let teamsIn = teamCount;
  while (teamsIn >= 2) {
    rounds.push({
      round: knockoutRoundLabel(teamsIn),
      matches: Math.max(1, Math.floor(teamsIn / 2)),
    });
    teamsIn = Math.ceil(teamsIn / 2);
  }
  return rounds;
}

export interface FixturePair {
  teamA: Team;
  teamB: Team;
}

/**
 * Standard seeding pairs: 1 plays last, 2 plays second-last, and
 * so on. With an odd count the middle seed receives a bye (it is
 * returned in `byes`, no match is created for it).
 */
export function seedPairs(teams: Team[]): { pairs: FixturePair[]; byes: Team[] } {
  const pairs: FixturePair[] = [];
  const byes: Team[] = [];
  let i = 0;
  let j = teams.length - 1;
  while (i < j) {
    pairs.push({ teamA: teams[i], teamB: teams[j] });
    i += 1;
    j -= 1;
  }
  if (i === j) byes.push(teams[i]);
  return { pairs, byes };
}

/**
 * Single round-robin fixture list (circle method): every team
 * plays every other team once. Returns rounds of pairs; with an
 * odd team count one team rests each round.
 */
export function roundRobinRounds(teams: Team[]): FixturePair[][] {
  if (teams.length < 2) return [];
  const list: (Team | null)[] = [...teams];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: FixturePair[][] = [];
  let ring = [...list];
  for (let r = 0; r < n - 1; r += 1) {
    const pairs: FixturePair[] = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a && b) pairs.push({ teamA: a, teamB: b });
    }
    rounds.push(pairs);
    ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)];
  }
  return rounds;
}

/** Group matches by round label, rounds in progression order. */
export function groupByRound(matches: Match[]): { round: string; matches: Match[] }[] {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.round ?? "";
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .map(([round, ms]) => ({
      round,
      matches: ms.sort(
        (a, b) =>
          (a.match_no ?? Number.MAX_SAFE_INTEGER) - (b.match_no ?? Number.MAX_SAFE_INTEGER) ||
          (a.match_date ?? "").localeCompare(b.match_date ?? ""),
      ),
    }))
    .sort((x, y) => roundRank(x.round || null) - roundRank(y.round || null));
}

/**
 * The tournament champion: the recorded champion_team_id wins;
 * otherwise a completed final with a recorded winner decides it.
 */
export function championOf(
  tournament: Tournament,
  teams: Team[],
  matches: Match[],
): Team | null {
  const byId = new Map(teams.map((t) => [t.id, t]));
  if (tournament.champion_team_id) {
    return byId.get(tournament.champion_team_id) ?? null;
  }
  const final = matches.find(
    (m) =>
      m.tournament_id === tournament.id &&
      m.round === "ফাইনাল" &&
      m.status === "completed" &&
      m.winner_team_id,
  );
  return final?.winner_team_id ? byId.get(final.winner_team_id) ?? null : null;
}

/** Bengali digit rendering for small UI numbers (counts, seeds). */
export function bnNum(n: number): string {
  return String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
}
