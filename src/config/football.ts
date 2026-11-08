/**
 * Football team settings — defaults set by the project owner
 * (Phase 6 management rules). The same values live in the database
 * (`site_settings` football_* columns, migration 0004) and are
 * editable from the Admin Panel; these defaults apply until then.
 */
export type StatKey = "matches" | "goals" | "assists" | "yellow_cards" | "red_cards";

export interface FootballSettings {
  teamName: string;
  currentSeason: string;
  /** Team's own logo (migration 0025, site_settings
   * football_team_logo_url). Null = fall back to the org logo. */
  teamLogoUrl: string | null;
  layout: "grid";
  sorting: "custom";
  cardStats: StatKey[];
}

export const FOOTBALL_DEFAULTS: FootballSettings = {
  teamName: "নগর পাড়া ফুটবল টিম",
  currentSeason: "2026",
  teamLogoUrl: null,
  layout: "grid",
  sorting: "custom",
  cardStats: ["matches", "goals", "assists", "yellow_cards", "red_cards"],
};

export const STAT_LABELS: Record<StatKey, string> = {
  matches: "ম্যাচ",
  goals: "গোল",
  assists: "অ্যাসিস্ট",
  yellow_cards: "হলুদ কার্ড",
  red_cards: "লাল কার্ড",
};
