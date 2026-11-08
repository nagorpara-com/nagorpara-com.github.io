/**
 * Cricket team settings — stored in the database (`site_settings`
 * cricket_* columns, migration 0005) and editable from the Admin
 * Panel. Unlike football, the owner has NOT provided an official
 * cricket team name or season, so the fallbacks here are generic
 * labels only ("ক্রিকেট টিম"); the current-season fallback mirrors
 * the owner-set football season (2026). Admins set the real values
 * in the database — nothing official is invented here.
 */
export type CricketStatKey = "matches" | "runs" | "wickets" | "catches";

export interface CricketSettings {
  teamName: string;
  currentSeason: string;
  teamLogoUrl: string | null;
  layout: "grid";
  sorting: "custom";
  cardStats: CricketStatKey[];
}

export const CRICKET_DEFAULTS: CricketSettings = {
  teamName: "ক্রিকেট টিম",
  currentSeason: "2026",
  teamLogoUrl: null,
  layout: "grid",
  sorting: "custom",
  cardStats: ["matches", "runs", "wickets", "catches"],
};

export const CRICKET_STAT_LABELS: Record<CricketStatKey, string> = {
  matches: "ম্যাচ",
  runs: "রান",
  wickets: "উইকেট",
  catches: "ক্যাচ",
};
