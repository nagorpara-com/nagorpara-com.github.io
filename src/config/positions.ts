/**
 * Canonical position groups used by the squad filter tabs
 * (Reference Panels 03/05). Player positions are stored in the
 * database as free text (usually English, e.g. "Forward"); a player
 * belongs to a group when the stored position matches the group's key.
 * Counts on the tabs are always computed from real player data.
 */
export interface PositionGroup {
  key: string;
  labelBn: string;
  /** lowercase substrings matched against the stored position text */
  match: string[];
}

export const FOOTBALL_POSITIONS: PositionGroup[] = [
  { key: "forward", labelBn: "ফরোয়ার্ড", match: ["forward", "striker", "winger"] },
  { key: "midfielder", labelBn: "মিডফিল্ডার", match: ["midfield"] },
  { key: "defender", labelBn: "ডিফেন্ডার", match: ["defend", "back"] },
  { key: "goalkeeper", labelBn: "গোলকিপার", match: ["goalkeeper", "goal keeper", "keeper"] },
];

/** Cricket playing-role groups (Reference Panel 05 filter tabs). */
export const CRICKET_ROLES: PositionGroup[] = [
  { key: "batsman", labelBn: "ব্যাটসম্যান", match: ["batsman", "batter", "opener"] },
  { key: "bowler", labelBn: "বোলার", match: ["bowler"] },
  { key: "allrounder", labelBn: "অল-রাউন্ডার", match: ["all-rounder", "all rounder", "allrounder"] },
  { key: "wicketkeeper", labelBn: "উইকেট কিপার", match: ["wicket"] },
];

export function positionGroupOf(position: string, groups: PositionGroup[]): string | null {
  const text = position.toLowerCase();
  for (const group of groups) {
    if (group.match.some((needle) => text.includes(needle))) return group.key;
  }
  return null;
}

/**
 * Step B (migration 0051) structured extras. Cricket roles are
 * stored as stable English values in players.role; the Bengali
 * label is what people read, and `positionText` is the English
 * text the save also keeps in the legacy free-text `position`
 * column so every older display (squad filter tabs, stats page)
 * keeps working unchanged.
 */
export const CRICKET_ROLE_OPTIONS: { value: string; labelBn: string; positionText: string }[] = [
  { value: "batsman", labelBn: "ব্যাটসম্যান", positionText: "Batsman" },
  { value: "bowler", labelBn: "বোলার", positionText: "Bowler" },
  { value: "all_rounder", labelBn: "অল-রাউন্ডার", positionText: "All-Rounder" },
  { value: "wicket_keeper", labelBn: "উইকেট কিপার", positionText: "Wicket Keeper" },
];

export function cricketRoleLabelBn(role: string | null | undefined): string | null {
  return CRICKET_ROLE_OPTIONS.find((o) => o.value === role)?.labelBn ?? null;
}

export function cricketRolePositionText(role: string | null | undefined): string | null {
  return CRICKET_ROLE_OPTIONS.find((o) => o.value === role)?.positionText ?? null;
}

/** Best-effort role for an older cricket row that only carries a
 * free-text position (used to prefill the form's ভূমিকা select). */
export function cricketRoleFromPosition(position: string | null | undefined): string {
  if (!position) return "";
  const group = positionGroupOf(position, CRICKET_ROLES);
  if (group === "batsman") return "batsman";
  if (group === "bowler") return "bowler";
  if (group === "allrounder") return "all_rounder";
  if (group === "wicketkeeper") return "wicket_keeper";
  return "";
}

/** Football preferred-foot values (migration 0051). */
export const PREFERRED_FOOT_OPTIONS: { value: string; labelBn: string }[] = [
  { value: "right", labelBn: "ডান পা" },
  { value: "left", labelBn: "বাম পা" },
  { value: "both", labelBn: "দুটোই" },
];

export function preferredFootLabelBn(foot: string | null | undefined): string | null {
  return PREFERRED_FOOT_OPTIONS.find((o) => o.value === foot)?.labelBn ?? null;
}
