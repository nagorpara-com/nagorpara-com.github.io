import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { PlayerProfileSection, PlayerSectionItem } from "../types/database.types";
import { safeHttpUrl } from "../utils/safeUrl";

/**
 * Dynamic profile sections for ONE player (migration 0009), read for
 * the PUBLIC profile pages. Two layers keep unpublished content out:
 * the query asks only for visible sections (is_visible = true), and
 * the table's RLS policy returns rows only while the player is
 * published + active + unarchived — the database is the boundary,
 * this hook merely asks. Sections arrive in the admin's order
 * (display_order, then creation time as a stable tiebreak).
 *
 * `mediaItems` flattens the items of all media sections (in section
 * order) for the profile's Gallery tab; items whose URL is not a
 * safe http(s) URL are dropped here as well as at render time.
 */
export function usePlayerSections(playerId: string | undefined) {
  const [sections, setSections] = useState<PlayerProfileSection[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !playerId) {
      setSections([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("player_profile_sections")
        .select("*")
        .eq("player_id", playerId)
        .eq("is_visible", true)
        .order("display_order")
        .order("created_at");
      if (!cancelled) setSections((data ?? []) as PlayerProfileSection[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const mediaItems = useMemo<PlayerSectionItem[]>(
    () =>
      sections
        .filter((s) => s.section_type === "media")
        .flatMap((s) => (s.items ?? []).filter((it) => safeHttpUrl(it.url) !== null)),
    [sections],
  );

  return { sections, mediaItems };
}
