import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { usePublicMatches } from "../../hooks/usePublicMatches";
import {
  BracketView,
  PointsTableView,
  RegisteredTeamsView,
  TeamLogo,
} from "../../components/tournament/TournamentViews";
import { PremiumStageBadge } from "../../components/MatchVersus";
import { versusSides } from "../../utils/versus";
import { bnNum, championOf, isPremiumRound } from "../../utils/tournament";
import {
  formatDateOnly,
  formatMatchDate,
  MATCH_STATUS_LABELS_BN,
  SPORT_LABELS_BN,
  TOURNAMENT_STATUS_LABELS_BN,
} from "../../utils/matchDisplay";

const FORMAT_LABELS: Record<string, string> = {
  league: "League",
  knockout: "Knockout",
  group_knockout: "Group + Knockout",
};

/** Top-performer rows of one tournament (Step D) — computed
 * from the tournament's match performances, never stored. */
interface TopRow {
  playerId: string;
  value: number;
}
interface TournamentTops {
  scorers: TopRow[];
  runs: TopRow[];
  wickets: TopRow[];
  pom: TopRow[];
}
interface PerfRow {
  match_id: string;
  player_id: string;
  goals: number;
  runs: number;
  wickets: number;
}

function top5(sums: Map<string, number>): TopRow[] {
  return [...sums.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([playerId, value]) => ({ playerId, value }));
}

/**
 * Public tournaments page: published tournaments with their
 * banner and details, registered teams, matches, and — per the
 * owner's Tournament Management rules (2026-11-02) — the computed
 * league points table or knockout progression and the champion.
 * Everything is computed from published results; a tournament
 * without the new data simply shows its matches, as before.
 */
export default function TournamentsPage() {
  const { loading, error, matches, tournaments, teams, tournamentTeams } = usePublicMatches();
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Top performers per tournament (Step D): one performances
  // fetch for every tournament match on the page, aggregated in
  // memory. Fail-soft — an error leaves the blocks out.
  const [perfRows, setPerfRows] = useState<PerfRow[]>([]);
  const [perfNames, setPerfNames] = useState<Map<string, string>>(new Map());
  const tournamentMatchKey = useMemo(
    () =>
      matches
        .filter((m) => m.tournament_id)
        .map((m) => m.id)
        .sort()
        .join(","),
    [matches],
  );
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !tournamentMatchKey) return;
    const client = supabase;
    const ids = tournamentMatchKey.split(",");
    let cancelled = false;
    (async () => {
      const { data, error } = await client
        .from("match_performances")
        .select("match_id, player_id, goals, runs, wickets")
        .in("match_id", ids);
      if (cancelled || error || !data) return;
      const rows = data as PerfRow[];
      const playerIds = new Set<string>(rows.map((r) => r.player_id));
      for (const m of matches) {
        if (m.tournament_id && m.player_of_match_id) playerIds.add(m.player_of_match_id);
      }
      let names = new Map<string, string>();
      if (playerIds.size > 0) {
        const { data: ps } = await client
          .from("players")
          .select("id, name")
          .in("id", [...playerIds]);
        if (ps) {
          names = new Map(
            (ps as { id: string; name: string }[]).map((p) => [p.id, p.name]),
          );
        }
      }
      if (cancelled) return;
      setPerfRows(rows);
      setPerfNames(names);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentMatchKey]);

  const topsOf = (t: (typeof tournaments)[number]): TournamentTops => {
    const tMatchIds = new Set(
      matches.filter((m) => m.tournament_id === t.id).map((m) => m.id),
    );
    const goals = new Map<string, number>();
    const runs = new Map<string, number>();
    const wickets = new Map<string, number>();
    for (const r of perfRows) {
      if (!tMatchIds.has(r.match_id)) continue;
      goals.set(r.player_id, (goals.get(r.player_id) ?? 0) + (r.goals ?? 0));
      runs.set(r.player_id, (runs.get(r.player_id) ?? 0) + (r.runs ?? 0));
      wickets.set(r.player_id, (wickets.get(r.player_id) ?? 0) + (r.wickets ?? 0));
    }
    const pom = new Map<string, number>();
    for (const m of matches) {
      if (m.tournament_id !== t.id || !m.player_of_match_id) continue;
      pom.set(m.player_of_match_id, (pom.get(m.player_of_match_id) ?? 0) + 1);
    }
    return {
      scorers: t.sport === "football" ? top5(goals) : [],
      runs: t.sport === "cricket" ? top5(runs) : [],
      wickets: t.sport === "cricket" ? top5(wickets) : [],
      pom: top5(pom),
    };
  };

  const topListBlock = (title: string, rows: TopRow[], unit: string) =>
    rows.length === 0 ? null : (
      <div key={title} className="rounded-xl border border-neutral-200 p-3">
        <h4 className="text-sm font-bold text-brand-dark">{title}</h4>
        <ol className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.playerId} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-neutral-800">
                {perfNames.get(r.playerId) ?? "প্লেয়ার"}
              </span>
              <span className="shrink-0 font-semibold text-brand-dark">
                {bnNum(r.value)} {unit}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );

  const matchLine = (m: (typeof matches)[number]) => {
    // Versus line (v179): both sides' logos + names from the
    // match's linked teams (MatchVersus.versusSides — the same
    // resolution as the match cards and the bracket). A premium
    // stage swaps the muted round text for the gold badge, so
    // the stage is named exactly once on the line.
    const { a, b } = versusSides(m, teamById, teams);
    return (
      <>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium text-neutral-800">
          {m.match_no ? <span className="text-neutral-400">ম্যাচ {m.match_no} · </span> : null}
          {a.logoTeam ? <TeamLogo team={a.logoTeam} size={20} /> : null}
          <span>{a.name}</span>
          <span className="text-neutral-400">বনাম</span>
          <span>{b.name}</span>
          {b.logoTeam ? <TeamLogo team={b.logoTeam} size={20} /> : null}
          {b.outside ? <span className="text-[10px] text-neutral-400">বাইরের টিম</span> : null}
          {m.status === "completed" && (m.our_score || m.opponent_score) ? (
            <span>— {m.our_score ?? "—"} : {m.opponent_score ?? "—"}</span>
          ) : null}
          {isPremiumRound(m.round) ? (
            <PremiumStageBadge round={m.round} />
          ) : m.round ? (
            <span className="text-neutral-400">· {m.round}</span>
          ) : null}
          {m.status === "live" || m.status === "postponed" || m.status === "rescheduled" ? (
            <span className="font-semibold text-brand-dark">· {MATCH_STATUS_LABELS_BN[m.status]}</span>
          ) : null}
        </span>
        <span className="text-xs text-neutral-500">{formatMatchDate(m.match_date)}</span>
      </>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-brand-dark">টুর্নামেন্ট</h1>
      <p className="mt-1 text-sm text-neutral-500">সংগঠনের টিমগুলো অংশ নেওয়া টুর্নামেন্ট ও সেগুলোর ম্যাচ।</p>
      <Link
        to="/matches"
        className="mt-3 inline-block rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
      >
        সব ম্যাচ ও ফলাফল দেখুন
      </Link>

      {loading && <p className="mt-8 text-sm text-neutral-500">টুর্নামেন্টের তথ্য লোড হচ্ছে…</p>}
      {error && (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && tournaments.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
          এখনো কোনো টুর্নামেন্ট প্রকাশিত হয়নি।
        </p>
      )}

      {!loading &&
        !error &&
        tournaments.map((t) => {
          const tMatches = matches.filter((m) => m.tournament_id === t.id);
          const entries = tournamentTeams.filter((e) => e.tournament_id === t.id);
          const champion = championOf(t, teams, matches);
          const runnerUp = t.runner_up_team_id
            ? teamById.get(t.runner_up_team_id)
            : undefined;
          const ruleParts = [
            t.squad_size ? `প্রতি দলে ${bnNum(t.squad_size)} জন প্লেয়ার` : "",
            t.sport === "football" && t.match_minutes
              ? `${bnNum(t.match_minutes)} মিনিটের ম্যাচ`
              : "",
            t.sport === "cricket" && t.cricket_overs
              ? `${bnNum(t.cricket_overs)} ওভারের ম্যাচ`
              : "",
            t.sport === "cricket" && t.ball_type ? `বল: ${t.ball_type}` : "",
          ].filter(Boolean);
          return (
            <section key={t.id} className="np-card mt-6 overflow-hidden p-5">
              <span className="np-gold-line -mx-5 -mt-5 mb-4" aria-hidden="true" />
              {t.banner_url ? (
                <div className="relative -mx-5 -mt-4 mb-4 h-52 w-[calc(100%+2.5rem)] max-w-none overflow-hidden sm:h-64">
                  <img
                    src={t.banner_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                    aria-hidden="true"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <h2 className="text-xl font-bold text-white sm:text-2xl">{t.name}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="np-chip bg-white/15 text-white ring-1 ring-white/30">
                        {SPORT_LABELS_BN[t.sport]}
                      </span>
                      {t.format ? (
                        <span className="np-chip bg-white/15 text-white ring-1 ring-white/30">
                          {FORMAT_LABELS[t.format] ?? t.format}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {!t.banner_url && (
                  <>
                    <h2 className="text-lg font-bold text-neutral-800">{t.name}</h2>
                    <span className="np-chip">
                      {SPORT_LABELS_BN[t.sport]}
                    </span>
                    {t.format ? (
                      <span className="np-chip">{FORMAT_LABELS[t.format] ?? t.format}</span>
                    ) : null}
                  </>
                )}
                <span className="text-xs text-neutral-500">
                  {t.season ? `মৌসুম ${t.season} · ` : ""}
                  {TOURNAMENT_STATUS_LABELS_BN[t.status]}
                </span>
              </div>

              {(t.organizer || t.director || t.director_phone || t.venue) && (
                <p className="mt-2 text-sm text-neutral-600">
                  {t.organizer ? `আয়োজক: ${t.organizer}` : ""}
                  {t.director
                    ? `${t.organizer ? " · " : ""}পরিচালক: ${t.director}${t.director_phone ? ` (ফোন: ${t.director_phone})` : ""}`
                    : t.director_phone
                      ? `${t.organizer ? " · " : ""}পরিচালকের ফোন: ${t.director_phone}`
                      : ""}
                  {t.venue ? `${t.organizer || t.director || t.director_phone ? " · " : ""}মাঠ: ${t.venue}` : ""}
                </p>
              )}
              {(t.start_date || t.end_date) && (
                <p className="mt-2 text-sm text-neutral-600">
                  মেয়াদ: {t.start_date ? formatDateOnly(t.start_date) : "…"}
                  {t.end_date ? ` – ${formatDateOnly(t.end_date)}` : ""}
                </p>
              )}
              {ruleParts.length > 0 && (
                <p className="mt-2 text-sm text-neutral-600">
                  নিয়ম: {ruleParts.join(" · ")}
                </p>
              )}
              {t.description ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                  {t.description}
                </p>
              ) : null}

              {champion && (
                <p className="mt-3 rounded-xl bg-gold/15 px-3 py-2 text-sm font-bold text-brand-dark">
                  চ্যাম্পিয়ন: {champion.name}
                </p>
              )}
              {runnerUp && (
                <p className="mt-2 rounded-xl bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700">
                  রানার্স-আপ: {runnerUp.name}
                </p>
              )}

              {entries.length > 0 && (
                <div className="mt-4">
                  <RegisteredTeamsView entries={entries} teams={teams} />
                </div>
              )}

              {(t.format === "league" || t.format === "group_knockout") && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-bold text-brand-dark">পয়েন্ট টেবিল</h3>
                  <PointsTableView tournament={t} teams={teams} matches={matches} />
                </div>
              )}
              {t.format === "knockout" && (tMatches.length > 0 || entries.length >= 2) && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-bold text-brand-dark">রাউন্ডের অগ্রগতি</h3>
                  <BracketView
                    teams={teams}
                    matches={tMatches}
                    teamTotal={entries.length || t.team_count || 0}
                  />
                </div>
              )}

              {(() => {
                const tops = topsOf(t);
                if (
                  tops.scorers.length === 0 &&
                  tops.runs.length === 0 &&
                  tops.wickets.length === 0 &&
                  tops.pom.length === 0
                ) {
                  return null;
                }
                return (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-bold text-brand-dark">সেরা পারফরমার</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {topListBlock("সর্বোচ্চ গোলদাতা", tops.scorers, "গোল")}
                      {topListBlock("সর্বোচ্চ রান", tops.runs, "রান")}
                      {topListBlock("সর্বোচ্চ উইকেট", tops.wickets, "উইকেট")}
                      {topListBlock("সবচেয়ে বেশি ম্যাচসেরা", tops.pom, "বার")}
                    </div>
                  </div>
                );
              })()}

              <h3 className="mt-5 text-sm font-bold text-brand-dark">ম্যাচ</h3>
              <p className="mt-1 text-xs text-neutral-500">
                মোট ম্যাচ: {bnNum(tMatches.length)}
              </p>
              {tMatches.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">এই টুর্নামেন্টের কোনো ম্যাচ এখনো প্রকাশিত হয়নি।</p>
              ) : (
                <ul className="mt-2 divide-y divide-neutral-100">
                  {tMatches.map((m) => (
                    <li key={m.id}>
                      <Link to={`/matches/${m.id}`} className="flex flex-wrap items-center gap-2 py-2.5 hover:bg-neutral-50">
                        {matchLine(m)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
    </div>
  );
}
