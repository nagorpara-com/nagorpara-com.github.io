import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ORGANIZATION } from "../../config/organization";
import { PremiumStageBadge } from "../../components/MatchVersus";
import { useCricketSettings } from "../../hooks/useCricketSettings";
import { useFootballSettings } from "../../hooks/useFootballSettings";
import { usePublicMatchDetails } from "../../hooks/usePublicMatches";
import { findOpponentTeam, usePublishedTeams } from "../../hooks/useTeams";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import type { MatchEvent } from "../../types/database.types";
import { oversText } from "../../utils/cricketStats";
import {
  EVENT_TYPE_LABELS_BN,
  formatMatchDate,
  MATCH_STATUS_LABELS_BN,
  SPORT_LABELS_BN,
} from "../../utils/matchDisplay";

/**
 * Public match details (§6 Part 3): the published match, its score
 * and result, and the player performances recorded for it. A match
 * that does not exist or is not published shows the Not Found state
 * (RLS makes unpublished matches invisible to visitors).
 */
export default function MatchDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { status, match, tournament, performances } = usePublicMatchDetails(id);
  const footballSettings = useFootballSettings();
  const cricketSettings = useCricketSettings();
  const teams = usePublishedTeams();

  // Timeline events (Step D, migration 0052) — fail-soft: the
  // table does not exist until 0052 is live, and an unpublished
  // match's events are invisible by RLS; any error or an empty
  // result simply leaves the section out.
  const [timeline, setTimeline] = useState<{
    events: MatchEvent[];
    names: Map<string, string>;
  } | null>(null);
  useEffect(() => {
    if (!id || !isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;
    (async () => {
      const { data, error } = await client
        .from("match_events")
        .select("*")
        .eq("match_id", id)
        .order("display_order", { ascending: true })
        .order("minute", { ascending: true });
      if (cancelled || error || !data) return;
      const rows = data as MatchEvent[];
      const names = new Map<string, string>();
      const ids = [
        ...new Set(
          rows
            .flatMap((e) => [e.player_id, e.related_player_id])
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      if (ids.length > 0) {
        const { data: ps } = await client
          .from("players")
          .select("id, name")
          .in("id", ids);
        for (const p of (ps ?? []) as { id: string; name: string }[]) {
          names.set(p.id, p.name);
        }
      }
      if (!cancelled) setTimeline({ events: rows, names });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <p className="text-sm text-neutral-500">ম্যাচের তথ্য লোড হচ্ছে…</p>
      </div>
    );
  }

  if (status === "notfound" || !match) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-brand-dark">ম্যাচটি পাওয়া যায়নি</h1>
        <p className="mt-2 text-sm text-neutral-500">
          এই ম্যাচটি হয় মুছে ফেলা হয়েছে, নয় এখনো প্রকাশিত হয়নি।
        </p>
        <Link to="/matches" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          সব ম্যাচ দেখুন
        </Link>
      </div>
    );
  }

  const isFootball = match.sport === "football";
  // Versus header data (owner, 2026-11-02): our team's name and
  // logo come from the sport's Team Settings (org logo as the
  // fallback, same as the sport pages); the opponent's logo
  // comes from the Teams list when a published team has exactly
  // that name — otherwise an initials placeholder, never a
  // borrowed logo.
  const ourSettings = isFootball ? footballSettings : cricketSettings;
  const ourLogo = ourSettings.teamLogoUrl ?? `${import.meta.env.BASE_URL}${ORGANIZATION.logoPath}`;
  const opponentTeam = findOpponentTeam(teams, match.sport, match.opponent);
  // Two-team fixtures (migration 0044): when the match links both
  // teams, the versus header shows those two teams; otherwise the
  // legacy "our team vs named opponent" header below applies.
  const teamA = match.team_a_id ? teams.find((t) => t.id === match.team_a_id) : undefined;
  const teamB = match.team_b_id ? teams.find((t) => t.id === match.team_b_id) : undefined;
  const leftName = teamA?.name ?? ourSettings.teamName;
  const rightName = teamB?.name ?? match.opponent;
  const winnerTeam = match.winner_team_id
    ? teams.find((t) => t.id === match.winner_team_id)
    : undefined;
  // Step C display fields (0044 draft revision) — all optional,
  // so pre-0044 matches simply omit these lines.
  const tossTeam = match.toss_winner_team_id
    ? teams.find((t) => t.id === match.toss_winner_team_id)
    : undefined;
  const pomName = match.player_of_match_id
    ? performances.find((p) => p.player_id === match.player_of_match_id)?.player_name
    : undefined;
  const hasScore = Boolean(match.our_score || match.opponent_score);
  const batting = performances.filter(
    (p) => p.runs > 0 || p.balls_faced > 0 || p.fours > 0 || p.sixes > 0 || p.not_out,
  );
  const bowling = performances.filter((p) => p.balls_bowled > 0 || p.wickets > 0);
  const fielding = performances.filter((p) => p.catches > 0 || p.stumpings > 0 || p.run_outs > 0);
  const profileBase = isFootball ? "/football/player/" : "/cricket/player/";

  const th = "px-3 py-2 text-left text-xs font-semibold text-neutral-500";
  const td = "px-3 py-2 text-sm text-neutral-700";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link to="/matches" className="text-sm font-medium text-brand hover:underline">
        ← সব ম্যাচ
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
            {SPORT_LABELS_BN[match.sport]}
          </span>
          <PremiumStageBadge round={match.round} />
          <span className="text-xs text-neutral-500">
            {MATCH_STATUS_LABELS_BN[match.status]} · {formatMatchDate(match.match_date)}
          </span>
        </div>
        <h1 className="sr-only">
          {leftName} বনাম {rightName}
        </h1>
        {match.banner_url ? (
          <img
            src={match.banner_url}
            alt=""
            loading="lazy"
            className="mt-4 max-h-64 w-full rounded-xl object-cover"
          />
        ) : null}
        {/* Versus header (owner, 2026-11-02): the two teams'
            logos side by side, each team's score under its own
            name, and the match details written below. */}
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-4">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            {teamA && !teamA.logo_url ? (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-brand-light text-2xl font-bold text-brand-dark sm:h-20 sm:w-20" aria-hidden="true">
                {teamA.name.trim().charAt(0) || "?"}
              </span>
            ) : (
              <img
                src={teamA?.logo_url ?? ourLogo}
                alt=""
                loading="lazy"
                className="h-16 w-16 shrink-0 rounded-full border border-neutral-200 bg-white object-contain p-1 sm:h-20 sm:w-20"
              />
            )}
            <p className="max-w-full break-words text-base font-bold text-neutral-800 sm:text-lg">{leftName}</p>
            {hasScore && (
              <p className="text-2xl font-extrabold text-brand-dark sm:text-3xl">{match.our_score ?? "—"}</p>
            )}
          </div>
          <span className="pt-6 text-sm font-bold text-neutral-400 sm:pt-8">বনাম</span>
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            {(teamB ? teamB.logo_url : opponentTeam?.logo_url) ? (
              <img
                src={(teamB ? teamB.logo_url : opponentTeam?.logo_url) as string}
                alt=""
                loading="lazy"
                className="h-16 w-16 shrink-0 rounded-full border border-neutral-200 bg-white object-contain p-1 sm:h-20 sm:w-20"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-brand-light text-2xl font-bold text-brand-dark sm:h-20 sm:w-20" aria-hidden="true">
                {rightName.trim().charAt(0) || "?"}
              </span>
            )}
            <p className="max-w-full break-words text-base font-bold text-neutral-800 sm:text-lg">{rightName}</p>
            {hasScore && (
              <p className="text-2xl font-extrabold text-brand-dark sm:text-3xl">{match.opponent_score ?? "—"}</p>
            )}
          </div>
        </div>
        {match.result && <p className="mt-1 text-sm font-medium text-neutral-700">{match.result}</p>}
        {match.status === "completed" && winnerTeam && (
          <p className="mt-1 text-sm font-bold text-brand-dark">বিজয়ী: {winnerTeam.name}</p>
        )}
        {match.status === "completed" && match.is_draw && !winnerTeam && (
          <p className="mt-1 text-sm font-bold text-neutral-600">ম্যাচ ড্র</p>
        )}
        {match.tiebreaker_note && (
          <p className="mt-1 text-sm text-neutral-600">{match.tiebreaker_note}</p>
        )}
        {match.shootout_a != null && match.shootout_b != null && (
          <p className="mt-1 text-sm text-neutral-600">
            পেনাল্টি শুটআউট: {match.shootout_a}-{match.shootout_b}
          </p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          {tournament ? `টুর্নামেন্ট: ${tournament.name}${tournament.season ? ` (${tournament.season})` : ""}` : "প্রীতি ম্যাচ"}
          {match.round ? ` · ${match.round}` : ""}
          {match.match_no ? ` · ম্যাচ ${match.match_no}` : ""}
          {match.venue ? ` · ভেন্যু: ${match.venue}` : ""}
          {match.referee_name ? ` · রেফারি/আম্পায়ার: ${match.referee_name}` : ""}
        </p>
        {tossTeam && (
          <p className="mt-1 text-xs text-neutral-500">
            টস: {tossTeam.name}
            {match.toss_decision === "bat"
              ? " (ব্যাটিং প্রথমে)"
              : match.toss_decision === "field"
                ? " (বোলিং প্রথমে)"
                : ""}
          </p>
        )}
        {pomName && (
          <p className="mt-1 text-sm font-semibold text-brand-dark">
            ম্যাচসেরা: {pomName}
          </p>
        )}
      </div>

      {timeline && timeline.events.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-bold text-brand-dark">ম্যাচের ঘটনা</h2>
          <ul className="mt-3 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white px-4">
            {timeline.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="rounded bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
                  {e.minute != null ? `${e.minute}'` : e.over_text ? `${e.over_text} ওভার` : "—"}
                </span>
                <span className="text-sm font-medium text-neutral-800">
                  {EVENT_TYPE_LABELS_BN[e.event_type]}
                </span>
                {e.player_id && timeline.names.get(e.player_id) ? (
                  <span className="text-sm text-neutral-600">
                    {timeline.names.get(e.player_id)}
                    {e.related_player_id && timeline.names.get(e.related_player_id)
                      ? ` · মাঠে নামেন ${timeline.names.get(e.related_player_id)}`
                      : ""}
                  </span>
                ) : null}
                {e.detail ? (
                  <span className="text-sm text-neutral-500">· {e.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-lg font-bold text-brand-dark">প্লেয়ারদের Performance</h2>
      {performances.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
          এই ম্যাচের প্লেয়ার-ভিত্তিক Performance এখনো যোগ করা হয়নি।
        </p>
      ) : isFootball ? (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className={th}>প্লেয়ার</th>
                <th className={th}>গোল</th>
                <th className={th}>অ্যাসিস্ট</th>
                <th className={th}>হলুদ কার্ড</th>
                <th className={th}>লাল কার্ড</th>
              </tr>
            </thead>
            <tbody>
              {performances.map((p) => (
                <tr key={p.id} className="border-b border-neutral-50 last:border-0">
                  <td className={td}>
                    <Link to={`${profileBase}${p.player_id}`} className="font-medium text-brand hover:underline">
                      {p.player_name}
                    </Link>
                  </td>
                  <td className={td}>{p.goals}</td>
                  <td className={td}>{p.assists}</td>
                  <td className={td}>{p.yellow_cards}</td>
                  <td className={td}>{p.red_cards}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {batting.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-bold text-neutral-700">ব্যাটিং</h3>
              <div className="mt-2 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className={th}>ব্যাটসম্যান</th>
                      <th className={th}>রান</th>
                      <th className={th}>বল</th>
                      <th className={th}>চার</th>
                      <th className={th}>ছয়</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batting.map((p) => (
                      <tr key={p.id} className="border-b border-neutral-50 last:border-0">
                        <td className={td}>
                          <Link to={`${profileBase}${p.player_id}`} className="font-medium text-brand hover:underline">
                            {p.player_name}
                          </Link>
                          {p.not_out ? " *" : ""}
                        </td>
                        <td className={td}>{p.runs}</td>
                        <td className={td}>{p.balls_faced}</td>
                        <td className={td}>{p.fours}</td>
                        <td className={td}>{p.sixes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {bowling.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-bold text-neutral-700">বোলিং</h3>
              <div className="mt-2 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className={th}>বোলার</th>
                      <th className={th}>ওভার</th>
                      <th className={th}>মেডেন</th>
                      <th className={th}>রান দিয়েছে</th>
                      <th className={th}>উইকেট</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bowling.map((p) => (
                      <tr key={p.id} className="border-b border-neutral-50 last:border-0">
                        <td className={td}>
                          <Link to={`${profileBase}${p.player_id}`} className="font-medium text-brand hover:underline">
                            {p.player_name}
                          </Link>
                        </td>
                        <td className={td}>{oversText(p.balls_bowled)}</td>
                        <td className={td}>{p.maidens}</td>
                        <td className={td}>{p.runs_conceded}</td>
                        <td className={td}>{p.wickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {fielding.length > 0 && (
            <p className="mt-4 text-sm text-neutral-600">
              ফিল্ডিং:{" "}
              {fielding
                .map((p) => `${p.player_name} (ক্যাচ ${p.catches}, স্টাম্পিং ${p.stumpings}, রান আউট ${p.run_outs})`)
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
