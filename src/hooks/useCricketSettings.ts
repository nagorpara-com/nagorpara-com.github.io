import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { CRICKET_DEFAULTS, type CricketSettings, type CricketStatKey } from "../config/cricket";
import { fetchOwnTeamIdentity } from "./useTeams";

const STAT_KEYS: CricketStatKey[] = ["matches", "runs", "wickets", "catches"];

/**
 * Cricket team settings from the `site_settings` row (migration 0005
 * cricket_* columns) — team name, current season, layout, sorting and
 * card stats. The columns start NULL (no owner-provided name/season),
 * so generic fallbacks apply until an Admin sets real values in the
 * Admin Panel; edits persist in the database across refresh.
 */
export function useCricketSettings(): CricketSettings {
  const [settings, setSettings] = useState<CricketSettings>(CRICKET_DEFAULTS);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;

    (async () => {
      const { data } = await client
        .from("site_settings")
        .select("cricket_team_name, cricket_current_season, cricket_layout, cricket_sorting, cricket_card_stats")
        .eq("id", 1)
        .single();
      if (cancelled || !data) return;
      const row = data as {
        cricket_team_name?: string | null;
        cricket_current_season?: string | null;
        cricket_card_stats?: unknown;
      };
      const cardStats = Array.isArray(row.cricket_card_stats)
        ? (row.cricket_card_stats.filter((k): k is CricketStatKey => STAT_KEYS.includes(k as CricketStatKey)) as CricketStatKey[])
        : CRICKET_DEFAULTS.cardStats;
      setSettings({
        teamName: row.cricket_team_name || CRICKET_DEFAULTS.teamName,
        currentSeason: row.cricket_current_season || CRICKET_DEFAULTS.currentSeason,
        teamLogoUrl: null,
        layout: "grid",
        sorting: "custom",
        cardStats: cardStats.length > 0 ? cardStats : CRICKET_DEFAULTS.cardStats,
      });

      // Team logo (migration 0042) is read in its OWN query on
      // purpose — the same pattern as the football settings hook:
      // until 0042 is applied the column does not exist, and
      // folding it into the main select above would break every
      // cricket setting. A failed read simply keeps the fallback
      // (organization logo).
      const logoRes = await client
        .from("site_settings")
        .select("cricket_team_logo_url")
        .eq("id", 1)
        .single();
      if (!cancelled && !logoRes.error && logoRes.data) {
        const logo = (logoRes.data as { cricket_team_logo_url?: string | null }).cricket_team_logo_url;
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
      const own = await fetchOwnTeamIdentity("cricket");
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
