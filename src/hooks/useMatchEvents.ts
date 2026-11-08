import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Match, MatchEvent, Player } from "../types/database.types";

/**
 * Admin data layer for one match's timeline events (Step D,
 * migration 0052).
 *
 * - Events are entered on the declaration page, under the
 *   Performance editor; the public match page reads the same
 *   rows (RLS: only published matches are visible to visitors).
 * - Create / delete are READ-BACK VERIFIED (the project's
 *   write-verification rule): an insert must return the stored
 *   row, and a delete must leave no row behind, before the UI
 *   reports success.
 * - FAIL-SOFT until migration 0052 is live: the table simply
 *   does not exist yet, so the first fetch detects that once
 *   (`tableMissing`), the panel shows the honest migration note
 *   and editing stays disabled — nothing else on the page is
 *   affected.
 */
export type EventPlayer = Pick<
  Player,
  "id" | "name" | "sport" | "status" | "team_id"
>;

export type MatchEventDraft = Omit<
  MatchEvent,
  "id" | "match_id" | "created_at" | "display_order"
>;

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const msg = error.message ?? "";
  return /match_events/i.test(msg) && /could not find|does not exist|schema cache/i.test(msg);
}

export function useMatchEvents(match: Match | null) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const matchId = match?.id ?? null;
  const sport = match?.sport ?? null;

  // One fetch round; never touches state itself — callers apply
  // the outcome after the await (the project's effect style).
  const fetchAll = useCallback(async (): Promise<{
    events: MatchEvent[];
    players: EventPlayer[];
    missing: boolean;
    error: string | null;
  }> => {
    if (!isSupabaseConfigured || !supabase || !matchId || !sport) {
      return { events: [], players: [], missing: false, error: null };
    }
    const [evRes, playerRes] = await Promise.all([
      supabase
        .from("match_events")
        .select("*")
        .eq("match_id", matchId)
        .order("display_order", { ascending: true })
        .order("minute", { ascending: true }),
      supabase
        .from("players")
        .select("id, name, sport, status, team_id")
        .eq("sport", sport)
        .eq("status", "published")
        .is("archived_at", null)
        .order("display_order"),
    ]);
    if (evRes.error) {
      if (isMissingTableError(evRes.error)) {
        // Migration 0052 not live yet — remembered once; the
        // panel shows the note instead of an error.
        return { events: [], players: [], missing: true, error: null };
      }
      return { events: [], players: [], missing: false, error: evRes.error.message };
    }
    if (playerRes.error) {
      return { events: [], players: [], missing: false, error: playerRes.error.message };
    }
    return {
      events: (evRes.data ?? []) as MatchEvent[],
      players: (playerRes.data ?? []) as EventPlayer[],
      missing: false,
      error: null,
    };
  }, [matchId, sport]);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetchAll();
    setLoading(false);
    if (r.missing) setTableMissing(true);
    if (r.error) {
      setLoadError(r.error);
      return;
    }
    setLoadError(null);
    setEvents(r.events);
    setPlayers(r.players);
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchAll();
      if (cancelled) return;
      if (r.missing) setTableMissing(true);
      if (r.error) {
        setLoadError(r.error);
        return;
      }
      setLoadError(null);
      setEvents(r.events);
      setPlayers(r.players);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  /** Create an event; the stored row must read back before success. */
  const addEvent = useCallback(
    async (draft: MatchEventDraft): Promise<{ error: string | null }> => {
      if (!supabase || !matchId) return { error: "আগে একটি ম্যাচ বেছে নিন।" };
      if (tableMissing) return { error: "Migration 0052 এখনো লাইভ হয়নি।" };
      const payload = {
        ...draft,
        match_id: matchId,
        display_order: events.length,
      };
      const { data, error } = await supabase
        .from("match_events")
        .insert(payload)
        .select("*")
        .single();
      if (error) {
        if (isMissingTableError(error)) {
          setTableMissing(true);
          return { error: "Migration 0052 এখনো লাইভ হয়নি।" };
        }
        return { error: error.message };
      }
      const row = data as MatchEvent | null;
      if (!row || row.match_id !== matchId || row.event_type !== draft.event_type) {
        return { error: "ঘটনাটি সংরক্ষিত হয়েছে কিনা যাচাই করা যায়নি — তালিকা আবার লোড করুন।" };
      }
      await reload();
      return { error: null };
    },
    [matchId, events.length, tableMissing, reload],
  );

  /** Delete an event; success only when the row is really gone. */
  const removeEvent = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase.from("match_events").delete().eq("id", id);
      if (error) return error.message;
      const { data, error: checkError } = await supabase
        .from("match_events")
        .select("id")
        .eq("id", id);
      if (checkError) return checkError.message;
      if (data && data.length > 0) {
        return "ঘটনাটি মোছা যায়নি — আবার চেষ্টা করুন।";
      }
      await reload();
      return null;
    },
    [reload],
  );

  return {
    events,
    players,
    loading,
    loadError,
    tableMissing,
    reload,
    addEvent,
    removeEvent,
  };
}
