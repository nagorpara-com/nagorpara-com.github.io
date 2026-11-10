import { useCallback, useEffect, useMemo, useState } from "react";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import TeamRegistrationPrint, {
  type PrintOption,
  type PrintTeamInfo,
} from "../../components/admin/TeamRegistrationPrint";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import { useAdminTeams, type TeamInput } from "../../hooks/useTeams";
import { useTournamentTeamCodes } from "../../hooks/useTournamentTeamCodes";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import type { Sport, Team, Tournament, TournamentTeam } from "../../types/database.types";
import { toBn } from "../../utils/format";
import { TOURNAMENT_STATUS_LABELS_BN } from "../../utils/matchDisplay";
import { teamIdPool } from "../../utils/teamCodes";

/**
 * টিম-নিবন্ধন — the Teams system (migration 0043, owner's order
 * 2026-11-02). Before this page the site had NO teams list at
 * all: each sport had only the organization's own team name in
 * Settings, and a match's opponent was free text. Here an admin
 * can add a team (name + logo), edit it, delete it and
 * publish/unpublish it, per sport. The organization's own teams
 * still live in Team Settings — this list is for the teams they
 * play against; a match stores the picked team's NAME as its
 * opponent text, so deleting a team never rewrites history.
 *
 * All writes go through useAdminTeams (read-back verified).
 * Until migration 0043 is applied live the page shows an honest
 * "not active yet" notice instead of a form that would fail.
 */

const SPORT_LABELS: Record<Sport, string> = { football: "ফুটবল", cricket: "ক্রিকেট" };

/** Tournament format labels as the print sheets show them
 * (TeamRegistrationPrint's FORMAT_LABELS_BN) — used by the
 * tournament summary panel below (v175). */
const FORMAT_LABELS_BN: Record<string, string> = {
  league: "লিগ",
  knockout: "নকআউট",
  group_knockout: "গ্রুপ পর্ব ও নকআউট",
};

/** মৌসুম as the print sheets render it: a bare 4-digit year in
 * Bengali digits, any other stored text unchanged, empty "—". */
const seasonText = (v: string | null | undefined): string =>
  v && /^\d{4}$/.test(v) ? toBn(v) : v && v.trim() ? v : "—";

/** Long Bengali date, mirroring the print sheets' bnDate —
 * a missing value renders as "—". */
function panelDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("bn-BD", { dateStyle: "long" });
}

/** Tournaments as the form's Team ID selector and the print
 * sheet need them: full 0044 fields when live, base otherwise
 * (the ID pool then falls back to 20 — see utils/teamCodes). */
const TOURNAMENT_FULL_COLUMNS =
  "id, name, sport, season, status, is_published, created_at, banner_url, organizer, director, venue, description, format, team_count, points_win, points_draw, points_loss, champion_team_id, start_date, end_date, director_phone, squad_size, match_minutes, cricket_overs, ball_type, runner_up_team_id";
const TOURNAMENT_BASE_COLUMNS = "id, name, sport, season, status, is_published, created_at";

function toPrintInfo(row: Team): PrintTeamInfo {
  return {
    name: row.name,
    sport: row.sport,
    shortName: row.short_name ?? null,
    ownerName: row.registered_by_name ?? null,
    captainName: row.captain_name ?? null,
    coachName: row.coach_name ?? null,
    phone: row.phone ?? null,
    jerseyColor: row.jersey_color ?? null,
    jerseyColorHex: row.jersey_color_hex ?? null,
    establishedDate: row.established_date ?? null,
    displayOrder: row.display_order,
    logoUrl: row.logo_url,
  };
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const emptyForm: TeamInput = {
  sport: "football",
  name: "",
  logoUrl: null,
  isPublished: true,
  displayOrder: 0,
  ownerName: "",
  shortName: "",
  establishedDate: "",
  captainName: "",
  coachName: "",
  jerseyColor: "",
  jerseyColorHex: "",
  phone: "",
};

export default function AdminTeamsPage() {
  const t = useAdminTeams();
  const settings = useSiteSettings();
  const {
    supported: codeSupported,
    fetchEntries,
    fetchTeamEntries,
    saveEntryCode,
  } = useTournamentTeamCodes();
  const [form, setForm] = useState<TeamInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<"all" | Sport>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ---- Tournament Team ID (migration 0056, owner's final model) ----
  // The ID belongs to a TOURNAMENT: the form picks a tournament
  // of the team's sport, then one free ID from that tournament's
  // pool. All of this renders only while the tournament_teams
  // team_code column is live (codeSupported).
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([]);
  const [formTournamentId, setFormTournamentId] = useState("");
  const [formTeamCode, setFormTeamCode] = useState("");
  const [formEntries, setFormEntries] = useState<TournamentTeam[]>([]);
  // ALL tournament entries per team (most recent first, coded
  // or not) — drives the list print buttons and the print
  // sheet's tournament options (owner's print widening,
  // 2026-11-05: a print is offered for any entered team; an
  // entry without an ID prints with a "Team ID বরাদ্দ হয়নি"
  // line instead of the big ID).
  const [entriesByTeam, setEntriesByTeam] = useState<Map<string, TournamentTeam[]>>(new Map());
  const [printOffer, setPrintOffer] = useState<PrintOption & { team: PrintTeamInfo } | null>(null);
  const [printSheet, setPrintSheet] = useState<{
    team: PrintTeamInfo;
    options: PrintOption[];
    initialId: string;
  } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;
    (async () => {
      const run = (cols: string) =>
        client.from("tournaments").select(cols).order("created_at", { ascending: false });
      let { data, error } = await run(TOURNAMENT_FULL_COLUMNS);
      if (error && /column|schema cache/i.test(error.message)) {
        ({ data, error } = await run(TOURNAMENT_BASE_COLUMNS));
      }
      if (cancelled || error || !data) return;
      setAllTournaments(data as unknown as Tournament[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEntriesMap = useCallback(async (): Promise<Map<string, TournamentTeam[]>> => {
    if (!codeSupported || !supabase) return new Map();
    const { data, error } = await supabase
      .from("tournament_teams")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data) return new Map();
    const map = new Map<string, TournamentTeam[]>();
    for (const e of data as TournamentTeam[]) {
      const arr = map.get(e.team_id) ?? [];
      arr.push(e);
      map.set(e.team_id, arr);
    }
    return map;
  }, [codeSupported]);

  const refreshEntries = useCallback(async () => {
    setEntriesByTeam(await loadEntriesMap());
  }, [loadEntriesMap]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await loadEntriesMap();
      if (!cancelled) setEntriesByTeam(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEntriesMap]);

  // Entries of the tournament currently picked in the form —
  // they decide which IDs are already taken there.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!formTournamentId || !codeSupported) {
        if (!cancelled) setFormEntries([]);
        return;
      }
      const rows = await fetchEntries(formTournamentId);
      if (!cancelled) setFormEntries(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [formTournamentId, codeSupported, fetchEntries]);

  const visible = useMemo(
    () => t.teams.filter((row) => sportFilter === "all" || row.sport === sportFilter),
    [t.teams, sportFilter],
  );

  // Team id-to-name lookup for the print sheet (Sheet A's
  // রানার্স-আপ row resolves the stored id through it).
  const teamNameById = useMemo(
    () => new Map(t.teams.map((r) => [r.id, r.name])),
    [t.teams],
  );

  const formTournaments = useMemo(
    () => allTournaments.filter((x) => x.sport === form.sport),
    [allTournaments, form.sport],
  );
  const selectedTournament = formTournaments.find((x) => x.id === formTournamentId) ?? null;

  // The picked tournament's pool minus the IDs other teams hold
  // there; the edited team's own ID in that tournament stays
  // selectable even if the pool has since shrunk past it.
  const idOptions = useMemo(() => {
    if (!selectedTournament) return [];
    const taken = new Set(
      formEntries
        .filter((e) => e.team_id !== editingId && e.team_code)
        .map((e) => e.team_code as string),
    );
    const opts = teamIdPool(selectedTournament.team_count).filter((c) => !taken.has(c));
    const own = formEntries.find((e) => e.team_id === editingId)?.team_code;
    if (own && !opts.includes(own)) opts.push(own);
    return opts;
  }, [selectedTournament, formEntries, editingId]);

  // Tournament summary panel rows (owner's order, v175): once
  // a tournament is picked in the form, its key facts show
  // under the selector so the team is registered against the
  // full picture. Display only — every value comes from the
  // already-fetched tournament row and this tournament's
  // entries (formEntries); nothing is fetched for the panel.
  // The points row follows the other Admin surfaces: it is a
  // league-type figure, shown only when the tournament is a
  // league / group+knockout AND carries points values.
  const summaryRows = useMemo(() => {
    const tr = selectedTournament;
    if (!tr) return [];
    const rows: { label: string; value: string }[] = [
      {
        label: "ফরম্যাট",
        value: tr.format ? (FORMAT_LABELS_BN[tr.format] ?? tr.format) : "—",
      },
      { label: "মৌসুম", value: seasonText(tr.season) },
    ];
    if (tr.start_date || tr.end_date) {
      rows.push({
        label: "তারিখ",
        value: `${panelDate(tr.start_date)} – ${panelDate(tr.end_date)}`,
      });
    }
    rows.push({
      label: "মাঠ / ভেন্যু",
      value: tr.venue && tr.venue.trim() ? tr.venue.trim() : "—",
    });
    rows.push({
      label: "টিম",
      value:
        typeof tr.team_count === "number"
          ? `নিবন্ধিত ${toBn(formEntries.length)}টি / মোট ${toBn(tr.team_count)}টি`
          : `নিবন্ধিত ${toBn(formEntries.length)}টি`,
    });
    if (
      (tr.format === "league" || tr.format === "group_knockout") &&
      [tr.points_win, tr.points_draw, tr.points_loss].some((v) => typeof v === "number")
    ) {
      const pts = (v: number | undefined) => (typeof v === "number" ? toBn(v) : "—");
      rows.push({
        label: "পয়েন্ট ব্যবস্থা",
        value: `জয় ${pts(tr.points_win)} · ড্র ${pts(tr.points_draw)} · হার ${pts(tr.points_loss)}`,
      });
    }
    if (tr.sport === "cricket") {
      if (typeof tr.cricket_overs === "number") {
        rows.push({ label: "ওভার", value: `${toBn(tr.cricket_overs)} ওভার` });
      }
      if (tr.ball_type && tr.ball_type.trim()) {
        rows.push({ label: "বলের ধরন", value: tr.ball_type.trim() });
      }
    }
    if (tr.sport === "football" && typeof tr.match_minutes === "number") {
      rows.push({ label: "ম্যাচের সময়", value: `${toBn(tr.match_minutes)} মিনিট` });
    }
    rows.push({ label: "অবস্থা", value: TOURNAMENT_STATUS_LABELS_BN[tr.status] });
    return rows;
  }, [selectedTournament, formEntries]);

  function changeSport(sport: Sport) {
    // Tournaments (and their ID pools) are per sport — a picked
    // tournament never carries across a sport change.
    setForm({ ...form, sport });
    setFormTournamentId("");
    setFormTeamCode("");
  }

  async function chooseTournament(tournamentId: string) {
    setFormTournamentId(tournamentId);
    setFormTeamCode("");
    // When editing, the team's existing ID in the newly picked
    // tournament (if any) becomes the shown selection.
    if (tournamentId && editingId) {
      const rows = await fetchEntries(tournamentId);
      const own = rows.find((e) => e.team_id === editingId);
      if (own?.team_code) setFormTeamCode(own.team_code);
    }
  }

  async function startEdit(row: Team) {
    setEditingId(row.id);
    setForm({
      sport: row.sport,
      name: row.name,
      logoUrl: row.logo_url,
      isPublished: row.is_published,
      displayOrder: row.display_order,
      ownerName: row.registered_by_name ?? "",
      shortName: row.short_name ?? "",
      establishedDate: row.established_date ?? "",
      captainName: row.captain_name ?? "",
      coachName: row.coach_name ?? "",
      jerseyColor: row.jersey_color ?? "",
      jerseyColorHex: row.jersey_color_hex ?? "",
      phone: row.phone ?? "",
    });
    setMessage(null);
    setConfirmDeleteId(null);
    setPrintOffer(null);
    setFormTournamentId("");
    setFormTeamCode("");
    // Preselect the team's most recent tournament entry that
    // carries an ID — that is the ID context the form shows.
    if (codeSupported) {
      const entries = await fetchTeamEntries(row.id);
      const coded = entries.find((e) => e.team_code);
      if (coded) {
        setFormTournamentId(coded.tournament_id);
        setFormTeamCode(coded.team_code as string);
      }
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
    setFormTournamentId("");
    setFormTeamCode("");
    setPrintOffer(null);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) return setMessage({ ok: false, text: "টিমের নাম আবশ্যক।" });
    if (name.length > 120) return setMessage({ ok: false, text: "টিমের নাম সর্বোচ্চ ১২০ অক্ষর হতে পারবে।" });
    const input: TeamInput = { ...form, name };
    setBusy(true);
    const res = editingId
      ? await t.updateTeam(editingId, input)
      : await t.createTeam(input);
    if (res.error || !res.row) {
      setBusy(false);
      return setMessage({ ok: false, text: res.error ?? "টিম সংরক্ষণ করা যায়নি।" });
    }
    const saved = res.row;
    // Team ID on the picked tournament's entry (0056): assign
    // the chosen ID, or clear the ID the form showed for this
    // tournament when the Admin emptied the picker. No picked
    // tournament = plain registration, no entry is touched.
    let assigned: PrintOption | null = null;
    if (codeSupported && formTournamentId) {
      const tournament = allTournaments.find((x) => x.id === formTournamentId) ?? null;
      if (formTeamCode) {
        const err = await saveEntryCode(formTournamentId, saved.id, formTeamCode);
        if (err) {
          setBusy(false);
          return setMessage({
            ok: false,
            text: `টিম সংরক্ষিত হয়েছে, তবে Team ID সংরক্ষণ করা যায়নি: ${err}`,
          });
        }
        if (tournament) assigned = { tournament, code: formTeamCode };
      } else {
        const existing = formEntries.find((e) => e.team_id === saved.id);
        if (existing?.team_code) {
          const err = await saveEntryCode(formTournamentId, saved.id, null);
          if (err) {
            setBusy(false);
            return setMessage({
              ok: false,
              text: `টিম সংরক্ষিত হয়েছে, তবে Team ID সরানো যায়নি: ${err}`,
            });
          }
        }
      }
    }
    setBusy(false);
    setPrintOffer(assigned ? { ...assigned, team: toPrintInfo(saved) } : null);
    setMessage({ ok: true, text: editingId ? "টিম হালনাগাদ হয়েছে — যাচাই করা হয়েছে।" : "টিম যোগ হয়েছে — যাচাই করা হয়েছে।" });
    void refreshEntries();
    setEditingId(null);
    setForm(emptyForm);
    setFormTournamentId("");
    setFormTeamCode("");
  }

  function openListPrint(row: Team) {
    const entries = entriesByTeam.get(row.id) ?? [];
    const options: PrintOption[] = entries
      .map((e) => ({
        tournament: allTournaments.find((x) => x.id === e.tournament_id),
        code: e.team_code ?? null,
      }))
      .filter((o): o is PrintOption => !!o.tournament);
    if (options.length === 0) return;
    setPrintSheet({
      team: toPrintInfo(row),
      options,
      initialId: options[0].tournament.id,
    });
  }

  async function togglePublish(row: Team) {
    setBusy(true);
    const error = await t.setPublished(row, !row.is_published);
    setBusy(false);
    setMessage(
      error
        ? { ok: false, text: error }
        : { ok: true, text: row.is_published ? "টিমটি আনপাবলিশ করা হয়েছে।" : "টিমটি প্রকাশ করা হয়েছে।" },
    );
  }

  async function remove(row: Team) {
    setBusy(true);
    const error = await t.deleteTeam(row.id);
    setBusy(false);
    setConfirmDeleteId(null);
    if (editingId === row.id) setEditingId(null);
    setMessage(
      error ? { ok: false, text: error } : { ok: true, text: "টিমটি মুছে ফেলা হয়েছে।" },
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-xl font-bold text-brand-dark">টিম-নিবন্ধন</h1>
      
      {t.unsupported ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">টিম-ব্যবস্থা এখনো চালু হয়নি</p>
          <p className="mt-1 text-sm text-amber-700">
            এই সুবিধাটি চালু করতে Migration 0043 Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
            ততদিন ম্যাচের প্রতিপক্ষ আগের মতোই নাম লিখে দিতে হবে।
          </p>
        </div>
      ) : t.loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          {t.loadError}
        </p>
      ) : (
        <>
          <section className="np-card mt-4 p-4 sm:p-5">
            <h2 className="text-base font-bold text-brand-dark">
              {editingId ? "টিম সম্পাদনা করুন" : "নতুন টিম যোগ করুন"}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="team-sport">খেলা *</label>
                <select
                  id="team-sport"
                  className={inputCls}
                  value={form.sport}
                  onChange={(e) => changeSport(e.target.value as Sport)}
                >
                  <option value="football">ফুটবল</option>
                  <option value="cricket">ক্রিকেট</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="team-name">টিমের নাম *</label>
                <input
                  id="team-name"
                  className={inputCls}
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="যেমন: তাড়াশ একাদশ"
                />
              </div>
              {/* Tournament Team ID (migration 0056, owner's final
                  model): pick a tournament of this sport, then one
                  free ID from its pool. Rendered ONLY while the
                  tournament_teams team_code column is live —
                  pre-0056 registration stays plain, as before. */}
              {codeSupported && (
                <div>
                  <label className={labelCls} htmlFor="team-tournament">টুর্নামেন্ট (Team ID-র জন্য)</label>
                  <select
                    id="team-tournament"
                    className={inputCls}
                    value={formTournamentId}
                    onChange={(e) => void chooseTournament(e.target.value)}
                  >
                    <option value="">— টুর্নামেন্ট বাছুন —</option>
                    {formTournaments.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.name}
                        {tr.season ? ` (${tr.season})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">টুর্নামেন্ট না বাছলে Team ID পাবে না।</p>
                  {selectedTournament && (
                    <div className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 ring-1 ring-neutral-200">
                      <p className="text-xs font-semibold text-neutral-800">
                        {selectedTournament.name}
                      </p>
                      <dl className="mt-1 space-y-0.5 text-xs text-neutral-600">
                        {summaryRows.map((r) => (
                          <div key={r.label} className="flex gap-1">
                            <dt className="shrink-0 font-medium text-neutral-500">{r.label}:</dt>
                            <dd>{r.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>
              )}
              {codeSupported && formTournamentId && (
                <div>
                  <label className={labelCls} htmlFor="team-code">Team ID</label>
                  <select
                    id="team-code"
                    className={inputCls}
                    value={formTeamCode}
                    onChange={(e) => setFormTeamCode(e.target.value)}
                  >
                    <option value="">— Team ID নেই —</option>
                    {idOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">অন্য টিমের নেওয়া ID তালিকায় আসবে না।</p>
                </div>
              )}
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor="team-owner">যার নামে টিম নিবন্ধন হচ্ছে (টিমের দায়িত্বশীল ব্যক্তি)</label>
              <input
                id="team-owner"
                className={inputCls}
                value={form.ownerName}
                maxLength={120}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                placeholder="যেমন: মোঃ আব্দুল করিম"
                disabled={!t.ownerSupported}
              />
              {!t.ownerSupported && (
                <p className="mt-1 text-xs text-amber-700">
                  এই ঘরটি চালু করতে Migration 0047 Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
                </p>
              )}
            </div>

            {/* Migration 0050 extras (Step B): short name, founding
                date, captain, coach, jersey colour (name + hex) and
                phone. One fail-soft group — until 0050 is live the
                fields stay disabled under one honest note and saves
                omit them (the 0047 pattern). */}
            {!t.extrasSupported && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                সংক্ষিপ্ত নাম, শুরুর তারিখ, অধিনায়ক, কোচ, জার্সির রং ও ফোন ঘরগুলো চালু করতে Migration 0050
                Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="team-short-name">সংক্ষিপ্ত নাম</label>
                <input
                  id="team-short-name"
                  className={inputCls}
                  value={form.shortName}
                  maxLength={30}
                  onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                  placeholder="যেমন: নগর পাড়া"
                  disabled={!t.extrasSupported}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="team-established">শুরুর তারিখ</label>
                <input
                  id="team-established"
                  type="date"
                  className={inputCls}
                  value={form.establishedDate}
                  onChange={(e) => setForm({ ...form, establishedDate: e.target.value })}
                  disabled={!t.extrasSupported}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="team-captain">অধিনায়ক</label>
                <input
                  id="team-captain"
                  className={inputCls}
                  value={form.captainName}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, captainName: e.target.value })}
                  placeholder="অধিনায়কের নাম"
                  disabled={!t.extrasSupported}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="team-coach">কোচ</label>
                <input
                  id="team-coach"
                  className={inputCls}
                  value={form.coachName}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, coachName: e.target.value })}
                  placeholder="কোচের নাম"
                  disabled={!t.extrasSupported}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="team-jersey-color">জার্সির রং</label>
                <div className="flex items-center gap-2">
                  <input
                    id="team-jersey-color"
                    className={inputCls}
                    value={form.jerseyColor}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, jerseyColor: e.target.value })}
                    placeholder="যেমন: সবুজ"
                    disabled={!t.extrasSupported}
                  />
                  <input
                    id="team-jersey-hex"
                    type="color"
                    aria-label="জার্সির রং বাছুন"
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1 disabled:opacity-50"
                    value={form.jerseyColorHex || "#17623D"}
                    onChange={(e) => setForm({ ...form, jerseyColorHex: e.target.value })}
                    disabled={!t.extrasSupported}
                  />
                  {form.jerseyColorHex && t.extrasSupported && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, jerseyColorHex: "" })}
                      className="shrink-0 text-xs font-medium text-neutral-500 hover:text-red-700"
                    >
                      রং সরান
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="team-phone">ফোন</label>
                <input
                  id="team-phone"
                  className={inputCls}
                  value={form.phone}
                  maxLength={20}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  disabled={!t.extrasSupported}
                />
              </div>
            </div>

            <div className="mt-3">
              <PhotoUploadField
                value={form.logoUrl ?? ""}
                onChange={(url) => setForm({ ...form, logoUrl: url || null })}
                pathPrefix="teams"
                sizeHint="512 × 512 পিক্সেল (অনুপাত 1:1)"
                label="টিমের লোগো"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="team-order">প্রদর্শনের ক্রম</label>
                <input
                  id="team-order"
                  type="number"
                  className={inputCls}
                  value={form.displayOrder}
                  onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) || 0 })}
                />
                <p className="mt-1 text-xs text-neutral-500">ছোট সংখ্যা = আগে (0 = সবার আগে)।</p>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm font-medium text-neutral-700">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                />
                প্রকাশিত (Public সাইটে লোগোসহ দেখাবে)
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "হালনাগাদ করুন" : "টিম যোগ করুন"}
              </button>
              {editingId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancelEdit}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-60"
                >
                  বাতিল
                </button>
              )}
              {message && (
                <p className={`text-sm ${message.ok ? "text-brand" : "text-red-700"}`} role="status">
                  {message.text}
                </p>
              )}
              {printOffer && (
                <button
                  type="button"
                  onClick={() =>
                    setPrintSheet({
                      team: printOffer.team,
                      options: [{ tournament: printOffer.tournament, code: printOffer.code }],
                      initialId: printOffer.tournament.id,
                    })
                  }
                  className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand hover:text-white"
                >
                  প্রিন্ট করুন
                </button>
              )}
            </div>
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {(["all", "football", "cricket"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSportFilter(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  sportFilter === key
                    ? "bg-brand text-white"
                    : "bg-brand-light text-brand-dark hover:bg-brand/20"
                }`}
              >
                {key === "all" ? "সব টিম" : SPORT_LABELS[key]}
              </button>
            ))}
          </div>

          {t.loading ? (
            <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
          ) : visible.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-500">
              এখনো কোনো টিম যোগ করা হয়নি। ওপরের ফর্ম থেকে প্রথম টিমটি যোগ করুন — তারপর ম্যাচ তৈরির সময়
              প্রতিপক্ষ হিসেবে তালিকা থেকে বেছে নেওয়া যাবে।
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {visible.map((row) => (
                <li key={row.id} className="np-card flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-white p-1">
                    {row.logo_url ? (
                      <img loading="lazy" src={row.logo_url} alt="" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-neutral-400">লোগো নেই</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block truncate text-sm font-bold text-neutral-900">{row.name}</span>
                    </span>
                    {row.registered_by_name && (
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        যার নামে নিবন্ধন: {row.registered_by_name}
                      </span>
                    )}
                    {row.captain_name && (
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        অধিনায়ক: {row.captain_name}
                      </span>
                    )}
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark">
                        {SPORT_LABELS[row.sport]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.is_published
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-neutral-200 text-neutral-600"
                        }`}
                      >
                        {row.is_published ? "প্রকাশিত" : "অপ্রকাশিত"}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        প্রদর্শনের ক্রম: {toBn(row.display_order)}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void startEdit(row)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 disabled:opacity-60"
                    >
                      সম্পাদনা
                    </button>
                    {codeSupported && (entriesByTeam.get(row.id)?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openListPrint(row)}
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 disabled:opacity-60"
                      >
                        প্রিন্ট
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void togglePublish(row)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 disabled:opacity-60"
                    >
                      {row.is_published ? "আনপাবলিশ" : "প্রকাশ"}
                    </button>
                    {confirmDeleteId === row.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(row)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          হ্যাঁ, মুছুন
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 disabled:opacity-60"
                        >
                          না
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(row.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:opacity-60"
                      >
                        মুছে ফেলুন
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {printSheet && (
        <TeamRegistrationPrint
          mode="combined"
          org={{
            nameBn: settings.nameBn,
            nameEn: settings.nameEn,
            logo: settings.logoPath,
            address: settings.address,
            email: settings.email,
            phone: settings.phoneDisplay,
            tagline: settings.tagline,
          }}
          teamNameById={teamNameById}
          team={printSheet.team}
          options={printSheet.options}
          initialTournamentId={printSheet.initialId}
          onClose={() => setPrintSheet(null)}
        />
      )}
    </div>
  );
}
