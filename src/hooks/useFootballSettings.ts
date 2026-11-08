import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { FOOTBALL_DEFAULTS, type FootballSettings, type StatKey } from "../config/football";
import { fetchOwnTeamIdentity } from "./useTeams";

const STAT_KEYS: StatKey[] = ["matches", "goals", "assists", "yellow_cards", "red_cards"];

/**
 * Football team settings from the `site_settings` row (migration 0004
 * football_* columns) — team name, current season, layout, sorting and
 * which stats player cards show. Owner defaults apply until Supabase
 * is connected or the row exists; the Admin Panel edits the same row.
 */
export function useFootballSettings(): FootballSettings {
  const [settings, setSettings] = useState<FootballSettings>(FOOTBALL_DEFAULTS);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;

    (async () => {
      const { data } = await client
        .from("site_settings")
        .select("football_team_name, football_current_season, football_layout, football_sorting, football_card_stats")
        .eq("id", 1)
        .single();
      if (cancelled || !data) return;
      const row = data as {
        football_team_name?: string;
        football_current_season?: string;
        football_layout?: string;
        football_sorting?: string;
        football_card_stats?: unknown;
      };
      const cardStats = Array.isArray(row.football_card_stats)
        ? (row.football_card_stats.filter((k): k is StatKey => STAT_KEYS.includes(k as StatKey)) as StatKey[])
        : FOOTBALL_DEFAULTS.cardStats;
      setSettings({
        teamName: row.football_team_name || FOOTBALL_DEFAULTS.teamName,
        currentSeason: row.football_current_season || FOOTBALL_DEFAULTS.currentSeason,
        teamLogoUrl: null,
        layout: "grid",
        sorting: "custom",
        cardStats: cardStats.length > 0 ? cardStats : FOOTBALL_DEFAULTS.cardStats,
      });

      // Team logo (migration 0025) is read in its OWN query on
      // purpose: until 0025 is applied the column does not exist,
      // and folding it into the main select above would break
      // every football setting. A failed read simply keeps the
      // fallback (organization logo).
      const logoRes = await client
        .from("site_settings")
        .select("football_team_logo_url")
        .eq("id", 1)
        .single();
      if (!cancelled && !logoRes.error && logoRes.data) {
        const logo = (logoRes.data as { football_team_logo_url?: string | null }).football_team_logo_url;
        if (logo) {
          setSettings((prev) => ({ ...prev, teamLogoUrl: logo }));
        }
      }

      // Own-team link (migration 0048): when Team Settings
      // links a registered team as OUR team, that registry row
      // wins for the public name (and logo, when it has one) —
      // one source of truth in টিম-নিবন্ধন. Unresolved links
      // (not linked, unpublished, pre-0048) keep the settings
      // values loaded above.
      if (cancelled) return;
      const own = await fetchOwnTeamIdentity("football");
      if (cancelled || !own) return;
      setSettings((prev) => ({
        ...prev,
        teamName: own.name,
        teamLogoUrl: own.logoUrl ?? prev.teamLogoUrl,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
