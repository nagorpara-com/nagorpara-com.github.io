import type {
  Match,
  MatchPerformance,
  Tournament,
} from "../types/database.types";

/**
 * Card suspension computation (Step D, owner's advanced rules,
 * 2026-11-03) — computed from recorded performances, nothing is
 * stored, so correcting a result or a performance automatically
 * corrects the list.
 *
 * THE RULE (per tournament, completed matches in date order):
 * a suspension TRIGGERS for a player when, in one match, the
 * player receives a red card, OR 2+ yellow cards in that same
 * match, OR their cumulative yellow cards since the last trigger
 * reach 2. A triggered suspension is SERVED (cleared) as soon as
 * the player has a performance row in a LATER completed match of
 * the same tournament — appearing in a later match means the ban
 * match has passed. Serving a ban also resets the player's
 * cumulative yellow count; the cards of the serving match itself
 * then count fresh and can trigger a new suspension.
 *
 * Only unserved suspensions are returned — the declaration page
 * shows exactly those players as banned for the next match.
 */
export interface Suspension {
  playerId: string;
  tournamentId: string;
  reason: "red" | "yellows";
  /** The match whose cards triggered the suspension. */
  matchId: string;
}

export function computeSuspensions(
  tournament: Tournament,
  matches: Match[],
  performances: MatchPerformance[],
): Suspension[] {
  const tMatches = matches
    .filter((m) => m.tournament_id === tournament.id && m.status === "completed")
    .sort((a, b) => {
      const da = a.match_date ?? a.created_at;
      const db = b.match_date ?? b.created_at;
      return da.localeCompare(db) || a.created_at.localeCompare(b.created_at);
    });
  if (tMatches.length === 0) return [];

  const perfByMatch = new Map<string, Map<string, MatchPerformance>>();
  for (const p of performances) {
    let byPlayer = perfByMatch.get(p.match_id);
    if (!byPlayer) {
      byPlayer = new Map();
      perfByMatch.set(p.match_id, byPlayer);
    }
    byPlayer.set(p.player_id, p);
  }

  const playerIds = new Set<string>();
  for (const byPlayer of perfByMatch.values()) {
    for (const id of byPlayer.keys()) playerIds.add(id);
  }

  const out: Suspension[] = [];
  for (const playerId of playerIds) {
    let yellowsSinceTrigger = 0;
    let pending: Suspension | null = null;
    for (const m of tMatches) {
      const perf = perfByMatch.get(m.id)?.get(playerId);
      if (!perf) continue;
      // Matches are walked once, in date order, so a pending ban
      // from an earlier match is served by appearing here; this
      // match's own cards are then judged fresh.
      if (pending && pending.matchId !== m.id) {
        pending = null;
        yellowsSinceTrigger = 0;
      }
      const yellows = perf.yellow_cards ?? 0;
      const reds = perf.red_cards ?? 0;
      if (reds >= 1) {
        pending = { playerId, tournamentId: tournament.id, reason: "red", matchId: m.id };
        yellowsSinceTrigger = 0;
      } else if (yellows >= 2) {
        pending = { playerId, tournamentId: tournament.id, reason: "yellows", matchId: m.id };
        yellowsSinceTrigger = 0;
      } else {
        yellowsSinceTrigger += yellows;
        if (yellowsSinceTrigger >= 2) {
          pending = { playerId, tournamentId: tournament.id, reason: "yellows", matchId: m.id };
          yellowsSinceTrigger = 0;
        }
      }
    }
    if (pending) out.push(pending);
  }
  return out;
}
