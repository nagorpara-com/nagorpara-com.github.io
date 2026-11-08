/**
 * Team ID pool of a tournament (owner's FINAL model, 2026-11-05):
 * exactly `teamCount` IDs in the sequence A1, A2, B1, B2, C1, C2, …
 * — two IDs per letter, so an odd count ends on a letter's #1
 * (5 gives A1, A2, B1, B2, C1). A tournament without a team count
 * falls back to a pool of 20 (A1 … J2); the pool is generated,
 * never stored — assignments live on tournament_teams.team_code
 * (migration 0056).
 */
export const FALLBACK_POOL_SIZE = 20;

function letterName(index: number): string {
  // Spreadsheet-style letters: 0=A, …, 25=Z, 26=AA, 27=AB, …
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function teamIdPool(teamCount: number | null | undefined): string[] {
  const count = teamCount && teamCount > 0 ? teamCount : FALLBACK_POOL_SIZE;
  const pool: string[] = [];
  for (let i = 0; i < count; i++) {
    pool.push(`${letterName(Math.floor(i / 2))}${(i % 2) + 1}`);
  }
  return pool;
}
