import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import Icon from "../../components/admin/icons";
import type { IconName } from "../../components/admin/icons";
import {
  useAdminDashboard,
  type DashboardMatch,
} from "../../hooks/useAdminDashboard";
import { useAdminAuditLog } from "../../hooks/useAdminAuditLog";
import { actionLabel, entityLabel } from "../../utils/auditLog";
import {
  formatMatchDate,
  MATCH_STATUS_LABELS_BN,
  SPORT_LABELS_BN,
} from "../../utils/matchDisplay";

/**
 * Admin Dashboard (§1) — implemented from the owner-approved proposal.
 *
 * Everything shown comes from useAdminDashboard (real queries under
 * the caller's JWT; RLS decides what each role may see):
 * - Stat cards follow the caller's read permissions.
 * - The unread-messages card renders ONLY for admin profiles
 *   (contact_messages are is_admin()-readable in the database).
 * - The finance section renders ONLY for finance roles
 *   (admin / finance_manager) and applies the approved
 *   balance rule; withdrawal / transfer are shown for information
 *   and never counted into the balance.
 * - News shows the schema's real states only: published / unpublished
 *   (news_posts has no draft/pending workflow).
 * - Recent activity: admin profiles see the GENERAL audit log
 *   (audit_logs, migration 0020 — live) through useAdminAuditLog,
 *   latest 5 entries; finance roles who are not admin keep the
 *   finance audit trail; other roles see no activity data at all.
 * - No growth percentages anywhere: no historical snapshots exist.
 */

const FINANCE_ROLES = ["admin", "finance_manager"];
const NEWS_TYPE_LABELS: Record<string, string> = {
  news: "সংবাদ",
  activity: "কার্যক্রম",
  notice: "নোটিশ",
};
const AUDIT_ACTION_LABELS: Record<string, string> = {
  INSERT: "আর্থিক রেকর্ড যোগ করা হয়েছে",
  UPDATE: "আর্থিক রেকর্ড পরিবর্তন করা হয়েছে",
  DELETE: "আর্থিক রেকর্ড মুছে ফেলা হয়েছে",
};

function formatBdt(amount: number): string {
  return `৳ ${amount.toLocaleString("bn-BD")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function StatCard({
  icon,
  value,
  label,
  to,
}: {
  icon: IconName;
  value: number | null;
  label: string;
  to?: string;
}) {
  const body = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="mt-3 block text-3xl font-bold text-brand-dark">
        {value === null ? "—" : value.toLocaleString("bn-BD")}
      </span>
      <span className="mt-1 block text-sm text-neutral-500">{label}</span>
      {to && (
        <span className="mt-2 block text-xs font-semibold text-brand">
          পরিচালনা করুন
        </span>
      )}
    </>
  );
  const cls =
    "block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm";
  return to ? (
    <Link to={to} className={`${cls} transition hover:border-brand/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function statusCls(status: string): string {
  if (status === "upcoming") return "font-semibold text-amber-700";
  if (status === "live") return "font-semibold text-red-700";
  if (status === "completed") return "font-semibold text-brand";
  return "font-semibold text-neutral-500";
}

function MatchList({
  title,
  matches,
  emptyText,
}: {
  title: string;
  matches: DashboardMatch[];
  emptyText: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-brand-dark">{title}</h3>
      {matches.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
          {emptyText}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-100">
          {matches.map((m) => (
            <li key={m.id} className="py-2.5">
              <Link
                to={`/matches/${m.id}`}
                className="text-sm font-semibold text-neutral-800 hover:text-brand-dark"
              >
                {SPORT_LABELS_BN[m.sport]} বনাম {m.opponent}
              </Link>
              <span className="block text-xs text-neutral-500">
                {formatMatchDate(m.match_date)}
                {m.tournamentName ? ` · ${m.tournamentName}` : ""}
                {" · "}
                <span className={statusCls(m.status)}>
                  {MATCH_STATUS_LABELS_BN[m.status as keyof typeof MATCH_STATUS_LABELS_BN] ?? m.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Entity labels for audit rows, incl. the match/tournament scopes
 *  migration 0044 attaches once it is live. */
const DASHBOARD_ENTITY_LABELS: Record<string, string> = {
  matches: "ম্যাচ",
  tournaments: "টুর্নামেন্ট",
};
function dashboardEntityLabel(entityType: string): string {
  return DASHBOARD_ENTITY_LABELS[entityType] ?? entityLabel(entityType);
}

/**
 * Latest general audit activity — admin profiles only. This
 * component is mounted solely for admins, so the audit query never
 * fires for other roles (the database policy is is_admin() anyway).
 */
function AdminAuditActivity() {
  const audit = useAdminAuditLog();
  if (audit.loading) {
    return <p className="mt-3 text-sm text-neutral-500">লোড হচ্ছে…</p>;
  }
  if (audit.missingTable) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
        Audit Log এখনো সক্রিয় হয়নি — তাই কোনো কার্যক্রম দেখানো হচ্ছে না।
      </p>
    );
  }
  if (audit.error) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
        {audit.error}
      </p>
    );
  }
  const rows = audit.rows.slice(0, 5);
  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
        এখনো কোনো কার্যক্রমের রেকর্ড নেই।
      </p>
    );
  }
  return (
    <ul className="mt-2 divide-y divide-neutral-100">
      {rows.map((row) => (
        <li key={row.id} className="py-2.5">
          <span className="text-sm font-semibold text-neutral-800">
            {dashboardEntityLabel(row.entity_type)} — {actionLabel(row.action)}
            {row.entity_label ? `: ${row.entity_label}` : ""}
          </span>
          <span className="block text-xs text-neutral-500">
            {row.actor_name ?? "সিস্টেম"} · {formatDateTime(row.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminDashboardPage() {
  const { profile } = useAuth();
  const isAdminRole = profile?.role === "admin";
  const isFinanceRole = FINANCE_ROLES.includes(profile?.role ?? "");
  const data = useAdminDashboard({ isAdminRole, isFinanceRole });

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Supabase এখনো সংযুক্ত হয়নি, তাই ড্যাশবোর্ডের আসল তথ্য দেখানো যাচ্ছে
        না — কোনো নমুনা বা ভুয়া পরিসংখ্যান দেখানো হচ্ছে না। Supabase Setup
        শেষ হলে এই পেজে Database-এর বাস্তব সারসংক্ষেপ আসবে।
      </div>
    );
  }

  const today = new Intl.DateTimeFormat("bn-BD", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const quickActions: { label: string; to: string }[] = [
    { label: "+ নতুন ফুটবল প্লেয়ার", to: "/admin/players?sport=football" },
    { label: "+ নতুন ক্রিকেট প্লেয়ার", to: "/admin/players?sport=cricket" },
    { label: "+ নতুন ম্যাচ", to: "/admin/matches" },
    { label: "+ নতুন টুর্নামেন্ট", to: "/admin/tournaments" },
    { label: "+ নতুন সংবাদ", to: "/admin/news" },
    { label: "+ সদস্য যোগ", to: "/admin/members" },
    { label: "+ আর্থিক রেকর্ড", to: "/admin/finance" },
  ];

  return (
    <div>
      {/* Welcome */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-dark">
              স্বাগতম, {profile?.full_name ?? "Admin"}
            </h1>
                      </div>
          <p className="text-sm font-medium text-neutral-500">{today}</p>
        </div>
      </div>

      {data.error && (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {data.error}
        </div>
      )}
      {data.loading && (
        <p className="mt-4 text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>
      )}

      {/* Overview statistics */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          icon="members"
          value={data.stats.activeMembers}
          label="মোট সক্রিয় সদস্য"
          to="/admin/members"
        />
        <StatCard
          icon="football"
          value={data.stats.footballPlayers}
          label="ফুটবল প্লেয়ার"
          to="/admin/players?sport=football"
        />
        <StatCard
          icon="cricket"
          value={data.stats.cricketPlayers}
          label="ক্রিকেট প্লেয়ার"
          to="/admin/players?sport=cricket"
        />
        <StatCard
          icon="trophy"
          value={data.stats.totalMatches}
          label="মোট ম্যাচ"
          to="/admin/matches"
        />
        <StatCard
          icon="trophy"
          value={data.stats.ongoingTournaments}
          label="চলমান টুর্নামেন্ট"
          to="/admin/tournaments"
        />
        {isAdminRole && (
          <StatCard
            icon="mail"
            value={data.stats.unreadMessages}
            label="অপঠিত যোগাযোগ বার্তা"
          />
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-brand-dark">দ্রুত কাজ</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {quickActions.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="rounded-xl border border-brand/30 px-3 py-2.5 text-center text-sm font-semibold text-brand-dark transition hover:bg-brand-light"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Matches + finance / members */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand-dark">ম্যাচ ও টুর্নামেন্ট</h2>
            <Link
              to="/admin/matches"
              className="text-xs font-semibold text-brand"
            >
              সব ম্যাচ
            </Link>
          </div>
          <div className="mt-3 space-y-4">
            <MatchList
              title="আসন্ন, চলমান ও স্থগিত ম্যাচ"
              matches={data.upcomingMatches}
              emptyText="কোনো আসন্ন, চলমান বা স্থগিত ম্যাচ নেই।"
            />
            <MatchList
              title="সর্বশেষ সমাপ্ত ম্যাচ"
              matches={data.completedMatches}
              emptyText="এখনো কোনো ম্যাচ সম্পন্ন হয়নি।"
            />
          </div>
        </div>

        {isFinanceRole ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-brand-dark">আর্থিক সারসংক্ষেপ</h2>
            {data.finance ? (
              <>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between border-b border-neutral-100 pb-2">
                    <dt className="text-neutral-500">মোট আয়</dt>
                    <dd className="font-bold text-brand-dark">
                      {formatBdt(data.finance.income)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-b border-neutral-100 pb-2">
                    <dt className="text-neutral-500">মোট চাঁদা</dt>
                    <dd className="font-bold text-brand-dark">
                      {formatBdt(data.finance.subscription)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-b border-neutral-100 pb-2">
                    <dt className="text-neutral-500">মোট অনুদান</dt>
                    <dd className="font-bold text-brand-dark">
                      {formatBdt(data.finance.donation)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-b border-neutral-100 pb-2">
                    <dt className="text-neutral-500">মোট প্রকৃত ব্যয়</dt>
                    <dd className="font-bold text-brand-dark">
                      {formatBdt(data.finance.expense)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-semibold text-neutral-700">
                      বর্তমান ভারসাম্য
                    </dt>
                    <dd className="font-bold text-brand-dark">
                      {formatBdt(data.finance.balance)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-neutral-400">
                  উত্তোলন {formatBdt(data.finance.withdrawn)} ও স্থানান্তর{" "}
                  {formatBdt(data.finance.transferred)} — এগুলো ভারসাম্যের
                  হিসাবে ধরা হয় না।
                </p>
              </>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                আর্থিক তথ্য আনা যায়নি বা এখনো কোনো লেনদেন নেই।
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-brand-dark">সাম্প্রতিক সদস্য</h2>
            {data.recentMembers.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                এখনো কোনো সক্রিয় সদস্য যোগ হয়নি।
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-100">
                {data.recentMembers.map((m) => (
                  <li key={m.id} className="py-2.5">
                    <span className="text-sm font-semibold text-neutral-800">
                      {m.name}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      যোগদান:{" "}
                      {m.joined_date
                        ? formatMatchDate(m.joined_date)
                        : formatDateTime(m.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-neutral-400">
              আর্থিক সারসংক্ষেপ শুধু Finance ভূমিকার ব্যবহারকারীদের দেখানো
              হয়।
            </p>
          </div>
        )}
      </div>

      {/* News + activity */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand-dark">
              সর্বশেষ সংবাদ ও নোটিশ
            </h2>
            <Link to="/admin/news" className="text-xs font-semibold text-brand">
              সংবাদ পরিচালনা
            </Link>
          </div>
          {data.recentNews.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
              এখনো কোনো সংবাদ বা নোটিশ তৈরি হয়নি।
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-neutral-100">
              {data.recentNews.map((n) => (
                <li key={n.id} className="py-2.5">
                  <span className="text-sm font-semibold text-neutral-800">
                    {n.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <span>{NEWS_TYPE_LABELS[n.type] ?? n.type}</span>·
                    <span
                      className={
                        n.is_published
                          ? "font-semibold text-brand"
                          : "font-semibold text-neutral-400"
                      }
                    >
                      {n.is_published ? "প্রকাশিত" : "অপ্রকাশিত"}
                    </span>
                    ·
                    <span>
                      {formatDateTime(n.published_at ?? n.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand-dark">সাম্প্রতিক কার্যক্রম</h2>
            {isAdminRole && (
              <Link
                to="/admin/audit-log"
                className="text-xs font-semibold text-brand"
              >
                সব ইতিহাস
              </Link>
            )}
          </div>
          {isAdminRole ? (
            <AdminAuditActivity />
          ) : isFinanceRole && data.activity.length > 0 ? (
            <ul className="mt-2 divide-y divide-neutral-100">
              {data.activity.map((a) => (
                <li key={a.id} className="py-2.5">
                  <span className="text-sm font-semibold text-neutral-800">
                    {AUDIT_ACTION_LABELS[a.action] ?? "আর্থিক পরিবর্তন"}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {formatDateTime(a.changed_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
              {isFinanceRole
                ? "এখনো কোনো আর্থিক পরিবর্তনের রেকর্ড নেই। সাধারণ কার্যক্রমের ইতিহাস Admin-এর ড্যাশবোর্ডে দেখা যায়।"
                : "কার্যক্রমের ইতিহাস শুধু Admin দেখতে পারে — আপনার ভূমিকায় এখানে কোনো কার্যক্রম দেখানো হয় না।"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
