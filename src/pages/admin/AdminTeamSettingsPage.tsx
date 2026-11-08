import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useOwnTeamLink } from "../../hooks/useOwnTeamLink";
import { useAdminTeams } from "../../hooks/useTeams";

/**
 * Team Settings per sport (moved here from Website Settings by
 * the owner's decision, 2026-11-01). Slimmed down by the
 * owner's Step A order (2026-11-03): the team NAME and LOGO are
 * managed ONLY in টিম-নিবন্ধন now — this page keeps just the
 * own-team picker (migration 0048; the public site follows the
 * picked team's name/logo) and the current season. A save from
 * this page writes ONLY the season column, so the stored
 * name/logo/card-stat values can never be wiped from here; the
 * settings-row name/logo still serve as the public fallback
 * when no team is picked. Sport comes from ?sport= — the same
 * pattern as the player-stats page.
 */

type Sport = "football" | "cricket";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";
/** A stored season is either a legacy plain year ("2026", from
 * before the field became a date) or a full ISO date
 * ("2026-11-15") — the owner's choice, 2026-11-02: the season
 * field IS a date field (day-month-year). */
const isIsoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export default function AdminTeamSettingsPage() {
  const { isConfigured, loading, loadError, settings, saveSettings } = useAdminSettings();
  const own = useOwnTeamLink();
  const teamsAdmin = useAdminTeams();
  const [searchParams] = useSearchParams();
  const sport: Sport = searchParams.get("sport") === "cricket" ? "cricket" : "football";

  const [season, setSeason] = useState("");
  /** The stored season when it is NOT a full date (a legacy
   * plain year): kept so an untouched date field never wipes
   * it on save — picking a date replaces it. */
  const [legacySeason, setLegacySeason] = useState("");
  /** The own-team link (migration 0048): which registered team
   * is ours for this sport. null = untouched (the picker shows
   * the saved link); a string = the admin's current pick. */
  const [ownTeamId, setOwnTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const lastSport = useRef<Sport>(sport);
  useEffect(() => {
    if (!settings) return;
    const stored =
      sport === "football"
        ? settings.football_current_season ?? ""
        : settings.cricket_current_season ?? "";
    setSeason(isIsoDate(stored) ? stored : "");
    setLegacySeason(isIsoDate(stored) ? "" : stored);
    // Clear the status line only when the SPORT switches — a
    // save also refreshes `settings`, and it must not wipe the
    // "সংরক্ষিত হয়েছে" message that follows it.
    if (lastSport.current !== sport) {
      lastSport.current = sport;
      setMessage(null);
      setOwnTeamId(null);
    }
  }, [settings, sport]);

  const sportTeams = teamsAdmin.teams.filter((tm) => tm.sport === sport);
  /** The picker's effective value: the admin's pick when they
   * touched it, otherwise the saved link for this sport. */
  const ownTeamValue = ownTeamId ?? (own.ids[sport] ?? "");

  async function save() {
    // The value that will be stored: the picked date if there
    // is one, otherwise the untouched legacy value (a plain
    // year) — never an accidental wipe.
    const seasonValue = season || legacySeason;
    if (sport === "football" && !seasonValue) {
      return setMessage({ ok: false, text: "মৌসুমের তারিখ বাছাই করুন (তারিখ-মাস-সাল)।" });
    }
    setBusy(true);
    // ONLY the season column is written from this page — the
    // stored team name/logo/card-stats are never touched here.
    const patch =
      sport === "football"
        ? { football_current_season: seasonValue }
        : { cricket_current_season: seasonValue || null };
    const error = await saveSettings(patch);
    // Own-team link (0048): saved through its own verified
    // path, only when it actually changed and the columns
    // exist; pre-0048 the picker is disabled and this is a
    // no-op.
    let finalError = error;
    if (!finalError && own.state === "ready" && ownTeamValue !== (own.ids[sport] ?? "")) {
      finalError = await own.save(sport, ownTeamValue || null);
    }
    setBusy(false);
    setMessage(
      finalError
        ? { ok: false, text: finalError }
        : { ok: true, text: "সংরক্ষিত হয়েছে — Public Website-এ প্রতিফলিত হবে।" },
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand-dark">টিম সেটিংস</h1>
      </div>

      {!isConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Supabase সংযুক্ত নয় — Settings সংরক্ষণ করা যাবে না।
        </p>
      ) : loading ? (
        <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
      ) : loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          {loadError}
        </p>
      ) : (
        <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <h2 className="text-base font-bold text-brand-dark">
            {sport === "football" ? "Football Team Settings" : "Cricket Team Settings"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            টিমের নাম ও লোগো এখন টিম-নিবন্ধন থেকে আসে — এখানে আমাদের টিম বাছাই আর বর্তমান মৌসুম ঠিক করা যায়।
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ts-season">
                বর্তমান মৌসুম (তারিখ){sport === "football" ? " *" : ""}
              </label>
              <input
                id="ts-season"
                type="date"
                className={inputCls}
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className={labelCls} htmlFor="ts-own-team">আমাদের টিম (টিম-নিবন্ধন থেকে বাছুন)</label>
            <select
              id="ts-own-team"
              className={inputCls}
              value={ownTeamValue}
              onChange={(e) => setOwnTeamId(e.target.value)}
              disabled={own.state !== "ready"}
            >
              <option value="">— কোনো টিম নয় —</option>
              {sportTeams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                  {tm.is_published ? "" : " (অপ্রকাশিত)"}
                </option>
              ))}
            </select>
            {own.state === "unsupported" ? (
              <p className="mt-1 text-xs text-amber-700">
                এই যোগসূত্রটি চালু করতে Migration 0048 Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
              </p>
            ) : ownTeamValue ? (
              <p className="mt-1 text-xs text-neutral-500">
                Public সাইটে এই টিমের নাম দেখাবে (লোগো থাকলে লোগোও) — দেখাতে হলে টিমটি টিম-নিবন্ধনে প্রকাশিত থাকতে হবে।
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </button>
            {message && (
              <p className={`text-sm ${message.ok ? "text-brand" : "text-red-700"}`} role="status">
                {message.text}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
