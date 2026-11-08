import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Sport, Team } from "../types/database.types";

export interface TeamInput {
  sport: Sport;
  name: string;
  logoUrl: string | null;
  isPublished: boolean;
  displayOrder: number;
  /** Whose name the team is registered under (migration 0047);
   * "" means not recorded. */
  ownerName: string;
  /** Migration 0050 extras; "" means not recorded. */
  shortName: string;
  establishedDate: string;
  captainName: string;
  coachName: string;
  jerseyColor: string;
  jerseyColorHex: string;
  phone: string;
}

const BASE_COLUMNS = "id, sport, name, logo_url, is_published, display_order, created_at";
/** Migration 0050 columns, probed as ONE group (the 0047 pattern). */
const EXTRAS_COLUMNS =
  "short_name, established_date, captain_name, coach_name, jersey_color, jersey_color_hex, phone";

function toInput(row: Team): TeamInput {
  return {
    sport: row.sport,
    name: row.name,
    logoUrl: row.logo_url,
    isPublished: row.is_published,
    displayOrder: row.display_order,
    ownerName: row.registered_by_name ?? "",
    shortName: row.short_name ?? "",
    establishedDate: row.established_date ?? "",
    captainName: row.captain_name ?? "",
    coachName: row.coach_name ?? "",
    jerseyColor: row.jersey_color ?? "",
    jerseyColorHex: row.jersey_color_hex ?? "",
    phone: row.phone ?? "",
  };
}

function sameTeam(
  a: Team,
  b: TeamInput,
  ownerCol: boolean,
  extrasCol: boolean,
): boolean {
  return (
    a.sport === b.sport &&
    a.name === b.name &&
    (a.logo_url ?? null) === (b.logoUrl ?? null) &&
    a.is_published === b.isPublished &&
    a.display_order === b.displayOrder &&
    (!ownerCol || (a.registered_by_name ?? "") === b.ownerName.trim()) &&
    (!extrasCol ||
      ((a.short_name ?? "") === b.shortName.trim() &&
        (a.established_date ?? "") === b.establishedDate &&
        (a.captain_name ?? "") === b.captainName.trim() &&
        (a.coach_name ?? "") === b.coachName.trim() &&
        (a.jersey_color ?? "") === b.jerseyColor.trim() &&
        (a.jersey_color_hex ?? "").toLowerCase() === b.jerseyColorHex.toLowerCase() &&
        (a.phone ?? "") === b.phone.trim()))
  );
}

/** The 0050 payload for a save; only spread in when the columns
 * are supported, so pre-0050 saves omit the group entirely. */
function extrasPayload(input: TeamInput) {
  return {
    short_name: input.shortName.trim() || null,
    established_date: input.establishedDate || null,
    captain_name: input.captainName.trim() || null,
    coach_name: input.coachName.trim() || null,
    jersey_color: input.jerseyColor.trim() || null,
    jersey_color_hex: input.jerseyColorHex || null,
    phone: input.phone.trim() || null,
  };
}

/**
 * Admin side of the Teams system (migration 0043): every team,
 * published or not, in display order. All writes are VERIFIED
 * (the verify_admin_writes rule): a create reads the new row
 * back by id, an update compares every field after re-reading,
 * and a delete confirms the row is gone.
 *
 * Until migration 0043 is applied live the table does not exist
 * and `unsupported` is set (PostgREST PGRST205 / 42P01), so the
 * page can say so honestly instead of failing.
 */
export function useAdminTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Migration 0047 (teams.registered_by_name) support: the first
  // load tries the full column set; a 42703 (column missing)
  // flips support off and the load retries with the base
  // columns, so the page keeps working pre-migration and the
  // form can show an honest note (the players.club pattern).
  const [ownerSupported, setOwnerSupported] = useState(true);
  const ownerColRef = useRef(true);
  // Migration 0050 (team extras) support, probed the same way:
  // the first load tries the full column set; a 42703 flips the
  // group off and the load retries without it. The ladder drops
  // the extras group first because 0047 is the older migration —
  // whenever both are missing, 0050 is missing too.
  const [extrasSupported, setExtrasSupported] = useState(true);
  const extrasColRef = useRef(true);
  // Migration 0055's per-sport teams.team_code is SUPERSEDED by
  // the tournament Team ID of migration 0056 (owner's final
  // model, 2026-11-05): the column stays in the database,
  // dormant — this hook no longer reads or writes it.

  const currentColumns = useCallback(() => {
    let cols = BASE_COLUMNS;
    if (ownerColRef.current) cols += ", registered_by_name";
    if (extrasColRef.current) cols += ", " + EXTRAS_COLUMNS;
    return cols;
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setLoadError("Supabase সংযুক্ত নয়।");
      return;
    }
    setLoading(true);
    const run = (cols: string) =>
      supabase!
        .from("teams")
        .select(cols)
        .order("sport", { ascending: true })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
    let { data, error } = await run(currentColumns());
    if (error && error.code === "42703" && extrasColRef.current) {
      extrasColRef.current = false;
      setExtrasSupported(false);
      ({ data, error } = await run(currentColumns()));
    }
    if (error && error.code === "42703" && ownerColRef.current) {
      ownerColRef.current = false;
      setOwnerSupported(false);
      ({ data, error } = await run(BASE_COLUMNS));
    }
    setLoading(false);
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") {
        setUnsupported(true);
        setTeams([]);
        return;
      }
      setLoadError(error.message);
      return;
    }
    setUnsupported(false);
    setLoadError(null);
    setTeams((data ?? []) as unknown as Team[]);
  }, [currentColumns]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Creates return the verified saved row too — the caller
   * (Team ID assignment, print) needs the new team's id. */
  const createTeam = useCallback(
    async (input: TeamInput): Promise<{ error: string | null; row: Team | null }> => {
      if (!supabase) return { error: "Supabase সংযুক্ত নয়।", row: null };
      const { data, error } = await supabase
        .from("teams")
        .insert({
          sport: input.sport,
          name: input.name,
          logo_url: input.logoUrl,
          is_published: input.isPublished,
          display_order: input.displayOrder,
          ...(ownerColRef.current ? { registered_by_name: input.ownerName.trim() || null } : {}),
          ...(extrasColRef.current ? extrasPayload(input) : {}),
        })
        .select(currentColumns())
        .single();
      if (error || !data)
        return { error: error?.message ?? "টিম যোগ করা যায়নি।", row: null };
      const row = data as unknown as Team;
      if (!sameTeam(row, input, ownerColRef.current, extrasColRef.current))
        return { error: "সংরক্ষিত তথ্য মিলছে না — তালিকা আবার লোড করুন।", row: null };
      await load();
      return { error: null, row };
    },
    [load, currentColumns],
  );

  const updateTeam = useCallback(
    async (id: string, input: TeamInput): Promise<{ error: string | null; row: Team | null }> => {
      if (!supabase) return { error: "Supabase সংযুক্ত নয়।", row: null };
      const { error } = await supabase
        .from("teams")
        .update({
          sport: input.sport,
          name: input.name,
          logo_url: input.logoUrl,
          is_published: input.isPublished,
          display_order: input.displayOrder,
          ...(ownerColRef.current ? { registered_by_name: input.ownerName.trim() || null } : {}),
          ...(extrasColRef.current ? extrasPayload(input) : {}),
        })
        .eq("id", id);
      if (error) return { error: error.message, row: null };
      const { data, error: readErr } = await supabase
        .from("teams")
        .select(currentColumns())
        .eq("id", id)
        .single();
      if (readErr || !data) return { error: "সংরক্ষণের পর যাচাই করা যায়নি।", row: null };
      const row = data as unknown as Team;
      if (!sameTeam(row, input, ownerColRef.current, extrasColRef.current))
        return { error: "সংরক্ষিত তথ্য মিলছে না — আবার চেষ্টা করুন।", row: null };
      await load();
      return { error: null, row };
    },
    [load, currentColumns],
  );

  const setPublished = useCallback(
    async (row: Team, next: boolean): Promise<string | null> => {
      const res = await updateTeam(row.id, { ...toInput(row), isPublished: next });
      return res.error;
    },
    [updateTeam],
  );

  const deleteTeam = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) return error.message;
      const { data } = await supabase.from("teams").select("id").eq("id", id).maybeSingle();
      if (data) return "মুছে ফেলার পরও টিমটি রয়ে গেছে — আবার চেষ্টা করুন।";
      await load();
      return null;
    },
    [load],
  );

  return {
    teams,
    loading,
    unsupported,
    ownerSupported,
    extrasSupported,
    loadError,
    reload: load,
    createTeam,
    updateTeam,
    setPublished,
    deleteTeam,
  };
}

/**
 * Public side: PUBLISHED teams only (RLS enforces it too), used
 * to show a team's logo next to the opponent name on public
 * match cards and in the admin match form's opponent picker.
 * Fails soft — until migration 0043 is live, or on any error,
 * the list is simply empty and names render as before.
 */
let publishedTeamsCache: Team[] | null = null;
let publishedTeamsInFlight: Promise<Team[]> | null = null;

/** Public column sets, newest first: the extras the public team
 * pages render (0047's owner name + 0050's captain / coach /
 * founding date / jersey hex). While a migration is missing the
 * select fails with 42703 and the next set down is tried, so the
 * public site keeps working unchanged at every stage. */
const PUBLIC_TEAM_COLUMNS =
  BASE_COLUMNS + ", registered_by_name, captain_name, coach_name, established_date, jersey_color_hex";
const PUBLIC_TEAM_COLUMNS_0047 = BASE_COLUMNS + ", registered_by_name";

async function fetchPublishedTeams(): Promise<Team[]> {
  if (publishedTeamsCache) return publishedTeamsCache;
  if (publishedTeamsInFlight) return publishedTeamsInFlight;
  if (!isSupabaseConfigured || !supabase) return [];
  const client = supabase;
  publishedTeamsInFlight = (async () => {
    const run = (cols: string) =>
      client
        .from("teams")
        .select(cols)
        .eq("is_published", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
    let { data, error } = await run(PUBLIC_TEAM_COLUMNS);
    if (error && error.code === "42703") ({ data, error } = await run(PUBLIC_TEAM_COLUMNS_0047));
    if (error && error.code === "42703") ({ data, error } = await run(BASE_COLUMNS));
    publishedTeamsInFlight = null;
    if (error || !data) return [];
    publishedTeamsCache = data as unknown as Team[];
    return publishedTeamsCache;
  })();
  return publishedTeamsInFlight;
}

export function usePublishedTeams() {
  const [teams, setTeams] = useState<Team[]>(publishedTeamsCache ?? []);

  useEffect(() => {
    let cancelled = false;
    void fetchPublishedTeams().then((rows) => {
      if (!cancelled && rows.length > 0) setTeams(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return teams;
}

/** The published team whose name exactly matches a match's
 * opponent text for that sport — or null (free-text opponents
 * and teams without a logo simply render their name). */
export function findOpponentTeam(
  teams: Team[],
  sport: Sport | string,
  opponent: string,
): Team | null {
  const wanted = opponent.trim().toLowerCase();
  if (!wanted) return null;
  return (
    teams.find(
      (t) => t.sport === sport && t.name.trim().toLowerCase() === wanted,
    ) ?? null
  );
}

/**
 * The organization's OWN team identity for a sport, resolved
 * through the Team Settings link (migration 0048): the sport's
 * `<sport>_team_id` is read from site_settings in a NARROW
 * query — until 0048 is live the column does not exist, the
 * read fails and this returns null, so every caller keeps its
 * settings fallback. Anonymous reads only see PUBLISHED teams
 * (RLS), so an unpublished or deleted link also resolves to
 * null. When it resolves, the registry row is the single
 * source of truth for the team's public name (and logo, when
 * the team has one).
 */
export async function fetchOwnTeamIdentity(
  sport: Sport,
): Promise<{ name: string; logoUrl: string | null } | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const column = sport === "football" ? "football_team_id" : "cricket_team_id";
  const linkRes = await supabase
    .from("site_settings")
    .select(column)
    .eq("id", 1)
    .single();
  if (linkRes.error || !linkRes.data) return null;
  const teamId = (linkRes.data as unknown as Record<string, string | null>)[column];
  if (!teamId) return null;
  const teamRes = await supabase
    .from("teams")
    .select("name, logo_url")
    .eq("id", teamId)
    .maybeSingle();
  if (teamRes.error || !teamRes.data) return null;
  const row = teamRes.data as { name: string; logo_url: string | null };
  return { name: row.name, logoUrl: row.logo_url };
}
