import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import EmptyState from "../../components/home/EmptyState";
import PlayerSections from "../../components/PlayerSections";
import { usePlayerSections } from "../../hooks/usePlayerSections";
import { useCricketSettings } from "../../hooks/useCricketSettings";
import { useCricketPlayer, type CricketSeasonStats } from "../../hooks/useCricketPlayers";
import {
  battingAverage,
  battingStrikeRate,
  bestBowlingFigures,
  bowlingAverage,
  bowlingEconomy,
  bowlingStrikeRate,
  oversText,
} from "../../utils/cricketStats";
import { cricketRoleLabelBn } from "../../config/positions";
import { ageInYears, formatDateBn, toBn } from "../../utils/format";

type TabKey = "stats" | "history";

const RESULT_LABEL: Record<string, string> = {
  win: "জয়",
  loss: "হার",
  draw: "ড্র",
};

function num(value: number | null): string {
  return value === null ? "—" : toBn(value);
}

function seasonLabel(season: string): string {
  return season === "all" ? "সব মৌসুম" : toBn(season);
}

/**
 * Cricket Player Profile — Reference Panel 06, mirroring the football
 * profile: photo beside name, role and styles; career stat boxes;
 * tabs for season-wise statistics (batting + bowling/fielding, with
 * averages and rates derived only from recorded numbers), match
 * history, and gallery. All data is Admin-managed; missing data
 * shows "—" or an honest empty state — never an invented figure.
 */
export default function CricketPlayerPage() {
  const { id } = useParams();
  const { status, player, history } = useCricketPlayer(id);
  const { sections } = usePlayerSections(id);
  const settings = useCricketSettings();
  const [tab, setTab] = useState<TabKey>("stats");

  const bestFromHistory = useMemo(
    () => bestBowlingFigures(history.map((h) => ({ wickets: h.wickets, runs_conceded: h.runs_conceded }))),
    [history],
  );

  if (status !== "ok" || !player) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">প্লেয়ারের প্রোফাইল</h1>
        <div className="mt-6">
          <EmptyState
            message={
              status === "unconfigured"
                ? "প্লেয়ারের তথ্য এখনো উপলব্ধ নয়। তথ্য যোগ হলে এখানে প্রোফাইল দেখানো হবে।"
                : "এই প্লেয়ারকে পাওয়া যায়নি।"
            }
          />
        </div>
        <Link to="/cricket" className="mt-6 inline-block font-semibold text-brand hover:underline">
          ← ক্রিকেট টিমে ফিরে যান
        </Link>
      </section>
    );
  }

  const totals = player.totals;
  const storedBest = [...player.seasons].reverse().find((s) => s.best_bowling)?.best_bowling ?? null;
  const bestBowling = bestFromHistory ?? storedBest;

  const statBoxes: { label: string; value: string }[] = [
    { label: "মোট ম্যাচ", value: totals ? toBn(totals.matches) : "—" },
    { label: "মোট রান", value: totals ? toBn(totals.runs) : "—" },
    { label: "উইকেট", value: totals ? toBn(totals.wickets) : "—" },
    { label: "ক্যাচ", value: totals ? toBn(totals.catches) : "—" },
  ];

  const renderBattingRows = (rows: CricketSeasonStats[]) =>
    rows.map((s) => (
      <tr key={s.season}>
        <td className="px-4 py-2.5 font-medium">{seasonLabel(s.season)}</td>
        <td className="px-4 py-2.5">{toBn(s.matches)}</td>
        <td className="px-4 py-2.5">{toBn(s.innings)}</td>
        <td className="px-4 py-2.5">{toBn(s.runs)}</td>
        <td className="px-4 py-2.5">{toBn(s.highest_score)}</td>
        <td className="px-4 py-2.5">{num(battingAverage(s))}</td>
        <td className="px-4 py-2.5">{num(battingStrikeRate(s))}</td>
        <td className="px-4 py-2.5">{toBn(s.fours)}</td>
        <td className="px-4 py-2.5">{toBn(s.sixes)}</td>
        <td className="px-4 py-2.5">{toBn(s.fifties)}</td>
        <td className="px-4 py-2.5">{toBn(s.hundreds)}</td>
        <td className="px-4 py-2.5">{toBn(s.not_outs)}</td>
      </tr>
    ));

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/cricket" className="text-sm font-semibold text-brand hover:underline">
        ← ক্রিকেট টিম
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-brand-light shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          {player.photo_url ? (
            <img src={player.photo_url} alt={player.name} className="aspect-[4/5] w-full object-cover" />
          ) : (
            <span className="flex aspect-[4/5] w-full items-center justify-center text-6xl font-bold text-brand/40" aria-hidden="true">
              {player.name.charAt(0)}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">{player.name}</h1>
          <p className="mt-1 font-medium text-neutral-600">
            {cricketRoleLabelBn(player.role) ?? player.position}
            {player.jersey_no !== null && ` · Jersey No. ${player.jersey_no}`}
          </p>

          <dl className="mt-5 space-y-2 text-[15px] text-neutral-700">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-brand-dark">টিম:</dt>
              <dd>{settings.teamName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-brand-dark">ভূমিকা:</dt>
              <dd>{cricketRoleLabelBn(player.role) ?? player.position}</dd>
            </div>
            {player.batting_style && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">ব্যাটিং ধরন:</dt>
                <dd>{player.batting_style}</dd>
              </div>
            )}
            {player.bowling_style && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">বোলিং ধরন:</dt>
                <dd>{player.bowling_style}</dd>
              </div>
            )}
            {player.jersey_no !== null && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">জার্সি নম্বর:</dt>
                <dd>{toBn(player.jersey_no)}</dd>
              </div>
            )}
            {ageInYears(player.date_of_birth) !== null && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">বয়স:</dt>
                <dd>{toBn(ageInYears(player.date_of_birth) as number)} বছর</dd>
              </div>
            )}
          </dl>

          {player.bio ? (
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-700">{player.bio}</p>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">প্লেয়ারের পরিচিতি এখনো যোগ করা হয়নি।</p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statBoxes.map((box) => (
              <div key={box.label} className="rounded-xl bg-brand-light px-3 py-3 text-center">
                <p className="text-xl font-bold text-brand-dark">{box.value}</p>
                <p className="mt-0.5 text-xs font-medium text-neutral-600">{box.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dynamic profile sections (Phase 3) — admin-ordered, visible
          sections only; renders nothing when the player has none. */}
      <PlayerSections sections={sections} />

      <div className="mt-8 flex flex-wrap gap-2 border-b border-neutral-200">
        {(
          [
            { key: "stats", label: "পরিসংখ্যান" },
            { key: "history", label: "ম্যাচ ইতিহাস" },
          ] as { key: TabKey; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-neutral-500 hover:text-brand-dark"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "stats" &&
          (totals && player.seasons.length > 0 ? (
            <div className="space-y-8">
              <div>
                <h2 className="mb-3 font-bold text-brand-dark">ব্যাটিং — মৌসুমভিত্তিক</h2>
                <div className="overflow-x-auto rounded-2xl border border-neutral-100">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="bg-brand-light text-brand-dark">
                        <th className="px-4 py-2.5 font-semibold">মৌসুম</th>
                        <th className="px-4 py-2.5 font-semibold">ম্যাচ</th>
                        <th className="px-4 py-2.5 font-semibold">ইনিংস</th>
                        <th className="px-4 py-2.5 font-semibold">রান</th>
                        <th className="px-4 py-2.5 font-semibold">সর্বোচ্চ</th>
                        <th className="px-4 py-2.5 font-semibold">গড়</th>
                        <th className="px-4 py-2.5 font-semibold">স্ট্রাইক রেট</th>
                        <th className="px-4 py-2.5 font-semibold">চার</th>
                        <th className="px-4 py-2.5 font-semibold">ছয়</th>
                        <th className="px-4 py-2.5 font-semibold">৫০</th>
                        <th className="px-4 py-2.5 font-semibold">১০০</th>
                        <th className="px-4 py-2.5 font-semibold">নট আউট</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-700">
                      {renderBattingRows(player.seasons)}
                      <tr className="bg-brand-light/60 font-semibold text-brand-dark">
                        <td className="px-4 py-2.5">মোট</td>
                        <td className="px-4 py-2.5">{toBn(totals.matches)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.innings)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.runs)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.highest_score)}</td>
                        <td className="px-4 py-2.5">{num(battingAverage(totals))}</td>
                        <td className="px-4 py-2.5">{num(battingStrikeRate(totals))}</td>
                        <td className="px-4 py-2.5">{toBn(totals.fours)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.sixes)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.fifties)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.hundreds)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.not_outs)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h2 className="mb-3 font-bold text-brand-dark">বোলিং ও ফিল্ডিং — মৌসুমভিত্তিক</h2>
                <div className="overflow-x-auto rounded-2xl border border-neutral-100">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="bg-brand-light text-brand-dark">
                        <th className="px-4 py-2.5 font-semibold">মৌসুম</th>
                        <th className="px-4 py-2.5 font-semibold">ওভার</th>
                        <th className="px-4 py-2.5 font-semibold">উইকেট</th>
                        <th className="px-4 py-2.5 font-semibold">রান খরচ</th>
                        <th className="px-4 py-2.5 font-semibold">ইকোনমি</th>
                        <th className="px-4 py-2.5 font-semibold">বোলিং গড়</th>
                        <th className="px-4 py-2.5 font-semibold">বোলিং স্ট্রাইক রেট</th>
                        <th className="px-4 py-2.5 font-semibold">মেডেন</th>
                        <th className="px-4 py-2.5 font-semibold">ক্যাচ</th>
                        <th className="px-4 py-2.5 font-semibold">স্টাম্পিং</th>
                        <th className="px-4 py-2.5 font-semibold">রান আউট</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-700">
                      {player.seasons.map((s) => (
                        <tr key={s.season}>
                          <td className="px-4 py-2.5 font-medium">{seasonLabel(s.season)}</td>
                          <td className="px-4 py-2.5">{toBn(oversText(s.balls_bowled))}</td>
                          <td className="px-4 py-2.5">{toBn(s.wickets)}</td>
                          <td className="px-4 py-2.5">{toBn(s.runs_conceded)}</td>
                          <td className="px-4 py-2.5">{num(bowlingEconomy(s))}</td>
                          <td className="px-4 py-2.5">{num(bowlingAverage(s))}</td>
                          <td className="px-4 py-2.5">{num(bowlingStrikeRate(s))}</td>
                          <td className="px-4 py-2.5">{toBn(s.maidens)}</td>
                          <td className="px-4 py-2.5">{toBn(s.catches)}</td>
                          <td className="px-4 py-2.5">{toBn(s.stumpings)}</td>
                          <td className="px-4 py-2.5">{toBn(s.run_outs)}</td>
                        </tr>
                      ))}
                      <tr className="bg-brand-light/60 font-semibold text-brand-dark">
                        <td className="px-4 py-2.5">মোট</td>
                        <td className="px-4 py-2.5">{toBn(oversText(totals.balls_bowled))}</td>
                        <td className="px-4 py-2.5">{toBn(totals.wickets)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.runs_conceded)}</td>
                        <td className="px-4 py-2.5">{num(bowlingEconomy(totals))}</td>
                        <td className="px-4 py-2.5">{num(bowlingAverage(totals))}</td>
                        <td className="px-4 py-2.5">{num(bowlingStrikeRate(totals))}</td>
                        <td className="px-4 py-2.5">{toBn(totals.maidens)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.catches)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.stumpings)}</td>
                        <td className="px-4 py-2.5">{toBn(totals.run_outs)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm text-neutral-600">
                  সেরা বোলিং ফিগার: <span className="font-semibold text-brand-dark">{bestBowling ? toBn(bestBowling) : "—"}</span>
                  {bestFromHistory && <span className="text-neutral-500"> (ম্যাচ রেকর্ড থেকে গণনা করা)</span>}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  গড়, স্ট্রাইক রেট ও ইকোনমি শুধু রেকর্ড করা সংখ্যা থেকে হিসাব করা হয় — প্রয়োজনীয়
                  তথ্য না থাকলে "—" দেখানো হয়, কোনো অনুমান করা সংখ্যা নয়। যে মৌসুমে ম্যাচের
                  পারফরম্যান্স রেকর্ড আছে, সেই মৌসুমের সংখ্যা রেকর্ড থেকেই গণনা করা হয় — একই তথ্য
                  দুইবার যোগ হয় না।
                </p>
              </div>
            </div>
          ) : (
            <EmptyState message="এই প্লেয়ারের পরিসংখ্যান এখনো যোগ করা হয়নি।" />
          ))}

        {tab === "history" &&
          (history.length === 0 ? (
            <EmptyState message="এই প্লেয়ারের ম্যাচ ইতিহাস এখনো যোগ করা হয়নি।" />
          ) : (
            <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-100">
              {history.map((h) => (
                <li key={h.matchId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-semibold text-brand-dark">বনাম {h.opponent}</span>
                  {h.tournamentName && <span className="text-neutral-500">{h.tournamentName}</span>}
                  {h.matchDate && <span className="text-neutral-500">{formatDateBn(h.matchDate)}</span>}
                  {h.ourScore !== null && h.opponentScore !== null && (
                    <span className="font-medium text-neutral-700">
                      স্কোর: {h.ourScore} – {h.opponentScore}
                    </span>
                  )}
                  {h.result && <span className="font-medium text-brand">{RESULT_LABEL[h.result] ?? h.result}</span>}
                  <span className="text-neutral-600">
                    রান {toBn(h.runs)} · উইকেট {toBn(h.wickets)}
                  </span>
                </li>
              ))}
            </ul>
          ))}

      </div>
    </section>
  );
}
