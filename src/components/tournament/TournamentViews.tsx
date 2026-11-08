import type { Match, Team, Tournament, TournamentTeam } from "../../types/database.types";
import { toBn } from "../../utils/format";
import {
  bnNum,
  computePointsTable,
  expectedKnockoutRounds,
  groupByRound,
  isPremiumRound,
  roundRank,
} from "../../utils/tournament";

/**
 * Shared tournament displays (owner's Tournament Management rules,
 * 2026-11-02): registered teams, the league points table and the
 * knockout round progression. Used by the public Tournaments page
 * and the Admin matches page, so both always agree. Everything is
 * computed from recorded results — see utils/tournament.ts.
 */

export function TeamLogo({ team, size = 28 }: { team: Team; size?: number }) {
  if (team.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-light font-bold text-brand-dark"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {team.name.trim().charAt(0) || "দ"}
    </span>
  );
}

/**
 * Gold premium chip for the late knockout stages (owner's
 * order, v179): shown only when a match's round is EXACTLY
 * কোয়ার্টার ফাইনাল / সেমিফাইনাল / ফাইনাল (PREMIUM_ROUNDS
 * in utils/tournament — ordinal/free-text rounds never
 * qualify). Gold styling follows the site's existing gold
 * chips (np-chip + bg-gold/25, as on the news cards) and the
 * bracket winner's gold ★ below.
 */
export function PremiumStageBadge({ round }: { round?: string | null }) {
  if (!isPremiumRound(round)) return null;
  return <span className="np-chip bg-gold/25">★ {round}</span>;
}

export function RegisteredTeamsView({
  entries,
  teams,
}: {
  entries: TournamentTeam[];
  teams: Team[];
}) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const list = entries
    .map((e) => byId.get(e.team_id))
    .filter((t): t is Team => Boolean(t));
  if (list.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-bold text-brand-dark">অংশগ্রহণকারী টিম</h3>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map((e) => {
          const team = byId.get(e.team_id);
          if (!team) return null;
          return (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2"
            >
              <TeamLogo team={team} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                {team.name}
              </span>
              <span className="text-[11px] text-neutral-400">#{bnNum(e.seed)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PointsTableView({
  tournament,
  teams,
  matches,
}: {
  tournament: Tournament;
  teams: Team[];
  matches: Match[];
}) {
  const rows = computePointsTable(tournament, teams, matches);
  const isFootball = tournament.sport === "football";
  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        পয়েন্ট টেবিলের জন্য দুই টিম যুক্ত কোনো সমাপ্ত ম্যাচ এখনো নেই।
      </p>
    );
  }
  const teamCell = (r: (typeof rows)[number]) => (
    <span className="flex items-center gap-2">
      <TeamLogo team={r.team} size={24} />
      <span className="font-medium text-neutral-800">{r.team.name}</span>
    </span>
  );
  if (!isFootball) {
    // Cricket table (Step C): played / won / lost / tied-or-no-
    // result, Net Run Rate from the recorded overs, points. When
    // no match carries balls data the NRR column shows "—" and
    // the honest note below explains why.
    const anyNrr = rows.some((r) => r.nrr !== null);
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">টিম</th>
              <th className="py-2 pr-2 text-center font-semibold">খেলা</th>
              <th className="py-2 pr-2 text-center font-semibold">জয়</th>
              <th className="py-2 pr-2 text-center font-semibold">হার</th>
              <th className="py-2 pr-2 text-center font-semibold">টাই/পরিত্যক্ত</th>
              <th className="py-2 pr-2 text-center font-semibold">NRR</th>
              <th className="py-2 text-center font-semibold">পয়েন্ট</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.team.id}
                className={`border-b border-neutral-100 ${i === 0 ? "bg-brand-light/50 font-semibold" : ""}`}
              >
                <td className="py-2 pr-2 text-neutral-500">{bnNum(i + 1)}</td>
                <td className="py-2 pr-2">{teamCell(r)}</td>
                <td className="py-2 pr-2 text-center">{bnNum(r.played)}</td>
                <td className="py-2 pr-2 text-center">{bnNum(r.won)}</td>
                <td className="py-2 pr-2 text-center">{bnNum(r.lost)}</td>
                <td className="py-2 pr-2 text-center">{bnNum(r.drawn)}</td>
                <td className="py-2 pr-2 text-center">
                  {r.nrr === null ? "—" : toBn(r.nrr.toFixed(3))}
                </td>
                <td className="py-2 text-center font-bold text-brand-dark">{bnNum(r.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!anyNrr && (
          <p className="mt-2 text-xs text-neutral-400">
            নেট রান রেট দেখানো হয়নি — ওভারের পূর্ণ তথ্য ছাড়া তা হিসাব করা যায় না।
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <th className="py-2 pr-2 font-semibold">#</th>
            <th className="py-2 pr-2 font-semibold">টিম</th>
            <th className="py-2 pr-2 text-center font-semibold">ম্যাচ</th>
            <th className="py-2 pr-2 text-center font-semibold">জয়</th>
            <th className="py-2 pr-2 text-center font-semibold">ড্র</th>
            <th className="py-2 pr-2 text-center font-semibold">হার</th>
            <th className="py-2 pr-2 text-center font-semibold">গোল +</th>
            <th className="py-2 pr-2 text-center font-semibold">গোল −</th>
            <th className="py-2 pr-2 text-center font-semibold">পার্থক্য</th>
            <th className="py-2 text-center font-semibold">পয়েন্ট</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.team.id}
              className={`border-b border-neutral-100 ${i === 0 ? "bg-brand-light/50 font-semibold" : ""}`}
            >
              <td className="py-2 pr-2 text-neutral-500">{bnNum(i + 1)}</td>
              <td className="py-2 pr-2">{teamCell(r)}</td>
              <td className="py-2 pr-2 text-center">{bnNum(r.played)}</td>
              <td className="py-2 pr-2 text-center">{bnNum(r.won)}</td>
              <td className="py-2 pr-2 text-center">{bnNum(r.drawn)}</td>
              <td className="py-2 pr-2 text-center">{bnNum(r.lost)}</td>
              <td className="py-2 pr-2 text-center">{bnNum(r.scored)}</td>
              <td className="py-2 pr-2 text-center">{bnNum(r.conceded)}</td>
              <td className="py-2 pr-2 text-center">{bnNum(r.diff)}</td>
              <td className="py-2 text-center font-bold text-brand-dark">{bnNum(r.points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BracketView({
  teams,
  matches,
  teamTotal,
}: {
  teams: Team[];
  matches: Match[];
  /**
   * Registered team count (or the tournament's planned count).
   * When given for a knockout bracket, rounds that have no real
   * matches yet are PROJECTED as "বিজয়ী নির্ধারিত হয়নি" slots —
   * display only, nothing is stored (owner's Phase A rule).
   */
  teamTotal?: number;
}) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const groups = groupByRound(matches.filter((m) => m.team_a_id || m.team_b_id || m.round));
  const realRounds = new Set(groups.map((g) => g.round));
  const projected =
    teamTotal && teamTotal >= 2
      ? expectedKnockoutRounds(teamTotal).filter((r) => !realRounds.has(r.round))
      : [];
  if (groups.length === 0 && projected.length === 0) {
    return <p className="text-sm text-neutral-500">এই টুর্নামেন্টের কোনো ম্যাচ এখনো তৈরি হয়নি।</p>;
  }
  const side = (m: Match, which: "a" | "b") => {
    const team = byId.get((which === "a" ? m.team_a_id : m.team_b_id) ?? "");
    const name = team?.name ?? (which === "a" ? null : m.opponent) ?? "টিম নির্ধারিত নয়";
    const score = which === "a" ? m.our_score : m.opponent_score;
    const isWinner = m.status === "completed" && team && m.winner_team_id === team.id;
    // Owner's order, 2026-11-03: a knocked-out team is marked
    // with a small "বাদ" chip next to its name (the winner gets
    // the gold star). Only when the match is completed and the
    // winner is one of the two sides — a draw without a winner
    // eliminates nobody.
    const isLoser =
      m.status === "completed" &&
      team &&
      m.winner_team_id &&
      m.winner_team_id !== team.id &&
      (m.winner_team_id === m.team_a_id || m.winner_team_id === m.team_b_id);
    return (
      <span
        className={`flex items-center gap-2 ${isWinner ? "font-bold text-brand-dark" : ""} ${isLoser ? "text-neutral-400" : ""}`}
      >
        {team ? <TeamLogo team={team} size={22} /> : null}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {m.status === "completed" && score ? <span>{score}</span> : null}
        {isWinner ? <span className="text-gold">★</span> : null}
        {isLoser ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">বাদ</span>
        ) : null}
      </span>
    );
  };
  const displayGroups: (
    | { round: string; kind: "real"; matches: Match[] }
    | { round: string; kind: "projected"; slots: number }
  )[] = [
    ...groups.map((g) => ({ round: g.round, kind: "real" as const, matches: g.matches })),
    ...projected.map((p) => ({ round: p.round, kind: "projected" as const, slots: p.matches })),
  ].sort((x, y) => roundRank(x.round || null) - roundRank(y.round || null));
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {displayGroups.map((g) =>
        g.kind === "projected" ? (
          <div
            key={`proj-${g.round}`}
            className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 p-3"
          >
            <h4 className="flex items-center gap-2 text-sm font-bold text-neutral-500">
              {g.round}
              <span className="rounded bg-neutral-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                এখনো তৈরি হয়নি
              </span>
            </h4>
            <ul className="mt-2 space-y-2">
              {Array.from({ length: Math.min(g.slots, 4) }, (_, i) => (
                <li key={i} className="rounded-xl bg-white/70 px-3 py-2 text-sm text-neutral-400">
                  <span className="block">বিজয়ী নির্ধারিত হয়নি</span>
                  <span className="block">বিজয়ী নির্ধারিত হয়নি</span>
                </li>
              ))}
            </ul>
            {g.slots > 4 && (
              <p className="mt-2 text-xs text-neutral-400">
                আরও {bnNum(g.slots - 4)}টি ম্যাচের স্থান — সবগুলোতেই বিজয়ী নির্ধারিত হয়নি।
              </p>
            )}
          </div>
        ) : (
          <div key={g.round || "none"} className="rounded-2xl border border-neutral-200 bg-white p-3">
            <h4 className="text-sm font-bold text-brand-dark">{g.round || "রাউন্ড উল্লেখ নেই"}</h4>
            <ul className="mt-2 space-y-2">
              {g.matches.map((m) => (
                <li key={m.id} className="rounded-xl bg-neutral-50 px-3 py-2 text-sm">
                  {m.match_no || isPremiumRound(m.round) ? (
                    <span className="mb-1 flex items-center gap-2">
                      {m.match_no ? (
                        <span className="text-[11px] font-semibold text-neutral-400">
                          ম্যাচ {bnNum(m.match_no)}
                        </span>
                      ) : null}
                      <PremiumStageBadge round={m.round} />
                    </span>
                  ) : null}
                  {side(m, "a")}
                  {side(m, "b")}
                  {m.status === "completed" && m.is_draw && !m.winner_team_id ? (
                    <span className="mt-1 block text-xs font-medium text-neutral-500">ড্র</span>
                  ) : null}
                  {m.tiebreaker_note ? (
                    <span className="mt-1 block text-xs text-neutral-500">{m.tiebreaker_note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
