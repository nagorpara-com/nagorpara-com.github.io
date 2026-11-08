import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Sport } from "../types/database.types";

/**
 * Admin Dashboard data (§1).
 *
 * Every number and list comes from a real query under the signed-in
 * user's JWT, so Row Level Security decides what each role sees —
 * this hook never bypasses it:
 * - Player / match / tournament / member counts follow the caller's
 *   read policies (a viewer therefore counts published content only).
 * - The unread-messages count is only requested for admin profiles:
 *   contact_messages are readable by is_admin() only, so asking as
 *   any other role could only fail.
 * - Finance totals and the finance activity list are only requested
 *   for finance roles (can_manage_finance set). Totals are aggregated
 *   from finance_transactions rows by type, applying the owner's
 *   approved rule: balance = (income + subscription + donation)
 *   − expense; withdrawal and transfer never reduce the balance.
 * - The GENERAL audit log (audit_logs, migration 0020) is rendered by
 *   the page itself through useAdminAuditLog, for admin profiles
 *   only; this hook's `activity` slice stays the finance audit trail
 *   for finance roles.
 */

export interface DashboardStats {
  activeMembers: number | null;
  footballPlayers: number | null;
  cricketPlayers: number | null;
  totalMatches: number | null;
  ongoingTournaments: number | null;
  /** Admin profiles only; null for every other role. */
  unreadMessages: number | null;
}

export interface DashboardMatch {
  id: string;
  sport: Sport;
  opponent: string;
  match_date: string;
  status: string;
  tournamentName: string | null;
}

export interface DashboardNewsItem {
  id: string;
  title: string;
  type: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export interface DashboardFinance {
  income: number;
  subscription: number;
  donation: number;
  expense: number;
  withdrawn: number;
  transferred: number;
  balance: number;
}

export interface DashboardActivityItem {
  id: string;
  action: string;
  /** finance_audit_logs timestamp column is `changed_at`
   *  (migration 0001) — there is no `created_at` on that table. */
  changed_at: string;
}

export interface DashboardMemberItem {
  id: string;
  name: string;
  joined_date: string | null;
  created_at: string;
}

export interface DashboardData {
  loading: boolean;
  error: string | null;
  stats: DashboardStats;
  upcomingMatches: DashboardMatch[];
  completedMatches: DashboardMatch[];
  recentNews: DashboardNewsItem[];
  recentMembers: DashboardMemberItem[];
  /** Finance roles only; null otherwise. */
  finance: DashboardFinance | null;
  /** Finance audit trail (finance roles); empty for other roles. */
  activity: DashboardActivityItem[];
}

const EMPTY_STATS: DashboardStats = {
  activeMembers: null,
  footballPlayers: null,
  cricketPlayers: null,
  totalMatches: null,
  ongoingTournaments: null,
  unreadMessages: null,
};

interface MatchRow {
  id: string;
  sport: Sport;
  opponent: string;
  match_date: string;
  status: string;
  tournament_id: string | null;
}

export function useAdminDashboard(options: {
  isAdminRole: boolean;
  isFinanceRole: boolean;
}): DashboardData {
  const { isAdminRole, isFinanceRole } = options;
  const [state, setState] = useState<Omit<DashboardData, "loading" | "error">>({
    stats: EMPTY_STATS,
    upcomingMatches: [],
    completedMatches: [],
    recentNews: [],
    recentMembers: [],
    finance: null,
    activity: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase এখনো সংযুক্ত হয়নি — ড্যাশবোর্ডের তথ্য দেখানো যাচ্ছে না।");
      return;
    }
    setLoading(true);
    setError(null);
    const client = supabase;
    let failed = false;
    const count = async (
      table: string,
      eq?: Record<string, string | boolean>,
    ): Promise<number | null> => {
      let q = client.from(table).select("*", { count: "exact", head: true });
      for (const [col, val] of Object.entries(eq ?? {})) {
        q = q.eq(col, val);
      }
      const { count: c, error: e } = await q;
      if (e) {
        failed = true;
        return null;
      }
      return c ?? 0;
    };

    const [
      activeMembers,
      footballPlayers,
      cricketPlayers,
      totalMatches,
      ongoingTournaments,
      unreadMessages,
    ] = await Promise.all([
      count("members", { is_active: true }),
      count("players", { sport: "football" }),
      count("players", { sport: "cricket" }),
      count("matches"),
      count("tournaments", { status: "ongoing" }),
      isAdminRole
        ? count("contact_messages", { is_read: false })
        : Promise.resolve(null),
    ]);

    const [tournamentRes, upcomingRes, completedRes, newsRes, membersRes] =
      await Promise.all([
        client.from("tournaments").select("id, name"),
        client
          .from("matches")
          .select("id, sport, opponent, match_date, status, tournament_id")
          .in("status", ["upcoming", "live", "postponed", "rescheduled", "abandoned"])
          .order("match_date", { ascending: true })
          .limit(3),
        client
          .from("matches")
          .select("id, sport, opponent, match_date, status, tournament_id")
          .eq("status", "completed")
          .order("match_date", { ascending: false })
          .limit(3),
        client
          .from("news_posts")
          .select("id, title, type, is_published, published_at, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        client
          .from("members")
          .select("id, name, joined_date, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(4),
      ]);
    for (const r of [tournamentRes, upcomingRes, completedRes, newsRes, membersRes]) {
      if (r.error) failed = true;
    }
    const tournamentName = new Map(
      ((tournamentRes.data ?? []) as { id: string; name: string }[]).map((t) => [
        t.id,
        t.name,
      ]),
    );
    const mapMatch = (m: MatchRow): DashboardMatch => ({
      id: m.id,
      sport: m.sport,
      opponent: m.opponent,
      match_date: m.match_date,
      status: m.status,
      tournamentName: m.tournament_id
        ? (tournamentName.get(m.tournament_id) ?? null)
        : null,
    });

    let finance: DashboardFinance | null = null;
    let activity: DashboardActivityItem[] = [];
    if (isFinanceRole) {
      const [txnRes, auditRes] = await Promise.all([
        client.from("finance_transactions").select("type, amount"),
        client
          .from("finance_audit_logs")
          .select("id, action, changed_at")
          .order("changed_at", { ascending: false })
          .limit(5),
      ]);
      if (txnRes.error || auditRes.error) failed = true;
      if (!txnRes.error) {
        const sums: Record<string, number> = {
          income: 0,
          subscription: 0,
          donation: 0,
          expense: 0,
          withdrawal: 0,
          transfer: 0,
        };
        for (const row of (txnRes.data ?? []) as {
          type: string;
          amount: number;
        }[]) {
          if (row.type in sums) sums[row.type] += Number(row.amount) || 0;
        }
        finance = {
          income: sums.income,
          subscription: sums.subscription,
          donation: sums.donation,
          expense: sums.expense,
          withdrawn: sums.withdrawal,
          transferred: sums.transfer,
          balance:
            sums.income + sums.subscription + sums.donation - sums.expense,
        };
      }
      if (!auditRes.error) {
        activity = (auditRes.data ?? []) as DashboardActivityItem[];
      }
    }

    setState({
      stats: {
        activeMembers,
        footballPlayers,
        cricketPlayers,
        totalMatches,
        ongoingTournaments,
        unreadMessages,
      },
      upcomingMatches: ((upcomingRes.data ?? []) as MatchRow[]).map(mapMatch),
      completedMatches: ((completedRes.data ?? []) as MatchRow[]).map(mapMatch),
      recentNews: (newsRes.data ?? []) as DashboardNewsItem[],
      recentMembers: (membersRes.data ?? []) as DashboardMemberItem[],
      finance,
      activity,
    });
    if (failed) {
      setError("কিছু তথ্য আনা যায়নি — সংযোগ বা অনুমতি যাচাই করুন।");
    }
    setLoading(false);
  }, [isAdminRole, isFinanceRole]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, ...state };
}
