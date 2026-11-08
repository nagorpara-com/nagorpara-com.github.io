import { useEffect } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { applySeoMeta } from "../utils/seoMeta";

/**
 * Public runtime for the SEO ও মেটা settings (migration 0039):
 * one tolerant fetch of the SEO columns + the org name, then
 * applySeoMeta. Before 0039 is live the fetch errors and the
 * built-in index.html tags simply stay — no visible change and
 * no console-visible failure for visitors.
 */
export function useSeoMeta() {
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    supabase
      .from("site_settings")
      .select("meta_title, meta_description, meta_keywords, og_image_url, org_name_bn")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const row = data as unknown as Record<string, unknown>;
        applySeoMeta({
          meta_title: (row.meta_title as string | null) ?? null,
          meta_description: (row.meta_description as string | null) ?? null,
          meta_keywords: (row.meta_keywords as string | null) ?? null,
          og_image_url: (row.og_image_url as string | null) ?? null,
          org_name: (row.org_name_bn as string | null) ?? null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);
}
