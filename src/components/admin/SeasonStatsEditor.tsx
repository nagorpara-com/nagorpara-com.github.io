import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Sport } from "../../types/database.types";

/**
 * Season-by-season stats editor for ONE player — the editing half
 * of the Admin "পরিসংখ্যান ও প্রকাশ" page (2026-10-26 split: the
 * editor used to live inside the player biodata form, which made
 * টিম ও প্লেয়ার and পরিসংখ্যান ও প্রকাশ the same page; the owner
 * flagged that as a problem, so stats editing now lives only
 * here).
 *
 * Behaviour matches the original editor exactly (same tables,
 * same fields, same computed-season warning), with one upgrade:
 * every save and delete is READ BACK from the database and
 * compared before success is reported (the project's
 * verify-admin-writes rule) — the original saved silently along
 * with the player form.
 */

export interface SeasonRow {
  season: string;
  matches: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
}

export interface CkSeasonRow {
  season: string;
  matches: number;
  innings: number;
  runs: number;
  highest_score: number;
  not_outs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  wickets: number;
  balls_bowled: number;
  runs_conceded: number;
  maidens: number;
  best_bowling: string;
  catches: number;
  stumpings: number;
  run_outs: number;
}

const EMPTY_CK_SEASON: CkSeasonRow = {
  season: "",
  matches: 0,
  innings: 0,
  runs: 0,
  highest_score: 0,
  not_outs: 0,
  balls_faced: 0,
  fours: 0,
  sixes: 0,
  fifties: 0,
  hundreds: 0,
  wickets: 0,
  balls_bowled: 0,
  runs_conceded: 0,
  maidens: 0,
  best_bowling: "",
  catches: 0,
  stumpings: 0,
  run_outs: 0,
};

interface ComputedSeason {
  season: string;
  matches: number;
  goals?: number;
  runs?: number;
  wickets?: number;
}

export default function SeasonStatsEditor({
  sport,
  playerId,
  canEdit,
}: {
  sport: Sport;
  playerId: string;
  canEdit: boolean;
}) {
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [ckSeasons, setCkSeasons] = useState<CkSeasonRow[]>([]);
  const [computed, setComputed] = useState<ComputedSeason[]>([]);
  const [perfCount, setPerfCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    if (sport === "cricket") {
      const [stored, comp, perf] = await Promise.all([
        supabase.from("cricket_player_stats").select("*").eq("player_id", playerId),
        supabase.from("cricket_season_stats").select("season, matches, runs, wickets").eq("player_id", playerId),
        supabase.from("match_performances").select("id", { count: "exact", head: true }).eq("player_id", playerId),
      ]);
      setCkSeasons(
        (stored.data ?? []).map((r) => ({ ...EMPTY_CK_SEASON, ...r, best_bowling: r.best_bowling ?? "" })),
      );
      setComputed((comp.data ?? []) as ComputedSeason[]);
      setPerfCount(perf.count ?? 0);
    } else {
      const [stored, comp, perf] = await Promise.all([
        supabase.from("football_player_stats").select("*").eq("player_id", playerId),
        supabase.from("football_season_stats").select("*").eq("player_id", playerId),
        supabase.from("match_performances").select("id", { count: "exact", head: true }).eq("player_id", playerId),
      ]);
      setSeasons((stored.data ?? []) as SeasonRow[]);
      setComputed((comp.data ?? []) as ComputedSeason[]);
      setPerfCount(perf.count ?? 0);
    }
    setLoading(false);
  }, [sport, playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAll() {
    if (!supabase || saving) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    const failures: string[] = [];
    if (sport === "football") {
      for (const row of seasons) {
        const season = row.season.trim();
        if (!season) continue;
        const payload = {
          player_id: playerId,
          season,
          matches: row.matches,
          goals: row.goals,
          assists: row.assists,
          yellow_cards: row.yellow_cards,
          red_cards: row.red_cards,
        };
        const { error: upErr } = await supabase
          .from("football_player_stats")
          .upsert(payload, { onConflict: "player_id,season" });
        if (upErr) {
          failures.push(`${season}: ${upErr.message}`);
          continue;
        }
        const { data: back } = await supabase
          .from("football_player_stats")
          .select("*")
          .eq("player_id", playerId)
          .eq("season", season)
          .maybeSingle();
        const ok =
          back &&
          back.matches === payload.matches &&
          back.goals === payload.goals &&
          back.assists === payload.assists &&
          back.yellow_cards === payload.yellow_cards &&
          back.red_cards === payload.red_cards;
        if (!ok) failures.push(`${season}: সংরক্ষণের পর যাচাই মেলেনি`);
      }
    } else {
      for (const row of ckSeasons) {
        const season = row.season.trim();
        if (!season) continue;
        const payload = {
          player_id: playerId,
          season,
          matches: row.matches,
          innings: row.innings,
          runs: row.runs,
          highest_score: row.highest_score,
          not_outs: row.not_outs,
          balls_faced: row.balls_faced,
          fours: row.fours,
          sixes: row.sixes,
          fifties: row.fifties,
          hundreds: row.hundreds,
          wickets: row.wickets,
          balls_bowled: row.balls_bowled,
          runs_conceded: row.runs_conceded,
          maidens: row.maidens,
          best_bowling: row.best_bowling.trim() || null,
          catches: row.catches,
          stumpings: row.stumpings,
          run_outs: row.run_outs,
        };
        const { error: upErr } = await supabase
          .from("cricket_player_stats")
          .upsert(payload, { onConflict: "player_id,season" });
        if (upErr) {
          failures.push(`${season}: ${upErr.message}`);
          continue;
        }
        const { data: back } = await supabase
          .from("cricket_player_stats")
          .select("*")
          .eq("player_id", playerId)
          .eq("season", season)
          .maybeSingle();
        const ok =
          back &&
          back.matches === payload.matches &&
          back.runs === payload.runs &&
          back.wickets === payload.wickets &&
          back.innings === payload.innings &&
          (back.best_bowling ?? null) === payload.best_bowling;
        if (!ok) failures.push(`${season}: সংরক্ষণের পর যাচাই মেলেনি`);
      }
    }
    setSaving(false);
    if (failures.length > 0) {
      setError(`কিছু মৌসুম সংরক্ষণ হয়নি — ${failures.join("; ")}`);
    } else {
      setNotice("পরিসংখ্যান সংরক্ষিত হয়েছে — Database-এ যাচাই করা হয়েছে।");
      await load();
    }
  }

  async function removeSeason(season: string) {
    if (!supabase || !season.trim()) {
      // An unsaved blank row just leaves the form.
      if (sport === "football") setSeasons((rows) => rows.filter((r) => r.season !== season));
      else setCkSeasons((rows) => rows.filter((r) => r.season !== season));
      return;
    }
    setError(null);
    setNotice(null);
    const table = sport === "football" ? "football_player_stats" : "cricket_player_stats";
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .eq("player_id", playerId)
      .eq("season", season.trim());
    if (delErr) {
      setError(delErr.message);
      return;
    }
    const { data: back } = await supabase
      .from(table)
      .select("season")
      .eq("player_id", playerId)
      .eq("season", season.trim());
    if ((back ?? []).length > 0) {
      setError("মৌসুম মোছা যায়নি — Database-এ এখনো আছে।");
      return;
    }
    if (sport === "football") setSeasons((rows) => rows.filter((r) => r.season !== season));
    else setCkSeasons((rows) => rows.filter((r) => r.season !== season));
    setNotice(`মৌসুম ${season} মোছা হয়েছে — যাচাই করা হয়েছে।`);
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">পরিসংখ্যান লোড হচ্ছে…</p>;
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-xl border border-brand/30 bg-brand-light p-3 text-sm text-brand-dark" role="status">
          {notice}
        </div>
      )}

      {sport === "football" && (
        <div>
          <h3 className="text-sm font-bold text-brand-dark">মৌসুমভিত্তিক পরিসংখ্যান (সংরক্ষিত)</h3>
          {computed.length > 0 && (
            <div className="mt-2 rounded-lg bg-brand-light px-3 py-2 text-xs leading-relaxed text-brand-dark">
              ম্যাচ পারফরম্যান্স থেকে গণনা করা মৌসুম:{" "}
              {computed.map((s) => `${s.season} (${s.matches} ম্যাচ, ${s.goals ?? 0} গোল)`).join(" · ")}।
              এই মৌসুমগুলোর সংখ্যা গণনা করাই চূড়ান্ত — নিচে একই মৌসুম আবার যোগ করবেন না (দ্বিগুণ গণনা রোধে
              Public পেজে গণনা করা সংখ্যাই প্রাধান্য পায়)।
            </div>
          )}
          <div className="mt-2 space-y-2">
            {seasons.map((row, i) => (
              <div key={row.season + i} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  aria-label="মৌসুম"
                  disabled={!canEdit}
                  className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 disabled:bg-neutral-50"
                  value={row.season}
                  onChange={(e) => setSeasons((rows) => rows.map((r, j) => (j === i ? { ...r, season: e.target.value } : r)))}
                />
                {(["matches", "goals", "assists", "yellow_cards", "red_cards"] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1 text-xs text-neutral-500">
                    {key === "matches" ? "ম্যাচ" : key === "goals" ? "গোল" : key === "assists" ? "অ্যাসিস্ট" : key === "yellow_cards" ? "হলুদ" : "লাল"}
                    <input
                      type="number"
                      min="0"
                      disabled={!canEdit}
                      className="w-16 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50"
                      value={row[key]}
                      onChange={(e) => setSeasons((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: Number(e.target.value) || 0 } : r)))}
                    />
                  </label>
                ))}
                {canEdit && (
                  <button type="button" onClick={() => void removeSeason(row.season)} className="text-xs font-semibold text-red-600">
                    মুছুন
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <button
                type="button"
                onClick={() => setSeasons((rows) => [...rows, { season: "", matches: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 }])}
                className="text-xs font-semibold text-brand"
              >
                + মৌসুম যোগ করুন
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            সংযুক্ত ম্যাচ পারফরম্যান্স রেকর্ড: {perfCount}টি (ম্যাচ রেকর্ড Admin Matches থেকে পরিচালিত হয়)।
            Inactive প্লেয়ারের পুরোনো পরিসংখ্যান এখানেই সংরক্ষিত থাকে।
          </p>
        </div>
      )}

      {sport === "cricket" && (
        <div>
          <h3 className="text-sm font-bold text-brand-dark">মৌসুমভিত্তিক ক্রিকেট পরিসংখ্যান (সংরক্ষিত)</h3>
          {computed.length > 0 && (
            <div className="mt-2 rounded-lg bg-brand-light px-3 py-2 text-xs leading-relaxed text-brand-dark">
              ম্যাচ পারফরম্যান্স থেকে গণনা করা মৌসুম:{" "}
              {computed.map((s) => `${s.season} (${s.matches} ম্যাচ, ${s.runs ?? 0} রান, ${s.wickets ?? 0} উইকেট)`).join(" · ")}।
              এই মৌসুমগুলোর সংখ্যা গণনা করাই চূড়ান্ত — নিচে একই মৌসুম আবার যোগ করবেন না (দ্বিগুণ গণনা রোধে
              Public পেজে গণনা করা সংখ্যাই প্রাধান্য পায়)। গড়/স্ট্রাইক রেট/ইকোনমি কাঁচা সংখ্যা থেকে
              স্বয়ংক্রিয়ভাবে হিসাব হয় — আলাদা করে লিখতে হয় না।
            </div>
          )}
          <div className="mt-3 space-y-4">
            {ckSeasons.map((row, i) => (
              <div key={row.season + i} className="rounded-xl border border-neutral-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
                    মৌসুম
                    <input
                      disabled={!canEdit}
                      className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50"
                      value={row.season}
                      onChange={(e) => setCkSeasons((rows) => rows.map((r, j) => (j === i ? { ...r, season: e.target.value } : r)))}
                    />
                  </label>
                  {canEdit && (
                    <button type="button" onClick={() => void removeSeason(row.season)} className="text-xs font-semibold text-red-600">
                      মৌসুম মুছুন
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {(
                    [
                      ["matches", "ম্যাচ"], ["innings", "ইনিংস"], ["runs", "রান"], ["highest_score", "সর্বোচ্চ"],
                      ["not_outs", "নট আউট"], ["balls_faced", "বল মোকাবিলা"], ["fours", "চার"], ["sixes", "ছয়"],
                      ["fifties", "৫০"], ["hundreds", "১০০"], ["balls_bowled", "বল করা"], ["runs_conceded", "রান খরচ"],
                      ["wickets", "উইকেট"], ["maidens", "মেডেন"], ["catches", "ক্যাচ"], ["stumpings", "স্টাম্পিং"],
                      ["run_outs", "রান আউট"],
                    ] as [keyof CkSeasonRow, string][]
                  ).map(([key, label]) => (
                    <label key={key} className="text-[11px] font-medium text-neutral-500">
                      {label}
                      <input
                        type="number"
                        min="0"
                        disabled={!canEdit}
                        className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50"
                        value={row[key] as number}
                        onChange={(e) => setCkSeasons((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: Number(e.target.value) || 0 } : r)))}
                      />
                    </label>
                  ))}
                  <label className="text-[11px] font-medium text-neutral-500">
                    সেরা বোলিং (যেমন 4/23)
                    <input
                      disabled={!canEdit}
                      className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50"
                      value={row.best_bowling}
                      onChange={(e) => setCkSeasons((rows) => rows.map((r, j) => (j === i ? { ...r, best_bowling: e.target.value } : r)))}
                    />
                  </label>
                </div>
              </div>
            ))}
            {canEdit && (
              <button
                type="button"
                onClick={() => setCkSeasons((rows) => [...rows, { ...EMPTY_CK_SEASON }])}
                className="text-xs font-semibold text-brand"
              >
                + মৌসুম যোগ করুন
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            সংযুক্ত ম্যাচ পারফরম্যান্স রেকর্ড: {perfCount}টি (ম্যাচ রেকর্ড Admin Matches থেকে পরিচালিত হয় — এখানে Duplicate করা হয়নি)।
            Inactive প্লেয়ারের পুরোনো পরিসংখ্যান এখানেই সংরক্ষিত থাকে।
          </p>
        </div>
      )}

      {canEdit && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? "সংরক্ষণ হচ্ছে…" : "পরিসংখ্যান সংরক্ষণ করুন"}
          </button>
        </div>
      )}
    </div>
  );
}
