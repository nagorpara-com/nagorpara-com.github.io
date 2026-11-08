import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Admin data for the two ক্রীড়া প্রতিযোগিতা (/sports) page
 * banners (migration 0049, columns on the single site_settings
 * row): the page-top banner and the banner above the
 * টুর্নামেন্ট section, each a photo URL plus a line of text
 * shown inside the banner. Read and written through a NARROW
 * query (the tolerated pattern of 0029/0037/0039): until the
 * migration is live the fetch errors, `migrationPending` turns
 * true, and the Admin page shows an honest notice instead of
 * the form. Saves are verified by reading the row back
 * (verify_admin_writes).
 */

export interface SportsBannerValues {
  sports_banner_url: string | null;
  sports_banner_title: string | null;
  sports_tournament_banner_url: string | null;
  sports_tournament_banner_title: string | null;
}

const COLUMNS =
  "sports_banner_url, sports_banner_title, sports_tournament_banner_url, sports_tournament_banner_title";

const EMPTY: SportsBannerValues = {
  sports_banner_url: null,
  sports_banner_title: null,
  sports_tournament_banner_url: null,
  sports_tournament_banner_title: null,
};

function asValues(row: Record<string, unknown>): SportsBannerValues {
  return {
    sports_banner_url: (row.sports_banner_url as string | null) ?? null,
    sports_banner_title: (row.sports_banner_title as string | null) ?? null,
    sports_tournament_banner_url: (row.sports_tournament_banner_url as string | null) ?? null,
    sports_tournament_banner_title: (row.sports_tournament_banner_title as string | null) ?? null,
  };
}

export function useAdminSportsBanners() {
  const [values, setValues] = useState<SportsBannerValues>(EMPTY);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select(COLUMNS)
        .eq("id", 1)
        .single();
      if (cancelled) return;
      setLoading(false);
      if (error) {
        if (error.code === "42703") {
          setMigrationPending(true);
        } else {
          setLoadError(error.message);
        }
        return;
      }
      setMigrationPending(false);
      if (data) setValues(asValues(data as unknown as Record<string, unknown>));
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  /** Save a partial banner update; read-back verified. Returns
   *  an error message or null. */
  const save = useCallback(
    async (patch: Partial<SportsBannerValues>): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase
        .from("site_settings")
        .update(patch)
        .eq("id", 1)
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        return "সংরক্ষণ হয়নি: site_settings-এর মূল সারি পাওয়া যায়নি, অথবা আপনার Role-এর সংরক্ষণের অনুমতি নেই (RLS)।";
      }
      const back = await supabase.from("site_settings").select(COLUMNS).eq("id", 1).single();
      if (back.error || !back.data) return "সংরক্ষণের পর যাচাই করা যায়নি — আবার চেষ্টা করুন।";
      const stored = asValues(back.data as unknown as Record<string, unknown>);
      for (const key of Object.keys(patch) as (keyof SportsBannerValues)[]) {
        if (stored[key] !== (patch[key] ?? null)) {
          return "সংরক্ষণ যাচাইয়ে মিল পাওয়া যায়নি — আবার চেষ্টা করুন।";
        }
      }
      setValues(stored);
      return null;
    },
    [],
  );

  return { isConfigured: isSupabaseConfigured, loading, loadError, migrationPending, values, reload, save };
}
