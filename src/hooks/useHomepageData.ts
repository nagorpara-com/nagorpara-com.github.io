import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Player } from "../types/database.types";
import { PUBLIC_PLAYER_BASE_COLUMNS, PUBLIC_PLAYER_COLUMNS } from "./usePlayers";

export interface PlayerWithStats extends Player {
  matches: number;
  primaryStat: number; // goals (football) / runs (cricket)
  secondaryStat: number; // assists (football) / wickets (cricket)
}

export interface MatchRow {
  id: string;
  sport: string;
  opponent: string;
  match_date: string | null;
  venue: string | null;
  our_score: string | null;
  opponent_score: string | null;
  result: string | null;
  status: string;
}

export interface NewsRow {
  id: string;
  type: string;
  title: string;
  slug: string;
  content: string | null;
  cover_image_url: string | null;
  published_at: string | null;
}

export interface CommitteeRow {
  id: string;
  name: string;
  role_title: string;
  photo_url: string | null;
  phone: string | null;
  facebook_url: string | null;
}

export interface MemberRow {
  id: string;
  name: string;
  photo_url: string | null;
  phone: string | null;
  facebook_url: string | null;
  joined_date: string | null;
  display_order: number;
}

export interface FinancePublicSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  transactionCount: number;
}

export interface HomepageData {
  configured: boolean;
  footballPlayers: PlayerWithStats[];
  cricketPlayers: PlayerWithStats[];
  upcomingMatches: MatchRow[];
  recentResults: MatchRow[];
  news: NewsRow[];
  committee: CommitteeRow[];
  members: MemberRow[];
  finance: FinancePublicSummary | null;
}

const EMPTY: HomepageData = {
  configured: false,
  footballPlayers: [],
  cricketPlayers: [],
  upcomingMatches: [],
  recentResults: [],
  news: [],
  committee: [],
  members: [],
  finance: null,
};

/**
 * Homepage data (Phase 4).
 *
 * Until Supabase is connected this returns empty collections — the
 * homepage then renders honest empty states, never sample data.
 * When connected, every query respects the public RLS rules: only
 * published/active rows, and for finance ONLY rows flagged `is_public`,
 * totalled with the approved rule (withdrawals and transfers are NOT
 * expenses; balance = income − expense).
 */
export function useHomepageData(): HomepageData {
  const [data, setData] = useState<HomepageData>(EMPTY);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;

    (async () => {
      // Players use the shared PRIVACY column list (see
      // usePlayers): phone and address are never selected on a
      // public path; while migration 0051 is missing the FULL
      // list fails with 42703 and the BASE list takes over.
      const playersQuery = (cols: string) =>
        client.from("players").select(cols).eq("is_active", true).eq("status", "published").is("archived_at", null).order("display_order").limit(20);
      let playersRes = await playersQuery(PUBLIC_PLAYER_COLUMNS);
      if (playersRes.error && playersRes.error.code === "42703") {
        playersRes = await playersQuery(PUBLIC_PLAYER_BASE_COLUMNS);
      }
      const [
        fbStatsRes,
        ckStatsRes,
        matchesRes,
        noticePostsRes,
        activityPostsRes,
        newsPostsRes,
        committeeRes,
        financeRes,
      ] =
        await Promise.all([
          client.from("football_player_stats").select("*"),
          client.from("cricket_player_stats").select("*"),
          client.from("matches").select("*").eq("is_published", true).order("match_date", { ascending: false }).limit(10),
          client.from("news_posts").select("*").eq("is_published", true).eq("type", "notice").order("published_at", { ascending: false }).limit(6),
          client.from("news_posts").select("*").eq("is_published", true).eq("type", "activity").order("published_at", { ascending: false }).limit(6),
          client.from("news_posts").select("*").eq("is_published", true).eq("type", "news").order("published_at", { ascending: false }).limit(6),
          client.from("committee_public").select("*").order("display_order").limit(6),
          client.from("finance_transactions").select("type, amount").eq("is_public", true),
        ]);
      if (cancelled) return;

      // Homepage preview (owner, 2026-10-29): only the most
      // recently ADDED 6 members and 6 committee profiles show.
      // "Added" order needs created_at in the public views
      // (migration 0031). Until 0031 is applied live those queries
      // fail and the fallbacks below stay in charge: members by
      // joined date (newest first), committee by display_order.
      // Pre-0030 the members view also has no facebook_url —
      // the legacy select then keeps the message button on SMS.
      const membersWithFb = await client
        .from("members_public")
        .select("id, name, photo_url, phone, facebook_url, joined_date, display_order")
        .order("joined_date", { ascending: false, nullsFirst: false })
        .order("display_order", { ascending: true })
        .limit(6);
      let memberRows: MemberRow[];
      if (membersWithFb.error) {
        const legacy = await client
          .from("members_public")
          .select("id, name, photo_url, phone, joined_date, display_order")
          .order("joined_date", { ascending: false, nullsFirst: false })
          .order("display_order", { ascending: true })
          .limit(6);
        memberRows = ((legacy.data ?? []) as unknown as Omit<MemberRow, "facebook_url">[]).map((r) => ({
          ...r,
          facebook_url: null,
        }));
      } else {
        memberRows = (membersWithFb.data ?? []) as unknown as MemberRow[];
      }
      if (cancelled) return;

      const membersAdded = await client
        .from("members_public")
        .select("id, name, photo_url, phone, facebook_url, joined_date, display_order, created_at")
        .order("created_at", { ascending: false })
        .order("display_order", { ascending: true })
        .limit(6);
      if (!membersAdded.error && membersAdded.data) {
        memberRows = membersAdded.data as unknown as MemberRow[];
      }
      let committeeRows = (committeeRes.data ?? []) as CommitteeRow[];
      const committeeAdded = await client
        .from("committee_public")
        .select("*")
        .order("created_at", { ascending: false })
        .order("display_order", { ascending: true })
        .limit(6);
      if (!committeeAdded.error && committeeAdded.data) {
        committeeRows = committeeAdded.data as CommitteeRow[];
      }
      if (cancelled) return;

      const fbStats = new Map<string, { matches: number; goals: number; assists: number }>(
        (fbStatsRes.data ?? []).map((s: { player_id: string; matches: number; goals: number; assists: number }) => [s.player_id, s]),
      );
      const ckStats = new Map<string, { matches: number; runs: number; wickets: number }>(
        (ckStatsRes.data ?? []).map((s: { player_id: string; matches: number; runs: number; wickets: number }) => [s.player_id, s]),
      );

      const players = (playersRes.data ?? []) as unknown as Player[];
      const withStats = (p: Player): PlayerWithStats => {
        if (p.sport === "football") {
          const s = fbStats.get(p.id);
          return { ...p, matches: s?.matches ?? 0, primaryStat: s?.goals ?? 0, secondaryStat: s?.assists ?? 0 };
        }
        const s = ckStats.get(p.id);
        return { ...p, matches: s?.matches ?? 0, primaryStat: s?.runs ?? 0, secondaryStat: s?.wickets ?? 0 };
      };

      const matches = (matchesRes.data ?? []) as MatchRow[];
      const now = Date.now();
      const upcoming = matches
        .filter((m) => m.status === "upcoming" && (!m.match_date || new Date(m.match_date).getTime() >= now))
        .slice(0, 3);
      const results = matches.filter((m) => m.status === "completed").slice(0, 3);

      let finance: FinancePublicSummary | null = null;
      const txns = (financeRes.data ?? []) as { type: string; amount: number }[];
      if (txns.length > 0) {
        const incomeTypes = ["income", "subscription", "donation"];
        const totalIncome = txns.filter((t) => incomeTypes.includes(t.type)).reduce((sum, t) => sum + Number(t.amount), 0);
        const totalExpense = txns.filter((t) => t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);
        finance = {
          totalIncome,
          totalExpense,
          balance: totalIncome - totalExpense,
          transactionCount: txns.length,
        };
      }

      setData({
        configured: true,
        footballPlayers: players.filter((p) => p.sport === "football").slice(0, 4).map(withStats),
        cricketPlayers: players.filter((p) => p.sport === "cricket").slice(0, 4).map(withStats),
        upcomingMatches: upcoming,
        recentResults: results,
        news: [
          ...((noticePostsRes.data ?? []) as NewsRow[]),
          ...((activityPostsRes.data ?? []) as NewsRow[]),
          ...((newsPostsRes.data ?? []) as NewsRow[]),
        ],
        committee: committeeRows,
        members: memberRows,
        finance,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
