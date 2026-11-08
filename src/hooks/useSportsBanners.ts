import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * The two ক্রীড়া প্রতিযোগিতা (/sports) page banners, set from
 * the Admin "ক্রীড়া প্রতিযোগিতা ব্যানার" page (migration
 * 0049, columns on site_settings): the page-top banner and the
 * banner above the টুর্নামেন্ট section, each a photo URL plus a
 * line of text shown inside the banner. Read through a NARROW
 * query so that until the migration is live the query simply
 * errors and the page keeps its built-in fallbacks (green
 * gradient on top, no tournament strip) — nothing breaks.
 */
export interface SportsBanners {
  topUrl: string | null;
  topTitle: string | null;
  tournamentUrl: string | null;
  tournamentTitle: string | null;
}

const NONE: SportsBanners = {
  topUrl: null,
  topTitle: null,
  tournamentUrl: null,
  tournamentTitle: null,
};

export function useSportsBanners(): SportsBanners {
  const [banners, setBanners] = useState<SportsBanners>(NONE);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select(
          "sports_banner_url, sports_banner_title, sports_tournament_banner_url, sports_tournament_banner_title",
        )
        .eq("id", 1)
        .single();
      if (cancelled || error || !data) return;
      const row = data as unknown as Record<string, unknown>;
      setBanners({
        topUrl: (row.sports_banner_url as string | null) ?? null,
        topTitle: (row.sports_banner_title as string | null) ?? null,
        tournamentUrl: (row.sports_tournament_banner_url as string | null) ?? null,
        tournamentTitle: (row.sports_tournament_banner_title as string | null) ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return banners;
}
