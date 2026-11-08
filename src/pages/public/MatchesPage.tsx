import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MatchVersusRow, PremiumStageBadge } from "../../components/MatchVersus";
import { usePublicMatches } from "../../hooks/usePublicMatches";
import type { Match, Sport } from "../../types/database.types";
import {
  formatMatchDate,
  MATCH_STATUS_LABELS_BN,
  SPORT_LABELS_BN,
} from "../../utils/matchDisplay";

/**
 * Public matches page (§6 Part 3): fixtures that are not finished
 * yet (আসন্ন / চলমান / স্থগিত / পুনর্নির্ধারিত / পরিত্যক্ত — the
 * six-status model; Step C added পরিত্যক্ত) and recent results,
 * from PUBLISHED matches only (RLS-enforced; see
 * usePublicMatches). Honest loading / empty / error states — no
 * sample matches are ever shown.
 */
export default function MatchesPage() {
  const { loading, error, matches, tournaments, teams } = usePublicMatches();
  const [sport, setSport] = useState<"all" | Sport>("all");

  const tournamentById = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments],
  );
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const filtered = useMemo(
    () => matches.filter((m) => sport === "all" || m.sport === sport),
    [matches, sport],
  );
  const upcoming = useMemo(
    () =>
      filtered
        .filter((m) => m.status !== "completed")
        .sort((a, b) => {
          // Live matches first, abandoned ones right after them
          // (Step C), then the rest by date. Abandoned matches
          // stay in this first section — never among results.
          const rank = (m: Match) =>
            m.status === "live" ? 0 : m.status === "abandoned" ? 1 : 2;
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return (a.match_date ?? "").localeCompare(b.match_date ?? "");
        }),
    [filtered],
  );
  const completed = useMemo(
    () => filtered.filter((m) => m.status === "completed"),
    [filtered],
  );

  const card = (m: Match) => (
    <Link
      key={m.id}
      to={`/matches/${m.id}`}
      className="np-card np-card-hover block p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="np-chip">
            {SPORT_LABELS_BN[m.sport]}
          </span>
          <PremiumStageBadge round={m.round} />
        </span>
        <span className="shrink-0 text-xs text-neutral-500">{formatMatchDate(m.match_date)}</span>
      </div>
      <MatchVersusRow match={m} teamById={teamById} teams={teams} />
      {(m.status === "completed" || m.status === "live") && (m.our_score || m.opponent_score) && (
        <p className="mt-1 text-sm font-medium text-brand-dark">
          স্কোর: {m.our_score ?? "—"} : {m.opponent_score ?? "—"}
          {m.result ? <span className="text-neutral-600"> · {m.result}</span> : null}
        </p>
      )}
      <p className="mt-1 text-xs text-neutral-500">
        {m.tournament_id
          ? (tournamentById.get(m.tournament_id)?.name ?? "টুর্নামেন্ট")
          : "প্রীতি ম্যাচ"}
        {m.venue ? ` · ${m.venue}` : ""} · {MATCH_STATUS_LABELS_BN[m.status]}
      </p>
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-brand-dark">ম্যাচ ও ফলাফল</h1>
      <p className="mt-1 text-sm text-neutral-500">
        সংগঠনের ফুটবল ও ক্রিকেট টিমের আসন্ন ম্যাচ এবং সাম্প্রতিক ফলাফল।
      </p>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="খেলা অনুযায়ী ছাঁকুন">
        {(
          [
            ["all", "সব"],
            ["football", "ফুটবল"],
            ["cricket", "ক্রিকেট"],
          ] as ["all" | Sport, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={sport === value}
            onClick={() => setSport(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              sport === value
                ? "bg-brand text-white"
                : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="mt-8 text-sm text-neutral-500">ম্যাচের তথ্য লোড হচ্ছে…</p>}
      {error && (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <h2 className="mt-8 text-lg font-bold text-brand-dark">আসন্ন, চলমান ও স্থগিত ম্যাচ</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
              এই মুহূর্তে কোনো আসন্ন, চলমান বা স্থগিত ম্যাচ নেই।
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map(card)}</div>
          )}

          <h2 className="mt-10 text-lg font-bold text-brand-dark">সাম্প্রতিক ফলাফল</h2>
          {completed.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
              এখনো কোনো ম্যাচের ফলাফল প্রকাশিত হয়নি।
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{completed.map(card)}</div>
          )}
        </>
      )}
    </div>
  );
}
