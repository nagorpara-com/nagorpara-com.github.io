import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import EmptyState from "../../components/home/EmptyState";
import PlayerSections from "../../components/PlayerSections";
import { useFootballPlayer } from "../../hooks/usePlayers";
import { useFootballSettings } from "../../hooks/useFootballSettings";
import { usePlayerSections } from "../../hooks/usePlayerSections";
import { preferredFootLabelBn } from "../../config/positions";
import { ageInYears, formatDateBn, toBn } from "../../utils/format";

type TabKey = "stats" | "history";

const RESULT_LABEL: Record<string, string> = {
  win: "জয়",
  loss: "হার",
  draw: "ড্র",
};

/**
 * Football Player Profile — Reference Panel 04: photo beside name,
 * position and jersey; info list; four career stat boxes; and three
 * working tabs (পরিসংখ্যান / ম্যাচ ইতিহাস). All numbers
 * come from the Admin-managed stats and match records — nothing is
 * invented, and missing data shows an honest empty state.
 */
export default function FootballPlayerPage() {
  const { id } = useParams();
  const { status, player, history } = useFootballPlayer(id);
  const teamSettings = useFootballSettings();
  const { sections } = usePlayerSections(id);
  const [tab, setTab] = useState<TabKey>("stats");

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
        <Link to="/football" className="mt-6 inline-block font-semibold text-brand hover:underline">
          ← ফুটবল টিমে ফিরে যান
        </Link>
      </section>
    );
  }

  const age = ageInYears(player.date_of_birth);
  const footLabel = preferredFootLabelBn(player.preferred_foot);
  const stats = player.stats;
  const statBoxes: { label: string; value: number | null }[] = [
    { label: "মোট ম্যাচ", value: stats?.matches ?? null },
    { label: "গোল", value: stats?.goals ?? null },
    { label: "অ্যাসিস্ট", value: stats?.assists ?? null },
    { label: "কার্ড (হলুদ/লাল)", value: null },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/football" className="text-sm font-semibold text-brand hover:underline">
        ← ফুটবল টিম
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
            {player.position}
            {player.jersey_no !== null && ` · Jersey No. ${player.jersey_no}`}
          </p>

          <dl className="mt-5 space-y-2 text-[15px] text-neutral-700">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-brand-dark">টিম:</dt>
              <dd>{teamSettings.teamName}</dd>
            </div>
            {player.club ? (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">ক্লাব:</dt>
                <dd>{player.club}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 font-semibold text-brand-dark">পজিশন:</dt>
              <dd>{player.position}</dd>
            </div>
            {player.jersey_no !== null && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">জার্সি নম্বর:</dt>
                <dd>{toBn(player.jersey_no)}</dd>
              </div>
            )}
            {age !== null && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">বয়স:</dt>
                <dd>{toBn(age)} বছর</dd>
              </div>
            )}
            {footLabel && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-brand-dark">পছন্দের পা:</dt>
                <dd>{footLabel}</dd>
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
                <p className="text-xl font-bold text-brand-dark">
                  {box.label === "কার্ড (হলুদ/লাল)"
                    ? stats
                      ? `${toBn(stats.yellow_cards)}/${toBn(stats.red_cards)}`
                      : "—"
                    : box.value !== null
                      ? toBn(box.value)
                      : "—"}
                </p>
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
          (stats && player.seasons.length > 0 ? (
            <div>
              <div className="overflow-x-auto rounded-2xl border border-neutral-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="bg-brand-light text-brand-dark">
                      <th className="px-4 py-2.5 font-semibold">মৌসুম</th>
                      <th className="px-4 py-2.5 font-semibold">ম্যাচ</th>
                      <th className="px-4 py-2.5 font-semibold">গোল</th>
                      <th className="px-4 py-2.5 font-semibold">অ্যাসিস্ট</th>
                      <th className="px-4 py-2.5 font-semibold">হলুদ কার্ড</th>
                      <th className="px-4 py-2.5 font-semibold">লাল কার্ড</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-700">
                    {player.seasons.map((s) => (
                      <tr key={s.season}>
                        <td className="px-4 py-2.5 font-medium">{s.season === "all" ? "সব মৌসুম" : toBn(s.season)}</td>
                        <td className="px-4 py-2.5">{toBn(s.matches)}</td>
                        <td className="px-4 py-2.5">{toBn(s.goals)}</td>
                        <td className="px-4 py-2.5">{toBn(s.assists)}</td>
                        <td className="px-4 py-2.5">{toBn(s.yellow_cards)}</td>
                        <td className="px-4 py-2.5">{toBn(s.red_cards)}</td>
                      </tr>
                    ))}
                    <tr className="bg-brand-light/60 font-semibold text-brand-dark">
                      <td className="px-4 py-2.5">মোট</td>
                      <td className="px-4 py-2.5">{toBn(stats.matches)}</td>
                      <td className="px-4 py-2.5">{toBn(stats.goals)}</td>
                      <td className="px-4 py-2.5">{toBn(stats.assists)}</td>
                      <td className="px-4 py-2.5">{toBn(stats.yellow_cards)}</td>
                      <td className="px-4 py-2.5">{toBn(stats.red_cards)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                প্রতিটি মৌসুমের পরিসংখ্যান আলাদাভাবে সংরক্ষিত। যে মৌসুমে ম্যাচের পারফরম্যান্স রেকর্ড আছে,
                সেই মৌসুমের সংখ্যা রেকর্ড থেকেই গণনা করা হয় — একই তথ্য দুইবার যোগ হয় না।
              </p>
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
                    গোল {toBn(h.goals)} · অ্যাসিস্ট {toBn(h.assists)}
                  </span>
                </li>
              ))}
            </ul>
          ))}

      </div>
    </section>
  );
}
