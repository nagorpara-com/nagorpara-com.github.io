import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

import type { VillageArea } from "../utils/villageSection";

export interface VillageSectionRow {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  /** Migration 0038 — null until it is live / when no video. */
  video_url: string | null;
  display_order: number;
  area: VillageArea;
}

/**
 * Village Profile content (Phase 5).
 *
 * Reuses the EXISTING `village_sections` table from migration 0001 —
 * no new schema is needed: each row is one section with a title, body
 * text, optional image, publish flag and display order, all editable
 * from the Admin Panel.
 *
 * Returns `null` while Supabase is not connected (or no published rows
 * exist); the page then renders its confirmed-facts default layout with
 * honest empty states for history / places / nature.
 */
export function useVillageSections(): VillageSectionRow[] | null {
  const [rows, setRows] = useState<VillageSectionRow[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    const base = "id, title, content, image_url, display_order, area";
    const load = (columns: string) =>
      supabase!
        .from("village_sections")
        .select(columns)
        .eq("is_published", true)
        .order("display_order");
    // video_url exists only after migration 0038 — try the full
    // column set first, fall back to the base set so the public
    // page never regresses before the migration is live.
    load(`${base.split(", ").slice(0, 4).join(", ")}, video_url, display_order, area`).then(
      ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          void load(base).then(({ data: baseData, error: baseError }) => {
            if (cancelled || baseError || !baseData || baseData.length === 0) return;
            setRows(
              (baseData as unknown as Array<Record<string, unknown>>).map((r) => ({
                ...(r as object),
                video_url: null,
              })) as VillageSectionRow[],
            );
          });
          return;
        }
        if (!data || data.length === 0) return;
        setRows(data as unknown as VillageSectionRow[]);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return rows;
}
