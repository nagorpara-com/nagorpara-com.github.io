import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useAdminMatches,
  type MatchDraft,
  type TournamentDraft,
} from "../../hooks/useAdminMatches";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import TeamRegistrationPrint, {
  type PrintTeamInfo,
} from "../../components/admin/TeamRegistrationPrint";
import MatchPrint, {
  type MatchPrintSide,
} from "../../components/admin/MatchPrint";
import { useSiteSettings } from "../../hooks/useSiteSettings";
import {
  BracketView,
  PointsTableView,
} from "../../components/tournament/TournamentViews";
import {
  ballsToOvers,
  bnNum,
  championOf,
  groupByRound,
  knockoutRoundLabel,
  ordinalRoundName,
  oversToBalls,
  parseScore,
  roundRank,
  roundRobinRounds,
  seedPairs,
  KNOCKOUT_ROUNDS,
} from "../../utils/tournament";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import {
  useMatchPerformances,
  type PerformanceDraft,
} from "../../hooks/useMatchPerformances";
import {
  useMatchEvents,
  type MatchEventDraft,
} from "../../hooks/useMatchEvents";
import { scoreConsistencyWarning } from "../../utils/matchScore";
import { EVENT_TYPE_LABELS_BN } from "../../utils/matchDisplay";
import {
  computeSuspensions,
  type Suspension,
} from "../../utils/suspension";
import { useAuth } from "../../context/AuthContext";
import { useTournamentTeamCodes } from "../../hooks/useTournamentTeamCodes";
import { sendTournamentAnnouncement } from "../../utils/tournamentAnnouncement";
import type {
  Match,
  MatchEventType,
  MatchPerformance,
  Sport,
  Team,
  Tournament,
  TournamentTeam,
} from "../../types/database.types";

/**
 * Matches & Tournaments management (§6 Part 2).
 *
 * - Tournaments: list, create/edit, season, status, publishing.
 * - Matches: list with sport/status/search filters, create/edit with
 *   sport, opponent, date/time, venue, scores, result, tournament
 *   association (sport-checked) and publishing.
 * - Match / tournament delete exists (owner's order, 2026-11-02 —
 *   the master save/delete rule; the earlier no-delete decision is
 *   reversed). Deleting a match cascades to its performances;
 *   deleting a tournament unlinks its matches.
 * - Player performances for a match are managed in §6 Part 3.
 *   ALL deletes on this page are admin-only (§6 Security Fix +
 *   2026-11-02 audit fix): the buttons render only for admin
 *   profiles, and migration 0006 makes DELETE on matches /
 *   tournaments / match_performances require is_admin() at the
 *   database level — the UI gate is a convenience, the RLS
 *   policy is the enforcement.
 * Writes are enforced by database RLS (content roles).
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const SPORT_LABELS: Record<Sport, string> = { football: "ফুটবল", cricket: "ক্রিকেট" };
const MATCH_STATUS_LABELS: Record<Match["status"], string> = {
  upcoming: "আসন্ন",
  live: "চলমান",
  completed: "সমাপ্ত",
  postponed: "স্থগিত",
  rescheduled: "পুনর্নির্ধারিত",
  abandoned: "পরিত্যক্ত",
};

const FORMAT_LABELS: Record<string, string> = {
  league: "League",
  knockout: "Knockout",
  group_knockout: "Group + Knockout",
};

/**
 * How a result was decided (Step C, owner's winner rule,
 * 2026-11-03): normally the winner derives from the score
 * alone; a hand-chosen winner is possible only for a penalty
 * shootout (decided by the shootout score), a super over, or
 * a walkover. v176 (D4, owner's order) adds "no_result" for
 * CRICKET only: a পরিত্যক্ত match records no winner and the
 * draw flag, so the points table shares the tournament's
 * draw points between the two teams.
 */
type DecisionKind =
  | "normal"
  | "shootout"
  | "super_over"
  | "walkover"
  | "no_result";

/** Result text stored for a no-result (পরিত্যক্ত) declaration.
 * inferDecision recognises a stored no-result match by this
 * exact text — the matches table carries no decision column. */
const NO_RESULT_TEXT = "ম্যাচ পরিত্যক্ত (ফলাফল হয়নি)";
const TOURNAMENT_STATUS_LABELS: Record<Tournament["status"], string> = {
  upcoming: "আসন্ন",
  ongoing: "চলমান",
  completed: "সমাপ্ত",
};

const EMPTY_TOURNAMENT: TournamentDraft = {
  name: "",
  sport: "football",
  season: "",
  status: "upcoming",
  is_published: false,
  banner_url: "",
  organizer: "",
  director: "",
  venue: "",
  description: "",
  format: "",
  team_count: "",
  points_win: "3",
  points_draw: "1",
  points_loss: "0",
  start_date: "",
  end_date: "",
  director_phone: "",
  squad_size: "",
  match_minutes: "",
  cricket_overs: "",
  ball_type: "",
  runner_up_team_id: "",
};

/** League points defaults per sport (owner's correction,
 * 2026-11-03): football 3/1/0, cricket 2/1/0. Applied ONLY
 * while a NEW tournament is being created — picking the sport
 * in the create form resets the points fields to that sport's
 * defaults. Editing an existing tournament never rewrites its
 * stored points when the sport field changes. */
const POINTS_DEFAULTS: Record<Sport, { win: string; draw: string; loss: string }> = {
  football: { win: "3", draw: "1", loss: "0" },
  cricket: { win: "2", draw: "1", loss: "0" },
};

const EMPTY_MATCH: MatchDraft = {
  sport: "football",
  tournament_id: "",
  opponent: "",
  match_date: "",
  venue: "",
  our_score: "",
  opponent_score: "",
  result: "",
  status: "upcoming",
  is_published: false,
  team_a_id: "",
  team_b_id: "",
  match_no: "",
  round: "",
  winner_team_id: "",
  is_draw: false,
  tiebreaker_note: "",
  banner_url: "",
  referee_name: "",
  toss_winner_team_id: "",
  toss_decision: "",
  overs_a: "",
  overs_b: "",
  wickets_a: "",
  wickets_b: "",
  shootout_a: "",
  shootout_b: "",
  player_of_match_id: "",
};

/** Round options for the match form: knockout stages, the
 * league / friendly kinds (Step C), then numbered league rounds. */
const ROUND_OPTIONS: string[] = [
  ...KNOCKOUT_ROUNDS,
  "লিগ ম্যাচ",
  "প্রীতি ম্যাচ",
  ...Array.from({ length: 38 }, (_, i) => `রাউন্ড ${bnNum(i + 1)}`),
];

/**
 * Winner-vs-score consistency (owner's Winner Consistency Fix,
 * 2026-11-02; semantics updated for the Result Dropdown build,
 * also 2026-11-02): returns the score-implied winner when the
 * form's chosen result contradicts the score, else null.
 * Deliberately NOT an issue: an unchosen result (auto-derive), a
 * winner matching the score, non-numeric scores (no implication
 * possible), and the tiebreaker pattern — equal scores with a
 * winner chosen in the result dropdown (choosing a team over the
 * dropdown's own ড্র option is a deliberate tiebreaker record).
 * NEW with the dropdown: choosing "ম্যাচ ড্র হয়েছে" while the
 * scores are unequal contradicts the score and warns. The fix
 * only warns; it never blocks and never rewrites the chosen
 * result.
 */
function winnerIssue(
  draft: MatchDraft,
  chosenWinner: string,
  chosenDraw: boolean,
): { a: number; b: number; impliedId: string | null } | null {
  if (draft.status !== "completed") return null;
  if (!draft.team_a_id || !draft.team_b_id) return null;
  const a = parseScore(draft.our_score);
  const b = parseScore(draft.opponent_score);
  if (a === null || b === null) return null;
  const impliedId = a > b ? draft.team_a_id : b > a ? draft.team_b_id : null;
  if (chosenWinner) {
    return impliedId !== null && chosenWinner !== impliedId
      ? { a, b, impliedId }
      : null;
  }
  if (chosenDraw) {
    return impliedId !== null ? { a, b, impliedId } : null;
  }
  return null;
}

/**
 * The declaration's effective outcome (Step C winner rule):
 * in the declaration the winner normally derives from the
 * score; only a penalty shootout (decided by its own score),
 * a super over, or a walkover may carry a hand-chosen winner.
 * A cricket no-result records no winner and the draw flag.
 * This is the ONE derivation: handleSaveMatch saves exactly
 * what it returns, and the panel's live preview (v176 D1)
 * shows exactly what it returns, so the stored winner, the
 * preview, the generated result text, the points table and
 * the bracket can never disagree.
 */
function deriveDeclarationOutcome(
  draft: MatchDraft,
  decision: DecisionKind,
): { winner: string; draw: boolean } {
  let winner = draft.winner_team_id;
  let draw = draft.is_draw;
  const a = parseScore(draft.our_score);
  const b = parseScore(draft.opponent_score);
  const fromScores = (): { winner: string; draw: boolean } => {
    if (a === null || b === null) return { winner: "", draw: false };
    if (a > b) return { winner: draft.team_a_id, draw: false };
    if (b > a) return { winner: draft.team_b_id, draw: false };
    return { winner: "", draw: true };
  };
  if (decision === "normal") {
    const d = fromScores();
    winner = d.winner;
    draw = d.draw;
  } else if (decision === "shootout") {
    const sa = draft.shootout_a === "" ? null : Number(draft.shootout_a);
    const sb = draft.shootout_b === "" ? null : Number(draft.shootout_b);
    if (sa !== null && sb !== null && sa !== sb) {
      winner = sa > sb ? draft.team_a_id : draft.team_b_id;
      draw = false;
    } else if (sa !== null && sb !== null) {
      winner = "";
      draw = true;
    } else {
      const d = fromScores();
      winner = d.winner;
      draw = d.draw;
    }
  } else if (decision === "no_result" && draft.sport === "cricket") {
    // পরিত্যক্ত: no winner; the draw flag makes the points
    // table share the tournament's draw points (D4).
    winner = "";
    draw = true;
  }
  // super_over / walkover: the ticked outcome stands.
  return { winner, draw };
}

/**
 * Which decision kind a stored match reopens with (Step C):
 * a stored no-result text means the পরিত্যক্ত kind; recorded
 * shootout scores mean the shootout kind; a recorded winner
 * the score does NOT imply (a drawn game decided by hand, a
 * walkover) means a manual kind; everything else is the
 * normal score-decided kind.
 */
function inferDecision(m: Match): DecisionKind {
  if (m.result === NO_RESULT_TEXT) return "no_result";
  if (m.shootout_a != null || m.shootout_b != null) return "shootout";
  if (m.winner_team_id) {
    const a = parseScore(m.our_score);
    const b = parseScore(m.opponent_score);
    const implied =
      a !== null && b !== null
        ? a > b
          ? m.team_a_id
          : b > a
            ? m.team_b_id
            : null
        : undefined;
    if (implied !== m.winner_team_id) return "super_over";
  }
  return "normal";
}

/**
 * Picker label for a registered team: its plain name (with the
 * unpublished marker), exactly as before migration 0055. Used
 * by the প্রতিপক্ষ picker, whose stored value is the NAME text.
 */
function teamOptionLabel(team: Team): string {
  return `${team.name}${team.is_published ? "" : " (অপ্রকাশিত)"}`;
}

/**
 * টিম A / টিম B label (migration 0056, owner's final model):
 * when the match's selected tournament gives this team a Team
 * ID, the label is "A1 — <name>"; otherwise the plain label.
 * Labels only — the stored values never change.
 */
function matchTeamLabel(team: Team, codeByTeam: Map<string, string>): string {
  const code = codeByTeam.get(team.id);
  return code ? `${code} — ${teamOptionLabel(team)}` : teamOptionLabel(team);
}

/**
 * Read-only Team ID box under a টিম A / টিম B picker (owner's
 * Match Creation rule, 2026-11-05): the picked team's Team ID
 * in the match's selected tournament shows automatically —
 * never chosen by hand. Display only; nothing is submitted
 * from it. Rendered only while migration 0056 is live.
 */
function TeamIdBox({
  id,
  teamId,
  tournamentId,
  code,
}: {
  id: string;
  teamId: string;
  tournamentId: string;
  code: string | undefined;
}) {
  return (
    <div
      id={id}
      className="mt-2 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
    >
      <span className="shrink-0 text-xs font-medium text-neutral-500">Team ID</span>
      {code ? (
        <span className="font-bold text-brand-dark">{code}</span>
      ) : !teamId ? (
        <span className="text-neutral-400">—</span>
      ) : !tournamentId ? (
        <span className="text-neutral-500">টুর্নামেন্ট বাছলে Team ID দেখা যাবে</span>
      ) : (
        <span className="text-neutral-500">এই টুর্নামেন্টে Team ID বরাদ্দ হয়নি</span>
      )}
    </div>
  );
}

/** timestamptz -> <input type="datetime-local"> value */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "তারিখ নির্ধারিত নয়";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
}

function PublishChip({ published }: { published: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        published ? "bg-brand-light text-brand-dark" : "bg-neutral-100 text-neutral-500"
      }`}
    >
      {published ? "প্রকাশিত" : "অপ্রকাশিত"}
    </span>
  );
}

/** A team row as the print sheets need it (the same mapping
 * AdminTeamsPage uses for the registration sheet). */
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

export default function AdminMatchesPage({
  section = "matches",
}: {
  // Owner's orders: ম্যাচ and টুর্নামেন্ট are two SEPARATE admin
  // pages (2026-11-03), and বিজয়ী দল ঘোষণা is a third page of
  // its own (also 2026-11-03) where results are declared. One
  // component renders only its own section per route; all
  // logic stays shared.
  section?: "tournaments" | "matches" | "declare";
}) {
  const isT = section === "tournaments";
  const isDeclare = section === "declare";
  const {
    isConfigured,
    loading,
    loadError,
    tournaments,
    matches,
    saveTournament,
    saveMatch,
    setTournamentPublished,
    setMatchPublished,
    deleteMatch,
    deleteTournament,
    fetchTournamentTeams,
    setTournamentTeams,
    createMatchesBulk,
    syncChampion,
  } = useAdminMatches();

  const { profile } = useAuth();
  const settings = useSiteSettings();
  // Tournament-only print sheet (Print A, owner's final print
  // specification, 2026-11-05): the tournament whose info sheet
  // is open in the print modal, if any.
  const [tournamentPrint, setTournamentPrint] = useState<Tournament | null>(null);
  // Match print sheet (owner's instruction, 2026-11-05; v169):
  // the fixture plus both teams' registration information,
  // opened from a matches-list row — see openMatchPrint below.
  const [matchPrint, setMatchPrint] = useState<{
    match: Match;
    tournament: Tournament | null;
    sideA: MatchPrintSide;
    sideB: MatchPrintSide;
  } | null>(null);
  // Match/tournament DELETE is admin-only at the database level
  // (migration 0006, is_admin()); the buttons render only for
  // admins — the same gate Performance removal uses below
  // (2026-11-02 audit fix). RLS is the enforcement; this gate
  // keeps non-admins from attempting a delete the DB would refuse.
  const canDelete = profile?.role === "admin";

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tournament form state
  const [tEditing, setTEditing] = useState<string | "new" | null>(null);
  const [tForm, setTForm] = useState<TournamentDraft>(EMPTY_TOURNAMENT);
  const [tSaving, setTSaving] = useState(false);
  // "সাবস্ক্রাইবারদের ইমেইল পাঠান" tick on the tournament form
  // (owner's tournament fixes, 2026-11-03): unchecked by default;
  // acted on only when the save leaves the tournament published,
  // and cleared after any attempt so a later edit never re-sends
  // by accident.
  const [tEmail, setTEmail] = useState(false);

  // Match form + filters state
  const [mEditing, setMEditing] = useState<string | "new" | null>(null);
  const [mForm, setMForm] = useState<MatchDraft>(EMPTY_MATCH);
  const [mSaving, setMSaving] = useState(false);
  // Owner's Report model (2026-11-03): the match editor has two
  // views over ONE draft and ONE save path — "schedule" (create /
  // edit: teams, tournament, date, venue — NO score or result)
  // and "report" (after the match is played: scores with
  // sport-specific labels, the result declaration, and the
  // player Performance editor on the same page). Opening the
  // report sets the draft status to "completed", so saving the
  // report IS declaring the result.
  const [mView, setMView] = useState<"schedule" | "report">("schedule");

  // Teams list for the opponent picker (Teams system, migration
  // 0043). Read directly and FAIL-SOFT: until 0043 is applied
  // live the query errors, the list stays empty and the picker
  // simply does not render — the free-text opponent field keeps
  // working exactly as before. Editors see every team (RLS);
  // picking one stores its NAME as the opponent text.
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;
    (async () => {
      // Base columns only: the per-sport teams.team_code of
      // migration 0055 is superseded (0056) and no longer read
      // here — Team ID prefixes come from the match's tournament
      // entries instead (see mEntryCodes below).
      const { data, error } = await client
        .from("teams")
        .select("id, sport, name, logo_url, is_published, display_order, created_at")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled || error || !data) return;
      setTeams(data as unknown as Team[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tournament Team IDs (migration 0056): the entries of the
  // match's currently selected tournament, keyed by team_id.
  // The টিম A / টিম B labels prefix from this map; no tournament
  // (or pre-0056 rows without the column) leaves it empty and
  // the labels stay plain. Fail-soft via fetchTournamentTeams.
  // `entryCodeSupported` gates the read-only Team ID boxes under
  // the pickers: pre-0056 they do not render at all.
  const { supported: entryCodeSupported } = useTournamentTeamCodes();
  const [mEntryCodes, setMEntryCodes] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mForm.tournament_id) {
        if (!cancelled) setMEntryCodes(new Map());
        return;
      }
      const entries = await fetchTournamentTeams(mForm.tournament_id);
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const e of entries) if (e.team_code) map.set(e.team_id, e.team_code);
      setMEntryCodes(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [mForm.tournament_id, fetchTournamentTeams]);

  // Sequential auto-round (owner's Match Creation rule,
  // 2026-11-05): while CREATING a match in a tournament, the
  // round is automatic — the (existing match count + 1)th
  // ordinal round of that tournament. The count is fetched live
  // whenever the tournament selection changes and counts EVERY
  // existing match of the tournament (any status/publication —
  // created matches occupy sequence positions). Deleting a
  // match therefore frees its position for the next created
  // match; existing matches are never renumbered (Edit keeps
  // the manual picker).
  const [mTournamentMatchCount, setMTournamentMatchCount] = useState<{
    tournamentId: string;
    count: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mEditing !== "new" || !mForm.tournament_id) {
        if (!cancelled) setMTournamentMatchCount(null);
        return;
      }
      const tournamentId = mForm.tournament_id;
      const fromLoaded = () =>
        matches.filter((m) => m.tournament_id === tournamentId).length;
      if (!isSupabaseConfigured || !supabase) {
        if (!cancelled) setMTournamentMatchCount({ tournamentId, count: fromLoaded() });
        return;
      }
      const { data, error } = await supabase
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId);
      if (cancelled) return;
      setMTournamentMatchCount({
        tournamentId,
        count: !error && data ? data.length : fromLoaded(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mEditing, mForm.tournament_id, matches]);
  // The automatic round applies only in create mode with a
  // tournament picked; it is shown read-only and saved as the
  // match's round. A null name means the live count has not
  // arrived yet — the save path then counts the loaded list.
  const autoRoundActive = mEditing === "new" && Boolean(mForm.tournament_id);
  const autoRoundName =
    autoRoundActive && mTournamentMatchCount?.tournamentId === mForm.tournament_id
      ? ordinalRoundName(mTournamentMatchCount.count + 1)
      : null;

  // How the open declaration was decided (Step C winner rule).
  const [mDecision, setMDecision] = useState<DecisionKind>("normal");

  // Players for the ম্যাচসেরা picker (declaration panel). Read
  // fail-soft like the teams list: an empty list simply leaves
  // the picker with no options.
  const [allPlayers, setAllPlayers] = useState<
    { id: string; name: string; sport: Sport; status: string | null; team_id: string | null }[]
  >([]);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;
    (async () => {
      const { data, error } = await client
        .from("players")
        .select("id, name, sport, status, team_id")
        .is("archived_at", null)
        .order("display_order", { ascending: true });
      if (cancelled || error || !data) return;
      setAllPlayers(
        data as { id: string; name: string; sport: Sport; status: string | null; team_id: string | null }[],
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Card suspensions (Step D): on the declaration page only,
  // fetch the card columns of every performance in a completed
  // tournament match, then compute the unserved bans with
  // utils/suspension. Base columns only (live since 0004) — no
  // new migration dependency. Fail-soft: an error simply leaves
  // the card hidden.
  const [suspPerfs, setSuspPerfs] = useState<MatchPerformance[] | null>(null);
  const completedTournamentMatchKey = useMemo(
    () =>
      matches
        .filter((m) => m.status === "completed" && m.tournament_id)
        .map((m) => m.id)
        .sort()
        .join(","),
    [matches],
  );
  useEffect(() => {
    if (!isDeclare || !isSupabaseConfigured || !supabase) return;
    if (!completedTournamentMatchKey) return;
    const client = supabase;
    const ids = completedTournamentMatchKey.split(",");
    let cancelled = false;
    (async () => {
      const { data, error } = await client
        .from("match_performances")
        .select("player_id, match_id, yellow_cards, red_cards")
        .in("match_id", ids);
      if (cancelled || error || !data) return;
      setSuspPerfs(data as unknown as MatchPerformance[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDeclare, completedTournamentMatchKey]);
  const suspensions = useMemo<Suspension[]>(() => {
    if (!isDeclare || !suspPerfs) return [];
    return tournaments.flatMap((t) => computeSuspensions(t, matches, suspPerfs));
  }, [isDeclare, suspPerfs, tournaments, matches]);

  // Registered entries of the tournament in the editor — the
  // runner-up picker offers these teams when they are known.
  const [tEntries, setTEntries] = useState<TournamentTeam[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows =
        tEditing && tEditing !== "new"
          ? await fetchTournamentTeams(tEditing)
          : [];
      if (!cancelled) setTEntries(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [tEditing, fetchTournamentTeams]);

  const [perfMatchId, setPerfMatchId] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<"all" | Sport>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Match["status"]>("all");
  const [query, setQuery] = useState("");

  const tournamentById = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments],
  );
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // Runner-up picker options (Step C): the tournament's
  // registered teams when they are known, else the sport's teams.
  const tRunnerOptions = useMemo(() => {
    if (tEntries.length > 0) {
      return tEntries
        .map((e) => teamById.get(e.team_id))
        .filter((t): t is Team => Boolean(t));
    }
    return teams.filter((t) => t.sport === tForm.sport);
  }, [tEntries, teamById, teams, tForm.sport]);

  // Knockout elimination (owner's order, 2026-11-03): in a
  // KNOCKOUT tournament, a team that lost a completed match
  // (winner recorded) is out — it no longer appears in the
  // team pickers for new matches of that tournament. Derived
  // from the recorded results, so correcting a result brings
  // the team back automatically. League tournaments are not
  // affected, and the match being edited keeps its own teams.
  const knockoutEliminated = useMemo(() => {
    const t = mForm.tournament_id ? tournamentById.get(mForm.tournament_id) : undefined;
    if (!t || t.format !== "knockout") return new Set<string>();
    const out = new Set<string>();
    for (const m of matches) {
      if (m.tournament_id !== t.id || m.status !== "completed" || !m.winner_team_id) continue;
      if (m.team_a_id && m.team_a_id !== m.winner_team_id) out.add(m.team_a_id);
      if (m.team_b_id && m.team_b_id !== m.winner_team_id) out.add(m.team_b_id);
    }
    if (mEditing && mEditing !== "new") {
      out.delete(mForm.team_a_id);
      out.delete(mForm.team_b_id);
    }
    return out;
  }, [matches, tournamentById, mForm.tournament_id, mForm.team_a_id, mForm.team_b_id, mEditing]);
  const formTeams = useMemo(
    () =>
      teams.filter(
        (team) => team.sport === mForm.sport && !knockoutEliminated.has(team.id),
      ),
    [teams, mForm.sport, knockoutEliminated],
  );

  // Live winner preview (v176 D1): in the declaration the
  // winner buttons mirror the SAME derivation the save will
  // perform, so the admin sees the outcome while typing the
  // scores. In the manual kinds (super over / walkover) the
  // buttons mirror the admin's own tick, exactly as before;
  // in the পরিত্যক্ত kind no outcome button is lit.
  const declareLinked = Boolean(mForm.team_a_id && mForm.team_b_id);
  const derivedOutcome = deriveDeclarationOutcome(mForm, mDecision);
  const previewManualKind =
    mDecision === "super_over" || mDecision === "walkover";
  const shownWinnerId =
    mDecision === "normal" || mDecision === "shootout"
      ? derivedOutcome.winner
      : mDecision === "no_result"
        ? ""
        : mForm.winner_team_id;
  const shownDraw =
    mDecision === "normal" || mDecision === "shootout"
      ? derivedOutcome.draw && !derivedOutcome.winner
      : mDecision === "no_result"
        ? false
        : mForm.is_draw && !mForm.winner_team_id;
  // The preview line speaks only when the derivation actually
  // engaged: both scores entered (normal), the shootout pair
  // or both scores entered (shootout), a tick (manual kinds),
  // or the পরিত্যক্ত kind itself. Incomplete scores show
  // nothing — no guessing.
  const previewScoresReady =
    parseScore(mForm.our_score) !== null &&
    parseScore(mForm.opponent_score) !== null;
  const previewShootReady =
    mForm.shootout_a !== "" && mForm.shootout_b !== "";
  const previewEngaged =
    mDecision === "normal"
      ? previewScoresReady
      : mDecision === "shootout"
        ? previewShootReady || previewScoresReady
        : true;
  const previewLine =
    mView === "report" && declareLinked && previewEngaged
      ? mDecision === "no_result"
        ? "ফলাফল: ম্যাচ পরিত্যক্ত (ফলাফল হয়নি)"
        : shownWinnerId
          ? `বিজয়ী: ${teamById.get(shownWinnerId)?.name ?? "টিম"} (${
              previewManualKind ? "হাতে বাছাই করা" : "স্কোর অনুযায়ী"
            })`
          : shownDraw
            ? `ফলাফল: ড্র (${previewManualKind ? "হাতে বাছাই করা" : "স্কোর অনুযায়ী"})`
            : null
      : null;

  // Orphaned match (v176 D2): a side whose team was deleted
  // after the fixture was created (migration 0044 nulls the
  // link, and there is no name snapshot). Team A's link
  // missing is the broken case — the panel header collapses
  // to "বনাম <opponent>" and no winner controls render. A
  // MISSING Team B id is by design the outside-opponent case
  // and warns only when the stored id no longer resolves.
  const orphanTeamLink =
    mView === "report" &&
    (!teamById.has(mForm.team_a_id) ||
      (mForm.team_b_id !== "" && !teamById.has(mForm.team_b_id)));

  const visibleMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (sportFilter !== "all" && m.sport !== sportFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (q) {
        const names = [
          m.opponent,
          teamById.get(m.team_a_id ?? "")?.name ?? "",
          teamById.get(m.team_b_id ?? "")?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!names.includes(q)) return false;
      }
      return true;
    });
  }, [matches, sportFilter, statusFilter, query, teamById]);

  // Match print (v169): build the sheet's data for one match.
  // The Team IDs come from the teams' entries in the match's
  // tournament (the same fetchTournamentTeams read the form
  // uses). The full registration fields are NOT part of this
  // page's teams read (base columns only), so the two sides'
  // full rows are fetched here, fail-soft down the column
  // ladder — a pre-0050 database simply prints the base data.
  const openMatchPrint = async (m: Match) => {
    const tr = m.tournament_id
      ? tournamentById.get(m.tournament_id) ?? null
      : null;
    const entries = m.tournament_id
      ? await fetchTournamentTeams(m.tournament_id)
      : [];
    const codeOf = (teamId: string | null | undefined): string | null =>
      teamId
        ? entries.find((e) => e.team_id === teamId)?.team_code ?? null
        : null;
    const ids = [m.team_a_id, m.team_b_id].filter((x): x is string => !!x);
    const fullById = new Map<string, Team>();
    if (ids.length > 0 && isSupabaseConfigured && supabase) {
      const FULL_COLUMNS =
        "id, sport, name, logo_url, is_published, display_order, created_at, registered_by_name, short_name, established_date, captain_name, coach_name, jersey_color, jersey_color_hex, phone";
      const BASE_COLUMNS =
        "id, sport, name, logo_url, is_published, display_order, created_at";
      const fullRes = await supabase.from("teams").select(FULL_COLUMNS).in("id", ids);
      let fetched: Team[] = [];
      if (fullRes.error) {
        const baseRes = await supabase.from("teams").select(BASE_COLUMNS).in("id", ids);
        if (!baseRes.error && baseRes.data) {
          fetched = baseRes.data as unknown as Team[];
        }
      } else if (fullRes.data) {
        fetched = fullRes.data as unknown as Team[];
      }
      for (const row of fetched) fullById.set(row.id, row);
    }
    const infoOf = (teamId: string | null | undefined): PrintTeamInfo | null => {
      if (!teamId) return null;
      const row = fullById.get(teamId) ?? teamById.get(teamId);
      return row ? toPrintInfo(row) : null;
    };
    const teamA = infoOf(m.team_a_id);
    const teamB = infoOf(m.team_b_id);
    setMatchPrint({
      match: m,
      tournament: tr,
      sideA: {
        name: teamA?.name ?? "—",
        team: teamA,
        code: codeOf(m.team_a_id),
        outside: false,
      },
      sideB: m.team_b_id
        ? {
            name: teamB?.name ?? m.opponent,
            team: teamB,
            code: codeOf(m.team_b_id),
            outside: false,
          }
        : { name: m.opponent, team: null, code: null, outside: true },
    });
  };

  // Tournaments offered in the match form: same sport only (sport integrity).
  const formTournaments = useMemo(
    () => tournaments.filter((t) => t.sport === mForm.sport),
    [tournaments, mForm.sport],
  );

  // Match counts for the sport currently picked in the match
  // form (owner's order, v175): one hint line under the খেলা
  // select shows that sport's total and চলমান (live) matches,
  // counted from the matches already loaded in page state —
  // no extra query.
  const formSportMatchCounts = useMemo(() => {
    const ofSport = matches.filter((m) => m.sport === mForm.sport);
    return {
      total: ofSport.length,
      live: ofSport.filter((m) => m.status === "live").length,
    };
  }, [matches, mForm.sport]);

  // Impact confirmation (owner's rule): changing a tournament's
  // format or planned team count while matches already exist must
  // show the impact and take a confirmation first — nothing is
  // ever silently deleted (this save never deletes matches).
  const [tImpactConfirm, setTImpactConfirm] = useState(false);

  async function handleSaveTournament(force = false) {
    if (!tForm.name.trim()) {
      setError("টুর্নামেন্টের নাম আবশ্যক।");
      return;
    }
    if (tForm.season.trim() && !/^\d{4}$/.test(tForm.season.trim())) {
      setError("মৌসুম ৪ সংখ্যার বছর হতে হবে (যেমন 2026) — অথবা খালি রাখুন।");
      return;
    }
    if (tForm.team_count && (Number(tForm.team_count) < 2 || Number(tForm.team_count) > 64)) {
      setError("টিমসংখ্যা ২ থেকে ৬৪-এর মধ্যে হতে হবে।");
      return;
    }
    if (tForm.start_date && tForm.end_date && tForm.end_date < tForm.start_date) {
      setError("শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।");
      return;
    }
    if (
      tForm.squad_size &&
      (!Number.isInteger(Number(tForm.squad_size)) ||
        Number(tForm.squad_size) < 1 ||
        Number(tForm.squad_size) > 30)
    ) {
      setError("প্রতি দলে প্লেয়ার সংখ্যা ১ থেকে ৩০-এর মধ্যে হতে হবে।");
      return;
    }
    if (
      tForm.match_minutes &&
      (!Number.isInteger(Number(tForm.match_minutes)) ||
        Number(tForm.match_minutes) < 1 ||
        Number(tForm.match_minutes) > 300)
    ) {
      setError("ম্যাচের মিনিট ১ থেকে ৩০০-এর মধ্যে হতে হবে।");
      return;
    }
    if (
      tForm.cricket_overs &&
      (!Number.isInteger(Number(tForm.cricket_overs)) ||
        Number(tForm.cricket_overs) < 1 ||
        Number(tForm.cricket_overs) > 100)
    ) {
      setError("ওভার ১ থেকে ১০০-এর মধ্যে হতে হবে।");
      return;
    }
    if (!force && tEditing && tEditing !== "new") {
      const orig = tournamentById.get(tEditing);
      const existing = matches.filter((m) => m.tournament_id === tEditing).length;
      if (
        orig &&
        existing > 0 &&
        ((orig.format ?? "") !== tForm.format ||
          String(orig.team_count ?? "") !== tForm.team_count)
      ) {
        setTImpactConfirm(true);
        setError(null);
        return;
      }
    }
    setTImpactConfirm(false);
    setTSaving(true);
    setError(null);
    const res = await saveTournament(tEditing === "new" ? null : tEditing, tForm);
    setTSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // Email announcement (owner's tournament fixes, 2026-11-03):
    // the tick is consumed by THIS save — cleared now so no later
    // edit can re-send by accident. The announcement runs only
    // when the saved tournament is published; its outcome is a
    // line appended to the save's own message and never undoes
    // the save.
    const wantEmail = tEmail;
    if (wantEmail) setTEmail(false);
    setTEditing(null);
    let noticeText = res.warning ?? "টুর্নামেন্ট সংরক্ষিত হয়েছে।";
    if (wantEmail && !tForm.is_published) {
      noticeText += " ইমেইল পাঠানো হয়নি — টুর্নামেন্ট প্রকাশিত নয়।";
    }
    setNotice(noticeText);
    if (wantEmail && tForm.is_published) {
      const announcement = await sendTournamentAnnouncement({
        name: tForm.name,
        sport: tForm.sport,
        season: tForm.season.trim() || null,
        description: tForm.description.trim() || null,
        start_date: tForm.start_date || null,
        end_date: tForm.end_date || null,
        venue: tForm.venue.trim() || null,
        banner_url: tForm.banner_url.trim() || null,
        createdBy: profile?.id ?? null,
      });
      setNotice(`${noticeText} ${announcement.text}`);
    }
  }

  // Published-result confirmation (owner's rule): editing the
  // score/result of an already published, completed match asks
  // first; the change itself is recorded in the Audit Log
  // (migration 0044 triggers) once saved. The winner-consistency
  // warning (Winner Consistency Fix, 2026-11-02) merges into the
  // SAME confirmation, so one save never asks twice.
  const [mResultConfirm, setMResultConfirm] = useState(false);
  const [mWinnerWarn, setMWinnerWarn] = useState(false);

  // Next-round impact of correcting a result (owner's Phase A
  // rule): when the recorded winner already appears in a later
  // round of the same tournament, the confirmation names those
  // matches — downstream fixtures never change silently.
  const editingOrig =
    mResultConfirm && mEditing && mEditing !== "new"
      ? matches.find((m) => m.id === mEditing)
      : undefined;
  const resultImpact = (() => {
    if (!editingOrig?.winner_team_id || !editingOrig.tournament_id) return null;
    const affected = matches.filter(
      (x) =>
        x.id !== editingOrig.id &&
        x.tournament_id === editingOrig.tournament_id &&
        (x.team_a_id === editingOrig.winner_team_id ||
          x.team_b_id === editingOrig.winner_team_id) &&
        roundRank(x.round) > roundRank(editingOrig.round),
    );
    if (affected.length === 0) return null;
    return {
      winnerName: teamById.get(editingOrig.winner_team_id)?.name ?? "বিজয়ী টিম",
      affected,
    };
  })();

  // The match currently open in the editor (either view).
  const mOrig =
    mEditing && mEditing !== "new" ? matches.find((m) => m.id === mEditing) : undefined;

  async function handleSaveMatch(force = false) {
    if (!mForm.opponent.trim()) {
      setError("প্রতিপক্ষের নাম আবশ্যক।");
      return;
    }
    if (mForm.tournament_id) {
      const t = tournamentById.get(mForm.tournament_id);
      if (t && t.sport !== mForm.sport) {
        setError("নির্বাচিত টুর্নামেন্ট এই খেলার নয় — একই খেলার টুর্নামেন্ট বেছে নিন।");
        return;
      }
    }
    if (mForm.team_a_id && mForm.team_a_id === mForm.team_b_id) {
      setError("একই টিম দুই পক্ষে হতে পারে না — দুটি আলাদা টিম বেছে নিন।");
      return;
    }
    if (
      mEditing === "new" &&
      ((mForm.team_a_id && knockoutEliminated.has(mForm.team_a_id)) ||
        (mForm.team_b_id && knockoutEliminated.has(mForm.team_b_id)))
    ) {
      setError("এই টিমটি এই নকআউট টুর্নামেন্টে হেরে বাদ পড়েছে — নতুন ম্যাচে তাকে আর বাছাই করা যাবে না।");
      return;
    }
    if (mView === "report" && mForm.sport === "cricket") {
      for (const v of [mForm.overs_a, mForm.overs_b]) {
        if (v.trim() !== "" && oversToBalls(v) === null) {
          setError("ওভারের লেখা ঠিক নয় — যেমন ২০ অথবা 19.4 লিখুন (ওভারের পরের সংখ্যা ০-৫ হতে হয়)।");
          return;
        }
      }
      for (const w of [mForm.wickets_a, mForm.wickets_b]) {
        if (w !== "" && (!Number.isInteger(Number(w)) || Number(w) < 0 || Number(w) > 10)) {
          setError("উইকেট ০ থেকে ১০-এর মধ্যে হতে হবে।");
          return;
        }
      }
    }
    // Effective outcome (Step C, owner's winner rule): the ONE
    // shared derivation — see deriveDeclarationOutcome. The
    // payload below saves THIS outcome.
    const linkedTeams = Boolean(mForm.team_a_id && mForm.team_b_id);
    let effWinner = mForm.winner_team_id;
    let effDraw = mForm.is_draw;
    if (mView === "report" && linkedTeams) {
      const eff = deriveDeclarationOutcome(mForm, mDecision);
      effWinner = eff.winner;
      effDraw = eff.draw;
    }
    if (
      mForm.status === "completed" &&
      !mForm.our_score.trim() &&
      !mForm.result.trim() &&
      !effWinner &&
      !effDraw
    ) {
      setError("সমাপ্ত ম্যাচের স্কোর অথবা ফলাফল বেছে দিন — কোনোটিই জানা না থাকলে অবস্থা 'আসন্ন' রাখুন।");
      return;
    }
    const shootA = mForm.shootout_a === "" ? null : Number(mForm.shootout_a);
    const shootB = mForm.shootout_b === "" ? null : Number(mForm.shootout_b);
    if (!force) {
      const orig =
        mEditing && mEditing !== "new"
          ? matches.find((m) => m.id === mEditing)
          : undefined;
      const resultChanged = Boolean(
        orig &&
          orig.is_published &&
          orig.status === "completed" &&
          (orig.our_score !== (mForm.our_score.trim() || null) ||
            orig.opponent_score !== (mForm.opponent_score.trim() || null) ||
            orig.result !== (mForm.result.trim() || null) ||
            (orig.winner_team_id ?? "") !== effWinner ||
            orig.is_draw !== effDraw ||
            (orig.shootout_a ?? null) !== shootA ||
            (orig.shootout_b ?? null) !== shootB),
      );
      // A winner warning can only arise where a winner was CHOSEN
      // by hand: the manual decision kinds in the declaration
      // (normal and shootout outcomes follow the scores by
      // construction), or the schedule editor's stored fields.
      const manualOutcome =
        mView === "schedule" ||
        mDecision === "super_over" ||
        mDecision === "walkover";
      const wIssue = manualOutcome
        ? winnerIssue(
            mForm,
            mView === "report" ? effWinner : mForm.winner_team_id,
            mView === "report" ? effDraw : mForm.is_draw,
          )
        : null;
      if (resultChanged || wIssue) {
        setMResultConfirm(resultChanged);
        setMWinnerWarn(Boolean(wIssue));
        setError(null);
        return;
      }
    }
    setMResultConfirm(false);
    setMWinnerWarn(false);
    setMSaving(true);
    setError(null);
    // Public result TEXT (Step C extends the 2026-11-02 result
    // rule): for a completed match between two linked teams the
    // text is generated from the SAME effective outcome the form
    // records — football carries the score (plus the shootout
    // when there was one), cricket carries the win margin (রানে
    // or উইকেটে) when the recorded runs/wickets/overs support it.
    // It regenerates only when an outcome field actually changed,
    // so saving an unrelated edit never silently replaces text the
    // admin kept. Legacy matches (teams not linked) keep the
    // hand-written text field's value untouched.
    let resultText = mForm.result;
    if (
      linkedTeams &&
      (mForm.status === "completed" || mForm.status === "abandoned")
    ) {
      const orig =
        mEditing && mEditing !== "new"
          ? matches.find((m) => m.id === mEditing)
          : undefined;
      // v176 D4: entering or leaving the পরিত্যক্ত kind (only
      // possible in the declaration view) is an outcome change
      // even when winner/draw/scores are equal, so the stored
      // text switches between the draw text and NO_RESULT_TEXT
      // instead of going stale. Schedule-view saves never see
      // the kind, so their text behaviour is unchanged.
      const kindChanged =
        mView === "report" &&
        (orig?.result === NO_RESULT_TEXT) !== (mDecision === "no_result");
      const outcomeChanged =
        !orig ||
        kindChanged ||
        (orig.winner_team_id ?? "") !== effWinner ||
        orig.is_draw !== effDraw ||
        orig.our_score !== (mForm.our_score.trim() || null) ||
        orig.opponent_score !== (mForm.opponent_score.trim() || null) ||
        (orig.team_a_id ?? "") !== mForm.team_a_id ||
        (orig.team_b_id ?? "") !== mForm.team_b_id ||
        (orig.shootout_a ?? null) !== shootA ||
        (orig.shootout_b ?? null) !== shootB;
      if (mForm.status === "abandoned") {
        if (!orig || orig.status !== "abandoned") resultText = "ম্যাচ পরিত্যক্ত";
      } else if (outcomeChanged) {
        if (effWinner) {
          const name = teamById.get(effWinner)?.name ?? "একটি টিম";
          const a = parseScore(mForm.our_score);
          const b = parseScore(mForm.opponent_score);
          if (mForm.sport === "cricket") {
            const wkA = mForm.wickets_a === "" ? null : Number(mForm.wickets_a);
            const wkB = mForm.wickets_b === "" ? null : Number(mForm.wickets_b);
            const wIsA = effWinner === mForm.team_a_id;
            const wRuns = wIsA ? a : b;
            const lRuns = wIsA ? b : a;
            const wWkts = wIsA ? wkA : wkB;
            const wBalls = wIsA
              ? oversToBalls(mForm.overs_a)
              : oversToBalls(mForm.overs_b);
            if (wIsA && a !== null && b !== null && a > b) {
              resultText = `${name} ${bnNum(a - b)} রানে জয়`;
            } else if (
              wRuns !== null &&
              lRuns !== null &&
              wRuns > lRuns &&
              wWkts !== null &&
              wWkts < 10 &&
              (wBalls !== null || !wIsA)
            ) {
              resultText = `${name} ${bnNum(10 - wWkts)} উইকেটে জয়`;
            } else if (wRuns !== null && lRuns !== null && wRuns > lRuns) {
              resultText = `${name} ${bnNum(wRuns - lRuns)} রানে জয়`;
            } else {
              resultText = `${name} জিতেছে`;
            }
          } else {
            resultText =
              a !== null && b !== null
                ? `${name} ${bnNum(a)}-${bnNum(b)} গোলে জয়ী`
                : `${name} জিতেছে`;
            if (mDecision === "shootout" && shootA !== null && shootB !== null) {
              resultText += ` (পেনাল্টি শুটআউট ${bnNum(shootA)}-${bnNum(shootB)})`;
            }
          }
        } else if (effDraw) {
          resultText =
            mView === "report" && mDecision === "no_result"
              ? NO_RESULT_TEXT
              : "ম্যাচ ড্র হয়েছে";
        }
      }
    }
    const payload: MatchDraft = {
      ...mForm,
      // Sequential auto-round: a match CREATED in a tournament
      // saves the automatic ordinal round, whatever the (hidden)
      // manual field holds. If the live count has not arrived,
      // count the loaded list instead — same rule.
      round: autoRoundActive
        ? (autoRoundName ??
          ordinalRoundName(
            matches.filter((m) => m.tournament_id === mForm.tournament_id).length + 1,
          ))
        : mForm.round,
      winner_team_id: effWinner,
      is_draw: effDraw,
      result: resultText,
      match_date: mForm.match_date ? new Date(mForm.match_date).toISOString() : "",
    };
    const res = await saveMatch(mEditing === "new" ? null : mEditing, payload);
    setMSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const savedTournamentId = mForm.tournament_id;
    // Report model: after a report saves, the report page STAYS
    // open so the admin can add the player performances right
    // away; a schedule save closes the editor as before.
    const keepReportOpen = mView === "report" && mEditing !== null && mEditing !== "new";
    if (!keepReportOpen) setMEditing(null);
    setNotice(
      res.warning ??
        (keepReportOpen
          ? "বিজয়ী ঘোষণা সংরক্ষিত হয়েছে — ম্যাচটি সমাপ্ত। এবার নিচে প্লেয়ারদের Performance দিন।"
          : "ম্যাচ সংরক্ষিত হয়েছে।"),
    );
    if (savedTournamentId) void syncChampion(savedTournamentId);
  }

  // One prefill for both editor views (Report model, 2026-11-03).
  // The report view forces the draft status to "completed" —
  // declaring the result is what completes a match now; the
  // schedule view keeps the stored status untouched.
  function openMatch(m: Match, view: "schedule" | "report") {
    setMForm({
      sport: m.sport,
      tournament_id: m.tournament_id ?? "",
      opponent: m.opponent,
      match_date: toLocalInput(m.match_date),
      venue: m.venue ?? "",
      our_score: m.our_score ?? "",
      opponent_score: m.opponent_score ?? "",
      result: m.result ?? "",
      status: view === "report" ? "completed" : m.status,
      is_published: m.is_published,
      team_a_id: m.team_a_id ?? "",
      team_b_id: m.team_b_id ?? "",
      match_no: m.match_no ? String(m.match_no) : "",
      round: m.round ?? "",
      winner_team_id: m.winner_team_id ?? "",
      is_draw: m.is_draw ?? false,
      tiebreaker_note: m.tiebreaker_note ?? "",
      banner_url: m.banner_url ?? "",
      referee_name: m.referee_name ?? "",
      toss_winner_team_id: m.toss_winner_team_id ?? "",
      toss_decision: m.toss_decision ?? "",
      overs_a: ballsToOvers(m.team_a_balls),
      overs_b: ballsToOvers(m.team_b_balls),
      wickets_a: m.team_a_wickets == null ? "" : String(m.team_a_wickets),
      wickets_b: m.team_b_wickets == null ? "" : String(m.team_b_wickets),
      shootout_a: m.shootout_a == null ? "" : String(m.shootout_a),
      shootout_b: m.shootout_b == null ? "" : String(m.shootout_b),
      player_of_match_id: m.player_of_match_id ?? "",
    });
    setMDecision(view === "report" ? inferDecision(m) : "normal");
    setMEditing(m.id);
    setMView(view);
    setMResultConfirm(false);
    setMWinnerWarn(false);
    setError(null);
    if (view === "report") setPerfMatchId(null);
  }

  async function toggleMatchPublished(m: Match) {
    setError(null);
    const err = await setMatchPublished(m.id, !m.is_published);
    if (err) setError(err);
    else setNotice(m.is_published ? "ম্যাচটি অপ্রকাশিত করা হয়েছে।" : "ম্যাচটি প্রকাশিত হয়েছে।");
  }

  async function toggleTournamentPublished(t: Tournament) {
    setError(null);
    const err = await setTournamentPublished(t.id, !t.is_published);
    if (err) setError(err);
    else setNotice(t.is_published ? "টুর্নামেন্টটি অপ্রকাশিত করা হয়েছে।" : "টুর্নামেন্টটি প্রকাশিত হয়েছে।");
  }

  // Deletes (owner's order, 2026-11-02 — the master save/delete
  // rule applies here too now; the earlier no-delete decision
  // is reversed). Deleting a match also removes its player
  // performances (database cascade); deleting a tournament
  // keeps its matches, unlinked.
  const [confirmDeleteMatchId, setConfirmDeleteMatchId] = useState<string | null>(null);
  const [confirmDeleteTournamentId, setConfirmDeleteTournamentId] = useState<string | null>(null);

  // Tournament detail panels (team entries / points & bracket).
  const [teamsPanelId, setTeamsPanelId] = useState<string | null>(null);
  const [tablePanelId, setTablePanelId] = useState<string | null>(null);

  /** Quick-create a team from the team-entry panel (Teams system). */
  async function handleCreateTeam(sport: Sport, name: string): Promise<Team | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("teams")
      .insert({ sport, name: name.trim(), is_published: true })
      .select("id, sport, name, logo_url, is_published, display_order, created_at")
      .single();
    if (error || !data) {
      setError(error?.message ?? "নতুন টিম তৈরি করা যায়নি।");
      return null;
    }
    const team = data as Team;
    setTeams((prev) => [...prev, team]);
    return team;
  }

  async function handleDeleteMatch(m: Match) {
    setError(null);
    const err = await deleteMatch(m.id);
    setConfirmDeleteMatchId(null);
    if (mEditing === m.id) setMEditing(null);
    if (perfMatchId === m.id) setPerfMatchId(null);
    if (err) setError(err);
    else {
      setNotice("ম্যাচটি মুছে ফেলা হয়েছে — Database থেকেও মুছে গেছে।");
      if (m.tournament_id) void syncChampion(m.tournament_id);
    }
  }

  async function handleDeleteTournament(t: Tournament) {
    setError(null);
    const err = await deleteTournament(t.id);
    setConfirmDeleteTournamentId(null);
    if (tEditing === t.id) setTEditing(null);
    if (err) setError(err);
    else setNotice("টুর্নামেন্টটি মুছে ফেলা হয়েছে — এর ম্যাচগুলো টুর্নামেন্ট ছাড়া থেকে যাবে।");
  }

  if (!isConfigured) {
    return (
      <div>
        <h1 className="text-xl font-bold text-brand-dark">
          {isT ? "Tournaments" : isDeclare ? "বিজয়ী দল ঘোষণা" : "Matches"}
        </h1>
        <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm leading-relaxed text-neutral-700">
          Supabase এখনো সংযুক্ত হয়নি, তাই {isT ? "টুর্নামেন্টের" : "ম্যাচের"} আসল তথ্য এখানে দেখানো যাচ্ছে না —
          কোনো Demo {isT ? "টুর্নামেন্ট" : "ম্যাচ"} দেখানো হয়নি। Supabase Project তৈরি করে Migration 0001–0005 চালালেই এই
          পেজ থেকে {isDeclare ? "ম্যাচের স্কোর ও বিজয়ী দল ঘোষণা করা" : `${isT ? "টুর্নামেন্ট" : "ম্যাচ"} তৈরি, সম্পাদনা, প্রকাশ এবং মুছে ফেলা পরিচালনা করা`} যাবে।
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-brand-dark">
        {isT ? "Tournaments" : isDeclare ? "বিজয়ী দল ঘোষণা" : "Matches"}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
            {isT
              ? "টুর্নামেন্ট পরিচালনা করুন।"
              : isDeclare
                ? "খেলা শেষ হলে এখানে স্কোর ও বিজয়ী দল ঘোষণা করুন।"
                : "ম্যাচ পরিচালনা করুন।"}
          </p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand-light p-3 text-sm text-brand-dark" role="status">
          {notice}
        </div>
      )}
      {loading && <p className="mt-6 text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>}
      {loadError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {loadError}
        </div>
      )}

      {!loading && section === "tournaments" && (
        <>
          {/* ---------------- Tournaments ---------------- */}
          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-brand-dark">টুর্নামেন্ট</h2>
              <button
                type="button"
                onClick={() => {
                  setTForm(EMPTY_TOURNAMENT);
                  setTEditing("new");
                  setTEmail(false);
                  setError(null);
                }}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                + নতুন টুর্নামেন্ট
              </button>
            </div>

            {tEditing !== null && (
              <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="t-name">টুর্নামেন্টের নাম *</label>
                    <input
                      id="t-name"
                      className={inputCls}
                      value={tForm.name}
                      onChange={(e) => setTForm({ ...tForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-sport">খেলা</label>
                    <select
                      id="t-sport"
                      className={inputCls}
                      value={tForm.sport}
                      onChange={(e) => {
                        const nextSport = e.target.value as Sport;
                        if (tEditing === "new") {
                          const d = POINTS_DEFAULTS[nextSport];
                          setTForm({
                            ...tForm,
                            sport: nextSport,
                            points_win: d.win,
                            points_draw: d.draw,
                            points_loss: d.loss,
                          });
                        } else {
                          setTForm({ ...tForm, sport: nextSport });
                        }
                      }}
                    >
                      <option value="football">ফুটবল</option>
                      <option value="cricket">ক্রিকেট</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-season">মৌসুম (ঐচ্ছিক)</label>
                    <input
                      id="t-season"
                      inputMode="numeric"
                      className={inputCls}
                      value={tForm.season}
                      onChange={(e) => setTForm({ ...tForm, season: e.target.value })}
                      placeholder="যেমন: 2026"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-status">অবস্থা</label>
                    <select
                      id="t-status"
                      className={inputCls}
                      value={tForm.status}
                      onChange={(e) =>
                        setTForm({ ...tForm, status: e.target.value as Tournament["status"] })
                      }
                    >
                      {Object.entries(TOURNAMENT_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={tForm.is_published}
                      onChange={(e) => setTForm({ ...tForm, is_published: e.target.checked })}
                    />
                    Public Website-এ প্রকাশিত
                  </label>
                  <div className="self-end pb-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        id="t-email"
                        type="checkbox"
                        checked={tEmail}
                        onChange={(e) => setTEmail(e.target.checked)}
                      />
                      সাবস্ক্রাইবারদের ইমেইল পাঠান
                    </label>
                    <p className="mt-1 text-xs text-neutral-500">টুর্নামেন্ট প্রকাশিত থাকলেই পাঠানো হবে।</p>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-start">শুরুর তারিখ (ঐচ্ছিক)</label>
                    <input
                      id="t-start"
                      type="date"
                      className={inputCls}
                      value={tForm.start_date}
                      onChange={(e) => setTForm({ ...tForm, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-end">শেষ তারিখ (ঐচ্ছিক)</label>
                    <input
                      id="t-end"
                      type="date"
                      className={inputCls}
                      value={tForm.end_date}
                      onChange={(e) => setTForm({ ...tForm, end_date: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <PhotoUploadField
                      label="টুর্নামেন্টের ব্যানার (ঐচ্ছিক)"
                      pathPrefix="tournament-banner"
                      sizeHint="1600 × 900 পিক্সেল (অনুপাত 16:9)"
                      value={tForm.banner_url}
                      onChange={(url) => setTForm({ ...tForm, banner_url: url })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-organizer">আয়োজক সংগঠন (ঐচ্ছিক)</label>
                    <input
                      id="t-organizer"
                      className={inputCls}
                      value={tForm.organizer}
                      onChange={(e) => setTForm({ ...tForm, organizer: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-director">পরিচালক (ঐচ্ছিক)</label>
                    <input
                      id="t-director"
                      className={inputCls}
                      value={tForm.director}
                      onChange={(e) => setTForm({ ...tForm, director: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-director-phone">পরিচালকের ফোন (ঐচ্ছিক)</label>
                    <input
                      id="t-director-phone"
                      className={inputCls}
                      maxLength={20}
                      value={tForm.director_phone}
                      onChange={(e) => setTForm({ ...tForm, director_phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-venue">মাঠ / ভেন্যু (ঐচ্ছিক)</label>
                    <input
                      id="t-venue"
                      className={inputCls}
                      value={tForm.venue}
                      onChange={(e) => setTForm({ ...tForm, venue: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-format">টুর্নামেন্টের ধরন</label>
                    <select
                      id="t-format"
                      className={inputCls}
                      value={tForm.format}
                      onChange={(e) =>
                        setTForm({ ...tForm, format: e.target.value as TournamentDraft["format"] })
                      }
                    >
                      <option value="">— নির্ধারণ হয়নি —</option>
                      <option value="league">League / Round Robin (পয়েন্ট টেবিল)</option>
                      <option value="knockout">Knockout (বিজয়ী পরের রাউন্ডে)</option>
                      <option value="group_knockout">Group + Knockout (গ্রুপ পর্বের পর নকআউট)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t-team-count">কতটি টিম অংশ নেবে (ঐচ্ছিক)</label>
                    <input
                      id="t-team-count"
                      type="number"
                      min={2}
                      max={64}
                      className={inputCls}
                      value={tForm.team_count}
                      onChange={(e) => setTForm({ ...tForm, team_count: e.target.value })}
                      placeholder="যেমন: 8, 10, 16, 20"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="t-description">বিবরণ (ঐচ্ছিক)</label>
                    <textarea
                      id="t-description"
                      rows={3}
                      className={inputCls}
                      value={tForm.description}
                      onChange={(e) => setTForm({ ...tForm, description: e.target.value })}
                    />
                  </div>
                  {(tForm.format === "league" || tForm.format === "group_knockout") && (
                    <>
                      <div>
                        <label className={labelCls} htmlFor="t-pw">জিতলে পয়েন্ট</label>
                        <input
                          id="t-pw"
                          type="number"
                          min={0}
                          className={inputCls}
                          value={tForm.points_win}
                          onChange={(e) => setTForm({ ...tForm, points_win: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="t-pd">ড্র হলে পয়েন্ট</label>
                        <input
                          id="t-pd"
                          type="number"
                          min={0}
                          className={inputCls}
                          value={tForm.points_draw}
                          onChange={(e) => setTForm({ ...tForm, points_draw: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="t-pl">হারলে পয়েন্ট</label>
                        <input
                          id="t-pl"
                          type="number"
                          min={0}
                          className={inputCls}
                          value={tForm.points_loss}
                          onChange={(e) => setTForm({ ...tForm, points_loss: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className={labelCls} htmlFor="t-squad">প্রতি দলে প্লেয়ার (ঐচ্ছিক)</label>
                    <input
                      id="t-squad"
                      type="number"
                      min={1}
                      max={30}
                      className={inputCls}
                      value={tForm.squad_size}
                      onChange={(e) => setTForm({ ...tForm, squad_size: e.target.value })}
                      placeholder="যেমন: 15"
                    />
                  </div>
                  {tForm.sport === "football" && (
                    <div>
                      <label className={labelCls} htmlFor="t-minutes">ম্যাচের মিনিট (ঐচ্ছিক)</label>
                      <input
                        id="t-minutes"
                        type="number"
                        min={1}
                        max={300}
                        className={inputCls}
                        value={tForm.match_minutes}
                        onChange={(e) => setTForm({ ...tForm, match_minutes: e.target.value })}
                        placeholder="যেমন: 90"
                      />
                    </div>
                  )}
                  {tForm.sport === "cricket" && (
                    <>
                      <div>
                        <label className={labelCls} htmlFor="t-overs">ওভার (ঐচ্ছিক)</label>
                        <input
                          id="t-overs"
                          type="number"
                          min={1}
                          max={100}
                          className={inputCls}
                          value={tForm.cricket_overs}
                          onChange={(e) => setTForm({ ...tForm, cricket_overs: e.target.value })}
                          placeholder="যেমন: 20"
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="t-ball">বলের ধরন (ঐচ্ছিক)</label>
                        <input
                          id="t-ball"
                          className={inputCls}
                          maxLength={60}
                          value={tForm.ball_type}
                          onChange={(e) => setTForm({ ...tForm, ball_type: e.target.value })}
                          placeholder="যেমন: টেনিস বল / ডিউস বল"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className={labelCls} htmlFor="t-runner-up">রানার্স-আপ টিম (ঐচ্ছিক)</label>
                    <select
                      id="t-runner-up"
                      className={inputCls}
                      value={tForm.runner_up_team_id}
                      onChange={(e) => setTForm({ ...tForm, runner_up_team_id: e.target.value })}
                    >
                      <option value="">— বাছুন —</option>
                      {tRunnerOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {tImpactConfirm && (
                  <div className="mt-4 rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-neutral-800" role="alert">
                    এই টুর্নামেন্টে ইতিমধ্যে{" "}
                    {bnNum(matches.filter((m) => m.tournament_id === tEditing).length)}টি ম্যাচ আছে।
                    ধরন বা টিমসংখ্যা বদলালে কোনো ম্যাচ বা ফলাফল মুছে যাবে না — তবে পয়েন্ট টেবিল /
                    রাউন্ডের হিসাব নতুন নিয়মে দেখাবে। তবুও সংরক্ষণ করবেন?
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={tSaving}
                        onClick={() => void handleSaveTournament(true)}
                        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                      >
                        হ্যাঁ, তবুও সংরক্ষণ করুন
                      </button>
                      <button
                        type="button"
                        onClick={() => setTImpactConfirm(false)}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        না
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={tSaving}
                    onClick={() => void handleSaveTournament()}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {tSaving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTEditing(null)}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    বাতিল
                  </button>
                </div>
              </div>
            )}

            {tournaments.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                এখনো কোনো টুর্নামেন্ট তৈরি হয়নি।
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
                {tournaments.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-800">{t.name}</span>
                      <span className="block text-xs text-neutral-500">
                        {SPORT_LABELS[t.sport]}
                        {t.season ? ` · মৌসুম ${t.season}` : ""} · {TOURNAMENT_STATUS_LABELS[t.status]}
                        {t.format ? ` · ${FORMAT_LABELS[t.format] ?? t.format}` : ""}
                        {t.team_count ? ` · ${bnNum(t.team_count)} টিম` : ""}
                        {` · মোট ম্যাচ: ${bnNum(matches.filter((m) => m.tournament_id === t.id).length)}`}
                      </span>
                      {championOf(t, teams, matches) && (
                        <span className="block text-xs font-semibold text-gold">
                          চ্যাম্পিয়ন: {championOf(t, teams, matches)?.name}
                        </span>
                      )}
                    </span>
                    <PublishChip published={t.is_published} />
                    <button
                      type="button"
                      onClick={() => {
                        setTeamsPanelId(teamsPanelId === t.id ? null : t.id);
                        setTablePanelId(null);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        teamsPanelId === t.id
                          ? "border-gold bg-gold/15 text-brand-dark"
                          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      টিম
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTablePanelId(tablePanelId === t.id ? null : t.id);
                        setTeamsPanelId(null);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        tablePanelId === t.id
                          ? "border-gold bg-gold/15 text-brand-dark"
                          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      {t.format === "league" || t.format === "group_knockout"
                        ? "পয়েন্ট টেবিল"
                        : "ব্র্যাকেট"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTournamentPrint(t)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      প্রিন্ট করুন
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTForm({
                          name: t.name,
                          sport: t.sport,
                          season: t.season ?? "",
                          status: t.status,
                          is_published: t.is_published,
                          banner_url: t.banner_url ?? "",
                          organizer: t.organizer ?? "",
                          director: t.director ?? "",
                          venue: t.venue ?? "",
                          description: t.description ?? "",
                          format: t.format ?? "",
                          team_count: t.team_count ? String(t.team_count) : "",
                          points_win: String(t.points_win ?? 3),
                          points_draw: String(t.points_draw ?? 1),
                          points_loss: String(t.points_loss ?? 0),
                          start_date: t.start_date ?? "",
                          end_date: t.end_date ?? "",
                          director_phone: t.director_phone ?? "",
                          squad_size:
                            t.squad_size != null ? String(t.squad_size) : "",
                          match_minutes:
                            t.match_minutes != null ? String(t.match_minutes) : "",
                          cricket_overs:
                            t.cricket_overs != null ? String(t.cricket_overs) : "",
                          ball_type: t.ball_type ?? "",
                          runner_up_team_id: t.runner_up_team_id ?? "",
                        });
                        setTEditing(t.id);
                        setTEmail(false);
                        setTImpactConfirm(false);
                        setError(null);
                      }}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      সম্পাদনা
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleTournamentPublished(t)}
                      className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white"
                    >
                      {t.is_published ? "Unpublish" : "Publish"}
                    </button>
                    {canDelete &&
                      (confirmDeleteTournamentId === t.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTournament(t)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                          >
                            হ্যাঁ, মুছুন
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTournamentId(null)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                          >
                            না
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTournamentId(t.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                        >
                          মুছে ফেলুন
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
            {!canDelete && tournaments.length > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                টুর্নামেন্ট মুছে ফেলার অনুমতি শুধু Admin-এর আছে।
              </p>
            )}

            {teamsPanelId &&
              (() => {
                const t = tournamentById.get(teamsPanelId);
                if (!t) return null;
                return (
                  <TournamentTeamsPanel
                    key={t.id}
                    tournament={t}
                    allTeams={teams}
                    fetchTournamentTeams={fetchTournamentTeams}
                    setTournamentTeams={setTournamentTeams}
                    onCreateTeam={handleCreateTeam}
                    onPrint={() => setTournamentPrint(t)}
                    onMessage={(kind, msg) => (kind === "error" ? setError(msg) : setNotice(msg))}
                  />
                );
              })()}

            {tablePanelId &&
              (() => {
                const t = tournamentById.get(tablePanelId);
                if (!t) return null;
                return (
                  <TournamentTablePanel
                    key={t.id}
                    tournament={t}
                    allTeams={teams}
                    matches={matches}
                    fetchTournamentTeams={fetchTournamentTeams}
                    createMatchesBulk={createMatchesBulk}
                    onPrint={() => setTournamentPrint(t)}
                    onMessage={(kind, msg) => (kind === "error" ? setError(msg) : setNotice(msg))}
                  />
                );
              })()}

            {tournamentPrint && (
              <TeamRegistrationPrint
                mode="tournament"
                org={{
                  nameBn: settings.nameBn,
                  nameEn: settings.nameEn,
                  logo: settings.logoPath,
                  address: settings.address,
                  email: settings.email,
                  phone: settings.phoneDisplay,
                  tagline: settings.tagline,
                }}
                teamNameById={new Map(teams.map((tm) => [tm.id, tm.name]))}
                options={[{ tournament: tournamentPrint, code: null }]}
                initialTournamentId={tournamentPrint.id}
                onClose={() => setTournamentPrint(null)}
              />
            )}
          </section>
        </>
      )}

      {!loading && (section === "matches" || section === "declare") && (
        <>
          {/* ---------------- Matches / Winner declaration ---------------- */}
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-brand-dark">
                {isDeclare ? "ম্যাচের তালিকা — ঘোষণার জন্য বাছুন" : "ম্যাচ"}
              </h2>
              {!isDeclare && (
              <button
                type="button"
                onClick={() => {
                  setMForm(EMPTY_MATCH);
                  setMEditing("new");
                  setMView("schedule");
                  setError(null);
                }}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                + নতুন ম্যাচ
              </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="search"
                aria-label="প্রতিপক্ষ খুঁজুন"
                placeholder="প্রতিপক্ষের নামে খুঁজুন…"
                className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="খেলা অনুযায়ী ছাঁকুন"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={sportFilter}
                onChange={(e) => setSportFilter(e.target.value as "all" | Sport)}
              >
                <option value="all">সব খেলা</option>
                <option value="football">ফুটবল</option>
                <option value="cricket">ক্রিকেট</option>
              </select>
              <select
                aria-label="অবস্থা অনুযায়ী ছাঁকুন"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | Match["status"])}
              >
                <option value="all">সব অবস্থা</option>
                <option value="upcoming">আসন্ন</option>
                <option value="live">চলমান</option>
                <option value="completed">সমাপ্ত</option>
                <option value="postponed">স্থগিত</option>
                <option value="rescheduled">পুনর্নির্ধারিত</option>
                <option value="abandoned">পরিত্যক্ত</option>
              </select>
            </div>

            {mEditing !== null && (
              <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4">
                {mView === "report" && (
                  <div className="mb-3">
                    <h3 className="text-base font-bold text-brand-dark">
                      বিজয়ী দল ঘোষণা
                    </h3>
                    {mOrig && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {mOrig.team_a_id && teamById.get(mOrig.team_a_id)
                          ? `${teamById.get(mOrig.team_a_id)?.name} বনাম ${teamById.get(mOrig.team_b_id ?? "")?.name ?? mOrig.opponent}`
                          : `বনাম ${mOrig.opponent}`}
                        {mOrig.tournament_id
                          ? ` · ${tournamentById.get(mOrig.tournament_id)?.name ?? "টুর্নামেন্ট"}`
                          : ""}
                        {mOrig.round ? ` · ${mOrig.round}` : ""}
                        {` · ${formatDate(mOrig.match_date)}`}
                        {mOrig.venue ? ` · ${mOrig.venue}` : ""}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-neutral-500">স্কোর ও ফলাফল দিয়ে সংরক্ষণ করলে ম্যাচটি &quot;সমাপ্ত&quot; ঘোষণা হবে।</p>
                  </div>
                )}
                {mView === "report" && orphanTeamLink && (
                  <div
                    id="m-orphan-warning"
                    className="mb-3 rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-neutral-800"
                    role="alert"
                  >
                    এই ম্যাচের একটি টিম মুছে গেছে — বিজয়ী ঘোষণা করা যাবে
                    না। আগে ম্যাচ পেজ থেকে ম্যাচটি সম্পাদনা করে টিম ঠিক
                    করুন।
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {mView === "schedule" && (
                    <>
                  <div>
                    <label className={labelCls} htmlFor="m-sport">খেলা</label>
                    <select
                      id="m-sport"
                      className={inputCls}
                      value={mForm.sport}
                      onChange={(e) =>
                        setMForm({
                          ...mForm,
                          sport: e.target.value as Sport,
                          tournament_id: "",
                          team_a_id: "",
                          team_b_id: "",
                          winner_team_id: "",
                        })
                      }
                    >
                      <option value="football">ফুটবল</option>
                      <option value="cricket">ক্রিকেট</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      {SPORT_LABELS[mForm.sport]} — মোট {bnNum(formSportMatchCounts.total)}টি ম্যাচ ·
                      চলমান {bnNum(formSportMatchCounts.live)}টি
                    </p>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m-team-a">টিম A (ঐচ্ছিক)</label>
                    <select
                      id="m-team-a"
                      className={inputCls}
                      value={mForm.team_a_id}
                      onChange={(e) => setMForm({ ...mForm, team_a_id: e.target.value })}
                    >
                      <option value="">— টিম বাছুন —</option>
                      {formTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {matchTeamLabel(team, mEntryCodes)}
                        </option>
                      ))}
                    </select>
                    {entryCodeSupported && (
                      <TeamIdBox
                        id="m-team-a-id"
                        teamId={mForm.team_a_id}
                        tournamentId={mForm.tournament_id}
                        code={mForm.team_a_id ? mEntryCodes.get(mForm.team_a_id) : undefined}
                      />
                    )}
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m-team-b">টিম B (ঐচ্ছিক)</label>
                    <select
                      id="m-team-b"
                      className={inputCls}
                      value={mForm.team_b_id}
                      onChange={(e) => {
                        const team = formTeams.find((t) => t.id === e.target.value);
                        setMForm({
                          ...mForm,
                          team_b_id: e.target.value,
                          opponent: team ? team.name : mForm.opponent,
                        });
                      }}
                    >
                      <option value="">— টিম বাছুন —</option>
                      {formTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {matchTeamLabel(team, mEntryCodes)}
                        </option>
                      ))}
                    </select>
                    {entryCodeSupported && (
                      <TeamIdBox
                        id="m-team-b-id"
                        teamId={mForm.team_b_id}
                        tournamentId={mForm.tournament_id}
                        code={mForm.team_b_id ? mEntryCodes.get(mForm.team_b_id) : undefined}
                      />
                    )}
                                      </div>
                  <div>
                    <label className={labelCls} htmlFor="m-opponent">প্রতিপক্ষ *</label>
                    {formTeams.length > 0 && (
                      <select
                        aria-label="তালিকা থেকে প্রতিপক্ষ বাছুন"
                        className={`${inputCls} mb-2`}
                        value={
                          formTeams.some((team) => team.name === mForm.opponent)
                            ? mForm.opponent
                            : ""
                        }
                        onChange={(e) => {
                          if (e.target.value) {
                            setMForm({ ...mForm, opponent: e.target.value });
                          }
                        }}
                      >
                        <option value="">— টিম থেকে বাছুন —</option>
                        {formTeams.map((team) => (
                          <option key={team.id} value={team.name}>
                            {teamOptionLabel(team)}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      id="m-opponent"
                      className={inputCls}
                      value={mForm.opponent}
                      onChange={(e) => setMForm({ ...mForm, opponent: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m-tournament">টুর্নামেন্ট (ঐচ্ছিক)</label>
                    <select
                      id="m-tournament"
                      className={inputCls}
                      value={mForm.tournament_id}
                      onChange={(e) => setMForm({ ...mForm, tournament_id: e.target.value })}
                    >
                      <option value="">কোনো টুর্নামেন্ট নয়</option>
                      {formTournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.season ? ` (${t.season})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      শুধু {SPORT_LABELS[mForm.sport]} টুর্নামেন্ট দেখানো হচ্ছে।
                    </p>
                    {!mForm.tournament_id && (
                      <p className="mt-1 text-xs font-medium text-brand-dark">এই ম্যাচটি স্বতন্ত্র ম্যাচ হিসেবে সংরক্ষিত হবে।</p>
                    )}
                    {knockoutEliminated.size > 0 && (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        নকআউটে বাদ পড়া টিম এই টুর্নামেন্টের টিম-তালিকায় নেই:{" "}
                        {[...knockoutEliminated]
                          .map((id) => teamById.get(id)?.name ?? "")
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m-no">ম্যাচ নম্বর (ঐচ্ছিক)</label>
                    <input
                      id="m-no"
                      type="number"
                      min={1}
                      className={inputCls}
                      value={mForm.match_no}
                      onChange={(e) => setMForm({ ...mForm, match_no: e.target.value })}
                      placeholder="যেমন: 1, 2, 3"
                    />
                                      </div>
                  {autoRoundActive ? (
                    <div>
                      <span className={labelCls}>ম্যাচের ধাপ / রাউন্ড (স্বয়ংক্রিয়)</span>
                      <p
                        id="m-round-auto"
                        className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700"
                      >
                        {autoRoundName ?? "হিসাব হচ্ছে…"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">রাউন্ড ম্যাচের সংখ্যা অনুযায়ী নিজে থেকে নির্ধারিত হয়।</p>
                    </div>
                  ) : (
                    <div>
                      <label className={labelCls} htmlFor="m-round">ম্যাচের ধাপ / রাউন্ড (ঐচ্ছিক)</label>
                      <select
                        id="m-round"
                        className={inputCls}
                        value={mForm.round}
                        onChange={(e) => setMForm({ ...mForm, round: e.target.value })}
                      >
                        <option value="">— ধাপ বাছুন —</option>
                        {ROUND_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {mForm.round && !ROUND_OPTIONS.includes(mForm.round) && (
                          <option value={mForm.round}>{mForm.round}</option>
                        )}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={labelCls} htmlFor="m-date">তারিখ ও সময় (ঐচ্ছিক)</label>
                    <input
                      id="m-date"
                      type="datetime-local"
                      className={inputCls}
                      value={mForm.match_date}
                      onChange={(e) => setMForm({ ...mForm, match_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m-venue">ভেন্যু / মাঠ (ঐচ্ছিক)</label>
                    <input
                      id="m-venue"
                      className={inputCls}
                      value={mForm.venue}
                      onChange={(e) => setMForm({ ...mForm, venue: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m-referee">রেফারি / আম্পায়ার (ঐচ্ছিক)</label>
                    <input
                      id="m-referee"
                      className={inputCls}
                      maxLength={120}
                      value={mForm.referee_name}
                      onChange={(e) => setMForm({ ...mForm, referee_name: e.target.value })}
                    />
                  </div>
                    </>
                  )}
                  {mView === "report" ? (
                    <div>
                      <span className={labelCls}>অবস্থা</span>
                      <p className="rounded-lg bg-brand-light px-3 py-2 text-sm font-semibold text-brand-dark">
                        সমাপ্ত — এই ঘোষণা সংরক্ষণ হলেই ম্যাচটি সমাপ্ত হিসেবে ঘোষণা হবে
                      </p>
                    </div>
                  ) : mOrig?.status === "completed" ? (
                    <div>
                      <span className={labelCls}>অবস্থা</span>
                      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-600">
                        সমাপ্ত — ফলাফল বদলাতে &quot;বিজয়ী দল ঘোষণা&quot; পেজ ব্যবহার করুন
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className={labelCls} htmlFor="m-status">অবস্থা</label>
                      <select
                        id="m-status"
                        className={inputCls}
                        value={mForm.status}
                        onChange={(e) => setMForm({ ...mForm, status: e.target.value as Match["status"] })}
                      >
                        {Object.entries(MATCH_STATUS_LABELS)
                          .filter(([value]) => value !== "completed")
                          .map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                      </select>
                      <p className="mt-1 text-xs text-neutral-500">ফলাফল &quot;বিজয়ী দল ঘোষণা&quot; পেজে ঘোষণা করুন।</p>
                    </div>
                  )}
                  {mView === "report" && (
                    <>
                  <div>
                    <label className={labelCls} htmlFor="m-our-score">
                      {mForm.team_a_id
                        ? `${teamById.get(mForm.team_a_id)?.name ?? "টিম A"}-এর ${mForm.sport === "cricket" ? "রান/উইকেট" : "গোল"}`
                        : mForm.sport === "cricket"
                          ? "আমাদের রান/উইকেট"
                          : "আমাদের গোল"}
                    </label>
                    <input
                      id="m-our-score"
                      className={inputCls}
                      value={mForm.our_score}
                      onChange={(e) => setMForm({ ...mForm, our_score: e.target.value })}
                      placeholder={mForm.sport === "cricket" ? "যেমন: 245/8" : "যেমন: 2"}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="m-opp-score">
                      {mForm.team_b_id
                        ? `${teamById.get(mForm.team_b_id)?.name ?? "টিম B"}-এর ${mForm.sport === "cricket" ? "রান/উইকেট" : "গোল"}`
                        : mForm.sport === "cricket"
                          ? "প্রতিপক্ষের রান/উইকেট"
                          : "প্রতিপক্ষের গোল"}
                    </label>
                    <input
                      id="m-opp-score"
                      className={inputCls}
                      value={mForm.opponent_score}
                      onChange={(e) => setMForm({ ...mForm, opponent_score: e.target.value })}
                      placeholder={mForm.sport === "cricket" ? "যেমন: 180/10" : "যেমন: 1"}
                    />
                  </div>
                  {mForm.sport === "cricket" && (
                    <>
                      <div>
                        <label className={labelCls} htmlFor="m-wk-a">
                          {mForm.team_a_id
                            ? `${teamById.get(mForm.team_a_id)?.name ?? "টিম A"}-এর উইকেট (ঐচ্ছিক)`
                            : "আমাদের উইকেট (ঐচ্ছিক)"}
                        </label>
                        <input
                          id="m-wk-a"
                          type="number"
                          min={0}
                          max={10}
                          className={inputCls}
                          value={mForm.wickets_a}
                          onChange={(e) => setMForm({ ...mForm, wickets_a: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="m-wk-b">
                          {mForm.team_b_id
                            ? `${teamById.get(mForm.team_b_id)?.name ?? "টিম B"}-এর উইকেট (ঐচ্ছিক)`
                            : "প্রতিপক্ষের উইকেট (ঐচ্ছিক)"}
                        </label>
                        <input
                          id="m-wk-b"
                          type="number"
                          min={0}
                          max={10}
                          className={inputCls}
                          value={mForm.wickets_b}
                          onChange={(e) => setMForm({ ...mForm, wickets_b: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="m-overs-a">
                          {mForm.team_a_id
                            ? `${teamById.get(mForm.team_a_id)?.name ?? "টিম A"}-এর ওভার (ঐচ্ছিক)`
                            : "আমাদের ওভার (ঐচ্ছিক)"}
                        </label>
                        <input
                          id="m-overs-a"
                          className={inputCls}
                          value={mForm.overs_a}
                          onChange={(e) => setMForm({ ...mForm, overs_a: e.target.value })}
                          placeholder="যেমন: 19.4"
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="m-overs-b">
                          {mForm.team_b_id
                            ? `${teamById.get(mForm.team_b_id)?.name ?? "টিম B"}-এর ওভার (ঐচ্ছিক)`
                            : "প্রতিপক্ষের ওভার (ঐচ্ছিক)"}
                        </label>
                        <input
                          id="m-overs-b"
                          className={inputCls}
                          value={mForm.overs_b}
                          onChange={(e) => setMForm({ ...mForm, overs_b: e.target.value })}
                          placeholder="যেমন: 20"
                        />
                      </div>
                      {mForm.team_a_id && mForm.team_b_id && (
                        <>
                          <div>
                            <label className={labelCls} htmlFor="m-toss-winner">টস জয়ী টিম (ঐচ্ছিক)</label>
                            <select
                              id="m-toss-winner"
                              className={inputCls}
                              value={mForm.toss_winner_team_id}
                              onChange={(e) => setMForm({ ...mForm, toss_winner_team_id: e.target.value })}
                            >
                              <option value="">— বাছুন —</option>
                              <option value={mForm.team_a_id}>
                                {teamById.get(mForm.team_a_id)?.name ?? "টিম A"}
                              </option>
                              <option value={mForm.team_b_id}>
                                {teamById.get(mForm.team_b_id)?.name ?? "টিম B"}
                              </option>
                            </select>
                          </div>
                          <div>
                            <label className={labelCls} htmlFor="m-toss-decision">টসের সিদ্ধান্ত (ঐচ্ছিক)</label>
                            <select
                              id="m-toss-decision"
                              className={inputCls}
                              value={mForm.toss_decision}
                              onChange={(e) => setMForm({ ...mForm, toss_decision: e.target.value })}
                            >
                              <option value="">— বাছুন —</option>
                              <option value="bat">ব্যাটিং প্রথমে</option>
                              <option value="field">বোলিং (ফিল্ডিং) প্রথমে</option>
                            </select>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {mForm.team_a_id && mForm.team_b_id && (
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="m-decision">জয়ের ধরন</label>
                      <select
                        id="m-decision"
                        className={inputCls}
                        value={mDecision}
                        onChange={(e) => setMDecision(e.target.value as DecisionKind)}
                      >
                        <option value="normal">স্বাভাবিক (স্কোর অনুযায়ী)</option>
                        <option value="shootout">পেনাল্টি শুটআউট</option>
                        <option value="super_over">সুপার ওভার</option>
                        <option value="walkover">ওয়াকওভার</option>
                        {mForm.sport === "cricket" && (
                          <option value="no_result">পরিত্যক্ত (ফলাফল হয়নি)</option>
                        )}
                      </select>
                      {mDecision === "normal" && (
                        <p className="mt-1 text-xs font-medium text-brand-dark">স্কোর থেকেই বিজয়ী ঠিক হবে।</p>
                      )}
                    </div>
                  )}
                  {mDecision === "shootout" && mForm.team_a_id && mForm.team_b_id && (
                    <>
                      <div>
                        <label className={labelCls} htmlFor="m-shootout-a">
                          {teamById.get(mForm.team_a_id)?.name ?? "টিম A"}-এর শুটআউট গোল
                        </label>
                        <input
                          id="m-shootout-a"
                          type="number"
                          min={0}
                          className={inputCls}
                          value={mForm.shootout_a}
                          onChange={(e) => setMForm({ ...mForm, shootout_a: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="m-shootout-b">
                          {teamById.get(mForm.team_b_id)?.name ?? "টিম B"}-এর শুটআউট গোল
                        </label>
                        <input
                          id="m-shootout-b"
                          type="number"
                          min={0}
                          className={inputCls}
                          value={mForm.shootout_b}
                          onChange={(e) => setMForm({ ...mForm, shootout_b: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  {mForm.team_a_id && mForm.team_b_id && (
                    <div className="sm:col-span-2">
                      <span className={labelCls}>
                        {mDecision === "super_over" || mDecision === "walkover"
                          ? "ফলাফল — বিজয়ী দলে টিক দিন"
                          : "ফলাফল"}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          id="m-winner-a"
                          disabled={mDecision === "normal" || mDecision === "shootout" || mDecision === "no_result"}
                          aria-pressed={shownWinnerId === mForm.team_a_id}
                          onClick={() =>
                            setMForm(
                              mForm.winner_team_id === mForm.team_a_id
                                ? { ...mForm, winner_team_id: "" }
                                : { ...mForm, winner_team_id: mForm.team_a_id, is_draw: false },
                            )
                          }
                          className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                            shownWinnerId === mForm.team_a_id
                              ? "bg-brand text-white"
                              : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                          }`}
                        >
                          {shownWinnerId === mForm.team_a_id ? "✓ " : ""}
                          {teamById.get(mForm.team_a_id)?.name ?? "টিম A"} বিজয়ী
                        </button>
                        <button
                          type="button"
                          id="m-winner-b"
                          disabled={mDecision === "normal" || mDecision === "shootout" || mDecision === "no_result"}
                          aria-pressed={shownWinnerId === mForm.team_b_id}
                          onClick={() =>
                            setMForm(
                              mForm.winner_team_id === mForm.team_b_id
                                ? { ...mForm, winner_team_id: "" }
                                : { ...mForm, winner_team_id: mForm.team_b_id, is_draw: false },
                            )
                          }
                          className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                            shownWinnerId === mForm.team_b_id
                              ? "bg-brand text-white"
                              : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                          }`}
                        >
                          {shownWinnerId === mForm.team_b_id ? "✓ " : ""}
                          {teamById.get(mForm.team_b_id)?.name ?? "টিম B"} বিজয়ী
                        </button>
                        <button
                          type="button"
                          id="m-draw-tick"
                          disabled={mDecision === "normal" || mDecision === "shootout" || mDecision === "no_result"}
                          aria-pressed={shownDraw}
                          onClick={() =>
                            setMForm(
                              mForm.is_draw && !mForm.winner_team_id
                                ? { ...mForm, is_draw: false }
                                : { ...mForm, is_draw: true, winner_team_id: "" },
                            )
                          }
                          className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                            shownDraw
                              ? "bg-brand text-white"
                              : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                          }`}
                        >
                          {shownDraw ? "✓ " : ""}ম্যাচ ড্র হয়েছে
                        </button>
                      </div>
                      {previewLine && (
                        <p id="m-winner-preview" className="mt-2 text-sm font-semibold text-brand-dark">
                          {previewLine}
                        </p>
                      )}
                      {mDecision === "normal" ? (
                        <p className="mt-1 text-xs text-neutral-500">স্কোর থেকেই বিজয়ী ঠিক হবে।</p>
                      ) : mDecision === "shootout" ? (
                        <p className="mt-1 text-xs text-neutral-500">
                          শুটআউটের স্কোর থেকেই বিজয়ী ঠিক হবে।
                        </p>
                      ) : mDecision === "no_result" ? (
                        <p className="mt-1 text-xs text-neutral-500">বিজয়ী নেই — দুই দলই ড্র পয়েন্ট পাবে।</p>
                      ) : (
                        <p className="mt-1 text-xs text-neutral-500">বিজয়ী দলে টিক দিন।</p>
                      )}
                    </div>
                  )}
                  {!(mForm.team_a_id && mForm.team_b_id) && (
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="m-result">ফলাফল (ঐচ্ছিক)</label>
                      <input
                        id="m-result"
                        className={inputCls}
                        value={mForm.result}
                        onChange={(e) => setMForm({ ...mForm, result: e.target.value })}
                        placeholder="যেমন: আমরা ২-১ গোলে জয়ী"
                      />
                    </div>
                  )}
                  <div>
                    <label className={labelCls} htmlFor="m-pom">ম্যাচসেরা (ঐচ্ছিক)</label>
                    <select
                      id="m-pom"
                      className={inputCls}
                      value={mForm.player_of_match_id}
                      onChange={(e) => setMForm({ ...mForm, player_of_match_id: e.target.value })}
                    >
                      <option value="">— বাছুন —</option>
                      {allPlayers
                        .filter((p) => p.sport === mForm.sport && p.status === "published")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.team_id && teamById.get(p.team_id)
                              ? ` (${teamById.get(p.team_id)?.name})`
                              : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                    </>
                  )}
                  {mView === "schedule" && (
                    <div className="sm:col-span-2">
                      <PhotoUploadField
                        label="ম্যাচের ব্যানার (ঐচ্ছিক)"
                        value={mForm.banner_url}
                        onChange={(url) => setMForm({ ...mForm, banner_url: url })}
                        pathPrefix="match-banner"
                        sizeHint="1600 × 900 পিক্সেল (অনুপাত 16:9)"
                      />
                    </div>
                  )}
                  {mView === "report" &&
                    mForm.status === "completed" &&
                    (mDecision === "super_over" ||
                      mDecision === "walkover" ||
                      mDecision === "shootout" ||
                      mForm.is_draw ||
                      mForm.tiebreaker_note ||
                      (mForm.winner_team_id &&
                        parseScore(mForm.our_score) !== null &&
                        parseScore(mForm.our_score) ===
                          parseScore(mForm.opponent_score))) && (
                      <div className="sm:col-span-2">
                        <label className={labelCls} htmlFor="m-tie">
                          {mDecision === "super_over"
                            ? "সুপার ওভারের নোট (ঐচ্ছিক)"
                            : mDecision === "walkover"
                              ? "ওয়াকওভারের নোট (ঐচ্ছিক)"
                              : mDecision === "shootout"
                                ? "শুটআউটের নোট (ঐচ্ছিক)"
                                : "টাইব্রেকার / অতিরিক্ত সময় / রিপ্লের নোট (ঐচ্ছিক)"}
                        </label>
                        <input
                          id="m-tie"
                          className={inputCls}
                          value={mForm.tiebreaker_note}
                          onChange={(e) => setMForm({ ...mForm, tiebreaker_note: e.target.value })}
                          placeholder="যেমন: টাইব্রেকারে ৪-২ গোলে জয়ী / রিপ্লে ম্যাচ হবে ২০ তারিখ"
                        />
                      </div>
                    )}
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={mForm.is_published}
                      onChange={(e) => setMForm({ ...mForm, is_published: e.target.checked })}
                    />
                    Public Website-এ প্রকাশিত
                  </label>
                </div>
                {(mResultConfirm || mWinnerWarn) && (
                  <div className="mt-4 rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-neutral-800" role="alert">
                    {mResultConfirm && (
                      <>
                        এই ম্যাচের ফলাফল ইতিমধ্যে Public Website-এ প্রকাশিত। ফলাফল বদলালে পয়েন্ট
                        টেবিল / ব্র্যাকেট / চ্যাম্পিয়নও বদলে যাবে এবং পরিবর্তনটি Audit Log-এ
                        ইতিহাস হিসেবে থেকে যাবে। তবুও সংরক্ষণ করবেন?
                      </>
                    )}
                    {resultImpact && (
                      <span className="mt-2 block font-semibold">
                        সতর্কতা: এই ম্যাচের বর্তমান বিজয়ী ({resultImpact.winnerName}) পরের
                        রাউন্ডে ইতিমধ্যে যুক্ত আছেন —{" "}
                        {resultImpact.affected
                          .map(
                            (x) =>
                              `ম্যাচ ${x.match_no ? bnNum(x.match_no) : "—"} (${x.round ?? "রাউন্ড উল্লেখ নেই"})`,
                          )
                          .join(", ")}
                        । ফলাফল বদলালে সেই ম্যাচের টিম অসঙ্গত হয়ে যাবে — সংরক্ষণের পর সেই
                        ম্যাচটি যাচাই করে ঠিক করুন।
                      </span>
                    )}
                    {mWinnerWarn &&
                      (() => {
                        const issue = winnerIssue(
                          mForm,
                          mForm.winner_team_id,
                          mForm.is_draw,
                        );
                        if (!issue) return null;
                        const chosenName =
                          teamById.get(mForm.winner_team_id)?.name ?? "বাছাই করা টিম";
                        const impliedName =
                          (issue.impliedId &&
                            teamById.get(issue.impliedId)?.name) ||
                          "অন্য টিম";
                        return (
                          <span className="mt-2 block font-semibold">
                            {mForm.is_draw && !mForm.winner_team_id ? (
                              <>
                                ফলাফল সতর্কতা: ফলাফলে "ম্যাচ ড্র হয়েছে" টিক দেওয়া
                                আছে, কিন্তু স্কোর ({bnNum(issue.a)} : {bnNum(issue.b)})
                                অনুযায়ী বিজয়ী হওয়ার কথা {impliedName}। স্কোর ঠিক
                                থাকলে বিজয়ী দলে টিক দিন; স্কোর ভুল হলে "না"
                                চেপে ফিরে গিয়ে ঠিক করুন।
                              </>
                            ) : (
                              <>
                                ফলাফল সতর্কতা: স্কোর ({bnNum(issue.a)} : {bnNum(issue.b)})
                                অনুযায়ী বিজয়ী হওয়ার কথা {impliedName}, কিন্তু
                                বিজয়ী টিক দেওয়া আছে {chosenName}-এর পাশে। টাইব্রেকারে
                                জিতলে স্কোর সমান থাকার কথা — স্কোর ভুল হলে "না" চেপে
                                ফিরে গিয়ে ঠিক করুন।
                              </>
                            )}
                          </span>
                        );
                      })()}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={mSaving}
                        onClick={() => void handleSaveMatch(true)}
                        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                      >
                        হ্যাঁ, তবুও সংরক্ষণ করুন
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMResultConfirm(false);
                          setMWinnerWarn(false);
                        }}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        না
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={mSaving}
                    onClick={() => void handleSaveMatch()}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {mSaving
                      ? "সংরক্ষণ হচ্ছে…"
                      : mView === "report"
                        ? "ঘোষণা সংরক্ষণ করুন"
                        : "সংরক্ষণ করুন"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMEditing(null);
                      setMView("schedule");
                    }}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    বাতিল
                  </button>
                </div>
              </div>
            )}

            {mView === "report" && mOrig && (
              <div className="mt-4">
                <h3 className="text-base font-bold text-brand-dark">
                  প্লেয়ারদের Performance — গোল, কার্ড, রান, উইকেট
                </h3>
                <PerformancePanel key={mOrig.id} match={mOrig} />
              </div>
            )}

            {mView === "report" && mOrig && (
              <div className="mt-4">
                <h3 className="text-base font-bold text-brand-dark">
                  ম্যাচের ঘটনা (টাইমলাইন)
                </h3>
                <MatchEventsPanel
                  key={`events-${mOrig.id}`}
                  match={mOrig}
                  teamA={mOrig.team_a_id ? teamById.get(mOrig.team_a_id) : undefined}
                  teamB={mOrig.team_b_id ? teamById.get(mOrig.team_b_id) : undefined}
                />
              </div>
            )}

            {isDeclare && suspensions.length > 0 && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <h3 className="text-base font-bold text-red-800">
                  কার্ড সাসপেনশন — পরের ম্যাচে নিষিদ্ধ
                </h3>
                <p className="mt-1 text-xs text-red-700">নিয়ম: এক ম্যাচে লাল কার্ড, একই ম্যাচে ২টি হলুদ, বা জমা মোট ২টি হলুদ কার্ডে ১ ম্যাচ নিষিদ্ধ; পরের সমাপ্ত ম্যাচে খেললে তা শেষ ধরা হয়।</p>
                <ul className="mt-2 space-y-1">
                  {suspensions.map((s) => (
                    <li
                      key={`${s.playerId}-${s.tournamentId}`}
                      className="text-sm text-neutral-800"
                    >
                      <span className="font-semibold">
                        {allPlayers.find((p) => p.id === s.playerId)?.name ?? "প্লেয়ার"}
                      </span>
                      {" · "}
                      {tournamentById.get(s.tournamentId)?.name ?? "টুর্নামেন্ট"}
                      {" · কারণ: "}
                      {s.reason === "red" ? "লাল কার্ড" : "হলুদ কার্ড জমে"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isDeclare &&
              (visibleMatches.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                  {matches.length === 0
                    ? "এখনো কোনো ম্যাচ তৈরি হয়নি — আগে ম্যাচ পেজ থেকে ম্যাচ তৈরি করুন।"
                    : "এই ছাঁকনিতে কোনো ম্যাচ পাওয়া যায়নি।"}
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
                  {[...visibleMatches]
                    .sort(
                      (a, b) =>
                        (a.status === "completed" ? 1 : 0) -
                        (b.status === "completed" ? 1 : 0),
                    )
                    .map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-neutral-800">
                            {m.team_a_id && teamById.get(m.team_a_id)
                              ? `${teamById.get(m.team_a_id)?.name} বনাম ${teamById.get(m.team_b_id ?? "")?.name ?? m.opponent}`
                              : `বনাম ${m.opponent}`}
                            {m.our_score || m.opponent_score
                              ? ` — ${m.our_score ?? ""} : ${m.opponent_score ?? ""}`
                              : ""}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            {SPORT_LABELS[m.sport]} · {formatDate(m.match_date)}
                            {m.tournament_id
                              ? ` · ${tournamentById.get(m.tournament_id)?.name ?? "টুর্নামেন্ট"}`
                              : ""}
                            {m.round ? ` · ${m.round}` : ""}
                            {m.match_no ? ` · ম্যাচ ${bnNum(m.match_no)}` : ""}
                            {m.venue ? ` · ${m.venue}` : ""} · {MATCH_STATUS_LABELS[m.status]}
                            {m.status === "completed" && m.winner_team_id
                              ? ` · বিজয়ী: ${teamById.get(m.winner_team_id)?.name ?? ""}`
                              : ""}
                            {m.status === "completed" &&
                            m.is_draw &&
                            !m.winner_team_id &&
                            m.result !== NO_RESULT_TEXT
                              ? " · ড্র"
                              : ""}
                            {m.result ? ` · ${m.result}` : ""}
                          </span>
                        </span>
                        <PublishChip published={m.is_published} />
                        <button
                          type="button"
                          onClick={() => openMatch(m, "report")}
                          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
                        >
                          {m.status === "completed" ? "ঘোষণা ঠিক করুন" : "বিজয়ী দল ঘোষণা"}
                        </button>
                      </li>
                    ))}
                </ul>
              ))}
            {!isDeclare && (visibleMatches.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                {matches.length === 0
                  ? "এখনো কোনো ম্যাচ তৈরি হয়নি।"
                  : "এই ছাঁকনিতে কোনো ম্যাচ পাওয়া যায়নি।"}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
                {visibleMatches.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    {/* v180 D1: on small screens the info block takes the
                        full row width (buttons wrap below), like the
                        declaration list — previously the many action
                        buttons squeezed it to ~48px and the meta line
                        wrapped one word per line. Desktop unchanged. */}
                    <span className="min-w-0 flex-1 max-sm:basis-full">
                      <span className="block truncate text-sm font-semibold text-neutral-800">
                        {m.team_a_id && teamById.get(m.team_a_id)
                          ? `${teamById.get(m.team_a_id)?.name} বনাম ${teamById.get(m.team_b_id ?? "")?.name ?? m.opponent}`
                          : `বনাম ${m.opponent}`}
                        {m.our_score || m.opponent_score
                          ? ` — ${m.our_score ?? ""} : ${m.opponent_score ?? ""}`
                          : ""}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {SPORT_LABELS[m.sport]} · {formatDate(m.match_date)}
                        {m.tournament_id
                          ? ` · ${tournamentById.get(m.tournament_id)?.name ?? "টুর্নামেন্ট"}`
                          : ""}
                        {m.round ? ` · ${m.round}` : ""}
                        {m.match_no ? ` · ম্যাচ ${bnNum(m.match_no)}` : ""}
                        {m.venue ? ` · ${m.venue}` : ""} · {MATCH_STATUS_LABELS[m.status]}
                        {m.status === "completed" && m.winner_team_id
                          ? ` · বিজয়ী: ${teamById.get(m.winner_team_id)?.name ?? ""}`
                          : ""}
                        {m.status === "completed" && m.is_draw && !m.winner_team_id && m.result !== NO_RESULT_TEXT ? " · ড্র" : ""}
                        {m.result ? ` · ${m.result}` : ""}
                      </span>
                    </span>
                    <PublishChip published={m.is_published} />
                    <button
                      type="button"
                      onClick={() => void openMatchPrint(m)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      প্রিন্ট করুন
                    </button>
                    <button
                      type="button"
                      onClick={() => setPerfMatchId(perfMatchId === m.id ? null : m.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        perfMatchId === m.id
                          ? "border-gold bg-gold/15 text-brand-dark"
                          : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      Performance
                    </button>
                    <button
                      type="button"
                      onClick={() => openMatch(m, "schedule")}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      সম্পাদনা
                    </button>
                    {m.is_published && (
                      <Link
                        to={`/matches/${m.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        Public-এ দেখুন
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void toggleMatchPublished(m)}
                      className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white"
                    >
                      {m.is_published ? "Unpublish" : "Publish"}
                    </button>
                    {canDelete &&
                      (confirmDeleteMatchId === m.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleDeleteMatch(m)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                          >
                            হ্যাঁ, মুছুন
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMatchId(null)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                          >
                            না
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteMatchId(m.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                        >
                          মুছে ফেলুন
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            ))}
            {!isDeclare && !canDelete && matches.length > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                ম্যাচ মুছে ফেলার অনুমতি শুধু Admin-এর আছে।
              </p>
            )}
          </section>

          {matchPrint && (
            <MatchPrint
              org={{
                nameBn: settings.nameBn,
                nameEn: settings.nameEn,
                logo: settings.logoPath,
                address: settings.address,
                email: settings.email,
                phone: settings.phoneDisplay,
                tagline: settings.tagline,
              }}
              match={matchPrint.match}
              tournament={matchPrint.tournament}
              sideA={matchPrint.sideA}
              sideB={matchPrint.sideB}
              onClose={() => setMatchPrint(null)}
            />
          )}

          {/* ---------------- Performances (Part 3, Matches page only) ---------------- */}
          {section === "matches" && (
          <section className="mt-8">
            <h2 className="text-base font-bold text-brand-dark">প্লেয়ারদের Performance</h2>
            {(() => {
              const selected = matches.find((m) => m.id === perfMatchId) ?? null;
              if (!selected) {
                return (
                  <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                    Performance দেখতে বা যোগ করতে উপরের তালিকা থেকে একটি ম্যাচের
                    &quot;Performance&quot; বোতাম চাপুন।
                  </p>
                );
              }
              return <PerformancePanel key={selected.id} match={selected} />;
            })()}
          </section>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Performance editor for one match (§6 Part 3)                        */
/* ------------------------------------------------------------------ */

const NUM_FIELDS_FOOTBALL: { key: keyof PerformanceDraft; label: string }[] = [
  { key: "goals", label: "গোল" },
  { key: "assists", label: "অ্যাসিস্ট" },
  { key: "yellow_cards", label: "হলুদ কার্ড" },
  { key: "red_cards", label: "লাল কার্ড" },
  { key: "own_goals", label: "আত্মঘাতী গোল" },
  { key: "penalty_goals", label: "পেনাল্টি গোল" },
  { key: "penalty_missed", label: "পেনাল্টি মিস" },
  { key: "saves", label: "সেভ" },
];

const NUM_FIELDS_CRICKET_BATTING: { key: keyof PerformanceDraft; label: string }[] = [
  { key: "runs", label: "রান" },
  { key: "balls_faced", label: "বল খেলেছে" },
  { key: "fours", label: "চার" },
  { key: "sixes", label: "ছয়" },
];

const NUM_FIELDS_CRICKET_BOWLING: { key: keyof PerformanceDraft; label: string }[] = [
  { key: "balls_bowled", label: "বল করেছে" },
  { key: "runs_conceded", label: "রান দিয়েছে" },
  { key: "wickets", label: "উইকেট" },
  { key: "maidens", label: "মেডেন" },
  { key: "wides", label: "ওয়াইড" },
  { key: "no_balls", label: "নো-বল" },
];

/** Step C appearance kinds (0044 draft revision). */
const APPEARANCE_OPTIONS: { value: string; label: string }[] = [
  { value: "starter", label: "শুরুর একাদশ" },
  { value: "substitute", label: "বদলি" },
  { value: "unused", label: "খেলেনি" },
];

/** Step C dismissal kinds with their Bengali labels. */
const DISMISSAL_LABELS: Record<string, string> = {
  bowled: "বোল্ড",
  caught: "ক্যাচ",
  lbw: "এলবিডব্লিউ",
  run_out: "রান আউট",
  stumped: "স্টাম্পড",
  hit_wicket: "হিট উইকেট",
  retired: "অবসর (রিটায়ার্ড)",
  not_out: "নট আউট",
};

const NUM_FIELDS_CRICKET_FIELDING: { key: keyof PerformanceDraft; label: string }[] = [
  { key: "catches", label: "ক্যাচ" },
  { key: "stumpings", label: "স্টাম্পিং" },
  { key: "run_outs", label: "রান আউট" },
];

const EMPTY_PERF: PerformanceDraft = {
  player_id: "",
  goals: 0,
  assists: 0,
  yellow_cards: 0,
  red_cards: 0,
  runs: 0,
  wickets: 0,
  catches: 0,
  balls_faced: 0,
  fours: 0,
  sixes: 0,
  not_out: false,
  balls_bowled: 0,
  runs_conceded: 0,
  maidens: 0,
  stumpings: 0,
  run_outs: 0,
  note: null,
  appearance: null,
  own_goals: 0,
  penalty_goals: 0,
  penalty_missed: 0,
  saves: 0,
  dismissal_type: null,
  dismissed_by_id: null,
  batting_order: null,
  wides: 0,
  no_balls: 0,
};

function PerformancePanel({ match }: { match: Match }) {
  const { profile } = useAuth();
  const canDelete = profile?.role === "admin";
  const { performances, players, loading, loadError, savePerformance, removePerformance } =
    useMatchPerformances(match);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<PerformanceDraft>(EMPTY_PERF);
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const usedPlayerIds = useMemo(
    () => new Set(performances.map((p) => p.player_id)),
    [performances],
  );
  const selectablePlayers = players.filter(
    (p) => !usedPlayerIds.has(p.id) || (editing !== "new" && editing !== null && performances.find((x) => x.id === editing)?.player_id === p.id),
  );
  const warning = scoreConsistencyWarning(match, performances);

  const numField = (key: keyof PerformanceDraft, label: string) => (
    <div key={key}>
      <label className={labelCls} htmlFor={`pf-${key}`}>
        {label}
      </label>
      <input
        id={`pf-${key}`}
        type="number"
        min={0}
        step={1}
        className={inputCls}
        value={String(form[key] ?? 0)}
        onChange={(e) =>
          setForm({ ...form, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
        }
      />
    </div>
  );

  async function handleSave() {
    if (!form.player_id) {
      setFormError("একজন প্লেয়ার বেছে নিন।");
      return;
    }
    if (
      form.batting_order != null &&
      (form.batting_order < 1 || form.batting_order > 11)
    ) {
      setFormError("ব্যাটিং ক্রম ১ থেকে ১১-এর মধ্যে হতে হবে।");
      return;
    }
    setSaving(true);
    setFormError(null);
    setFormWarning(null);
    const res = await savePerformance(editing === "new" ? null : editing, form);
    setSaving(false);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    if (res.warning) setFormWarning(res.warning);
    setEditing(null);
    setForm(EMPTY_PERF);
  }

  async function handleRemove(id: string) {
    const err = await removePerformance(id);
    if (err) setFormError(err);
    setConfirmRemoveId(null);
  }

  const summary = (p: MatchPerformance): string => {
    if (match.sport === "football") {
      const parts = [
        `গোল ${p.goals} · অ্যাসিস্ট ${p.assists} · হলুদ ${p.yellow_cards} · লাল ${p.red_cards}`,
      ];
      if ((p.own_goals ?? 0) > 0) parts.push(`আত্মঘাতী ${p.own_goals}`);
      if ((p.penalty_goals ?? 0) > 0) parts.push(`পেনাল্টি গোল ${p.penalty_goals}`);
      if ((p.saves ?? 0) > 0) parts.push(`সেভ ${p.saves}`);
      return parts.join(" · ");
    }
    const parts = [`রান ${p.runs} (${p.balls_faced} বল)`];
    if (p.dismissal_type) parts.push(DISMISSAL_LABELS[p.dismissal_type] ?? p.dismissal_type);
    if (p.balls_bowled > 0 || p.wickets > 0) parts.push(`উইকেট ${p.wickets}/${p.runs_conceded}`);
    if (p.catches > 0 || p.stumpings > 0 || p.run_outs > 0)
      parts.push(`ক্যাচ ${p.catches} · স্টাম্পিং ${p.stumpings} · রান আউট ${p.run_outs}`);
    return parts.join(" · ");
  };

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-800">
        {SPORT_LABELS[match.sport]} · বনাম {match.opponent} · {formatDate(match.match_date)}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {match.is_published
          ? "ম্যাচটি Published — এই Performance মৌসুমের হিসাবে (Season Statistics) যুক্ত আছে।"
          : "ম্যাচটি এখনো Unpublished — Public Website-এ Performance দেখাবে না এবং মৌসুমের হিসাবে যুক্ত হবে না।"}
      </p>

      {warning && (
        <div className="mt-3 rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-neutral-800" role="alert">
          {warning}
        </div>
      )}
      {formWarning && (
        <div className="mt-3 rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-neutral-800" role="alert">
          {formWarning}
        </div>
      )}
      {loadError && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {loadError}
        </div>
      )}
      {loading && <p className="mt-3 text-sm text-neutral-500">Performance লোড হচ্ছে…</p>}

      {!loading && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-neutral-600">মোট {performances.length} জন প্লেয়ারের Performance</span>
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_PERF);
                setEditing("new");
                setFormError(null);
                setFormWarning(null);
              }}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              + Performance যোগ
            </button>
          </div>

          {editing !== null && (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div>
                <label className={labelCls} htmlFor="pf-player">
                  প্লেয়ার * (শুধু {SPORT_LABELS[match.sport]} টিমের)
                </label>
                <select
                  id="pf-player"
                  className={inputCls}
                  value={form.player_id}
                  onChange={(e) => setForm({ ...form, player_id: e.target.value })}
                >
                  <option value="">— বেছে নিন —</option>
                  {selectablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.jersey_no != null ? ` (#${p.jersey_no})` : ""}
                      {p.status && p.status !== "published" ? " · অপ্রকাশিত" : ""}
                    </option>
                  ))}
                </select>
                {selectablePlayers.length === 0 && (
                  <p className="mt-1 text-xs text-neutral-500">
                    বেছে নেওয়ার মতো প্লেয়ার নেই — হয় টিমে এই খেলার প্লেয়ার নেই, অথবা সবার
                    Performance ইতিমধ্যে যোগ হয়েছে।
                  </p>
                )}
              </div>

              {match.sport === "football" ? (
                <>
                  <div className="mt-3 sm:max-w-xs">
                    <label className={labelCls} htmlFor="pf-appearance">খেলার ধরন (ঐচ্ছিক)</label>
                    <select
                      id="pf-appearance"
                      className={inputCls}
                      value={form.appearance ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          appearance:
                            (e.target.value as PerformanceDraft["appearance"]) || null,
                        })
                      }
                    >
                      <option value="">— বাছুন —</option>
                      {APPEARANCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {NUM_FIELDS_FOOTBALL.map((f) => numField(f.key, f.label))}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">ব্যাটিং</p>
                  <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {NUM_FIELDS_CRICKET_BATTING.map((f) => numField(f.key, f.label))}
                    <label className="flex items-center gap-2 self-end pb-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={form.not_out}
                        onChange={(e) => setForm({ ...form, not_out: e.target.checked })}
                      />
                      অপরাজিত (Not Out)
                    </label>
                    <div>
                      <label className={labelCls} htmlFor="pf-batting-order">ব্যাটিং ক্রম (ঐচ্ছিক)</label>
                      <input
                        id="pf-batting-order"
                        type="number"
                        min={1}
                        max={11}
                        className={inputCls}
                        value={form.batting_order ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            batting_order: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="pf-dismissal">আউটের ধরন (ঐচ্ছিক)</label>
                      <select
                        id="pf-dismissal"
                        className={inputCls}
                        value={form.dismissal_type ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            dismissal_type:
                              (e.target.value as PerformanceDraft["dismissal_type"]) || null,
                          })
                        }
                      >
                        <option value="">— বাছুন —</option>
                        {Object.entries(DISMISSAL_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="pf-dismissed-by">কে আউট করল (ঐচ্ছিক)</label>
                      <select
                        id="pf-dismissed-by"
                        className={inputCls}
                        value={form.dismissed_by_id ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, dismissed_by_id: e.target.value || null })
                        }
                      >
                        <option value="">— বাছুন —</option>
                        {players
                          .filter((p) => p.status === "published")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">বোলিং</p>
                  <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {NUM_FIELDS_CRICKET_BOWLING.map((f) => numField(f.key, f.label))}
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">ফিল্ডিং</p>
                  <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {NUM_FIELDS_CRICKET_FIELDING.map((f) => numField(f.key, f.label))}
                  </div>
                </>
              )}

              <div className="mt-3">
                <label className={labelCls} htmlFor="pf-note">
                  মন্তব্য (ঐচ্ছিক)
                </label>
                <input
                  id="pf-note"
                  className={inputCls}
                  value={form.note ?? ""}
                  onChange={(e) => setForm({ ...form, note: e.target.value || null })}
                />
              </div>

              {formError && (
                <p className="mt-2 text-sm text-red-700" role="alert">
                  {formError}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {saving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-white"
                >
                  বাতিল
                </button>
              </div>
            </div>
          )}

          {performances.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">এই ম্যাচে এখনো কোনো Performance যোগ হয়নি।</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100">
              {performances.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-neutral-800">
                      {playerById.get(p.player_id)?.name ?? "প্লেয়ার"}
                    </span>
                    <span className="block text-xs text-neutral-500">{summary(p)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const { id: _id, match_id: _mid, ...rest } = p;
                      void _id;
                      void _mid;
                      // Merge over the empty draft so rows saved
                      // before Step C (new fields absent) open
                      // with the defaults, not undefined.
                      const clean = Object.fromEntries(
                        Object.entries(rest).filter(([, v]) => v !== undefined),
                      ) as PerformanceDraft;
                      setForm({ ...EMPTY_PERF, ...clean });
                      setEditing(p.id);
                      setFormError(null);
                      setFormWarning(null);
                    }}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    সম্পাদনা
                  </button>
                  {canDelete &&
                    (confirmRemoveId === p.id ? (
                    <>
                      <span className="text-xs text-red-700">মুছলে মৌসুমের হিসাব বদলে যাবে। নিশ্চিত?</span>
                      <button
                        type="button"
                        onClick={() => void handleRemove(p.id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        নিশ্চিত মুছুন
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
                      >
                        না
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(p.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                    >
                      মুছে ফেলুন
                    </button>
                    ))}
                </li>
              ))}
            </ul>
          )}
          {!canDelete && performances.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              Performance মুছে ফেলার অনুমতি শুধু Admin-এর আছে।
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Match timeline events editor (Step D, migration 0052)               */
/* ------------------------------------------------------------------ */

const EVENT_TYPE_OPTIONS: Record<Sport, MatchEventType[]> = {
  football: [
    "goal",
    "penalty_goal",
    "own_goal",
    "penalty_missed",
    "yellow_card",
    "red_card",
    "substitution",
  ],
  cricket: ["wicket", "yellow_card", "red_card", "substitution"],
};

function MatchEventsPanel({
  match,
  teamA,
  teamB,
}: {
  match: Match;
  teamA?: Team;
  teamB?: Team;
}) {
  const { events, players, loading, loadError, tableMissing, addEvent, removeEvent } =
    useMatchEvents(match);
  const [evType, setEvType] = useState<MatchEventType>(
    match.sport === "cricket" ? "wicket" : "goal",
  );
  const [evPlayerId, setEvPlayerId] = useState("");
  const [evTeamId, setEvTeamId] = useState("");
  const [evMinute, setEvMinute] = useState("");
  const [evOver, setEvOver] = useState("");
  const [evDetail, setEvDetail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamOptions = useMemo(
    () => [teamA, teamB].filter((t): t is Team => Boolean(t)),
    [teamA, teamB],
  );
  const teamNameOf = (id: string | null | undefined): string =>
    id === match.team_a_id
      ? (teamA?.name ?? match.opponent)
      : id === match.team_b_id
        ? (teamB?.name ?? match.opponent)
        : "";

  // Timeline goal comparison (display only): goal + penalty_goal
  // events per side, attributed by the event's team when set,
  // else by the player's registered team.
  const goalLine = useMemo(() => {
    if (!match.team_a_id || !match.team_b_id) return null;
    const goals = events.filter(
      (e) => e.event_type === "goal" || e.event_type === "penalty_goal",
    );
    if (goals.length === 0) return null;
    const sideOf = (e: (typeof goals)[number]): string | null =>
      e.team_id ?? (e.player_id ? (playerById.get(e.player_id)?.team_id ?? null) : null);
    const a = goals.filter((e) => sideOf(e) === match.team_a_id).length;
    const b = goals.filter((e) => sideOf(e) === match.team_b_id).length;
    return { a, b };
  }, [events, match.team_a_id, match.team_b_id, playerById]);

  function handlePlayerChange(id: string) {
    setEvPlayerId(id);
    // Default the team to the player's registered team when it
    // is one of this match's two teams (owner's Step D rule).
    const p = playerById.get(id);
    if (p?.team_id && (p.team_id === match.team_a_id || p.team_id === match.team_b_id)) {
      setEvTeamId(p.team_id);
    }
  }

  async function handleAdd() {
    setFormError(null);
    let minute: number | null = null;
    if (match.sport === "football" && evMinute.trim() !== "") {
      const n = Number(evMinute);
      if (!Number.isFinite(n) || n < 0 || n > 150) {
        setFormError("মিনিট ০ থেকে ১৫০-এর মধ্যে হতে হবে।");
        return;
      }
      minute = Math.floor(n);
    }
    const draft: MatchEventDraft = {
      team_id: evTeamId || null,
      player_id: evPlayerId || null,
      related_player_id: null,
      event_type: evType,
      minute,
      over_text:
        match.sport === "cricket" ? evOver.trim().slice(0, 10) || null : null,
      detail: evDetail.trim().slice(0, 200) || null,
    };
    setAdding(true);
    const res = await addEvent(draft);
    setAdding(false);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    setEvPlayerId("");
    setEvMinute("");
    setEvOver("");
    setEvDetail("");
  }

  async function handleRemove(id: string) {
    const err = await removeEvent(id);
    if (err) setFormError(err);
    setConfirmRemoveId(null);
  }

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-800">
        {SPORT_LABELS[match.sport]} · বনাম {match.opponent} · {formatDate(match.match_date)}
      </p>
      <p className="mt-1 text-xs text-neutral-500">Public ম্যাচ পেজে টাইমলাইনে দেখাবে।</p>

      {tableMissing ? (
        <div
          className="mt-3 rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-neutral-800"
          role="alert"
        >
          ঘটনার টাইমলাইন এখনো Database-এ তৈরি হয়নি — Migration 0052 Live Apply
          করতে হবে। ততদিন এই অংশটি বন্ধ আছে; ম্যাচের বাকি সবকিছু আগের মতোই চলবে।
        </div>
      ) : (
        <>
          {goalLine && (
            <p className="mt-3 rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-brand-dark">
              টাইমলাইন অনুযায়ী গোল: {teamNameOf(match.team_a_id)}{" "}
              {bnNum(goalLine.a)} — {bnNum(goalLine.b)} {teamNameOf(match.team_b_id)}
            </p>
          )}
          {loadError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {loadError}
            </div>
          )}
          {formError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {formError}
            </div>
          )}
          {loading && <p className="mt-3 text-sm text-neutral-500">ঘটনা লোড হচ্ছে…</p>}

          {!loading && (
            <>
              {events.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">
                  এখনো কোনো ঘটনা যোগ করা হয়নি।
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-neutral-100">
                  {events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="rounded bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
                        {e.minute != null
                          ? `${bnNum(e.minute)}'`
                          : e.over_text
                            ? `${e.over_text} ওভার`
                            : "—"}
                      </span>
                      <span className="text-sm font-medium text-neutral-800">
                        {EVENT_TYPE_LABELS_BN[e.event_type]}
                      </span>
                      <span className="flex-1 text-sm text-neutral-600">
                        {e.player_id
                          ? (playerById.get(e.player_id)?.name ?? "")
                          : ""}
                        {e.team_id ? ` (${teamNameOf(e.team_id)})` : ""}
                        {e.detail ? ` · ${e.detail}` : ""}
                      </span>
                      {confirmRemoveId === e.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRemove(e.id)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                          >
                            হ্যাঁ, মুছুন
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                          >
                            না
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(e.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                        >
                          মুছুন
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="ev-type">ঘটনার ধরন</label>
                  <select
                    id="ev-type"
                    className={inputCls}
                    value={evType}
                    onChange={(e) => setEvType(e.target.value as MatchEventType)}
                  >
                    {EVENT_TYPE_OPTIONS[match.sport].map((value) => (
                      <option key={value} value={value}>
                        {EVENT_TYPE_LABELS_BN[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="ev-player">প্লেয়ার (ঐচ্ছিক)</label>
                  <select
                    id="ev-player"
                    className={inputCls}
                    value={evPlayerId}
                    onChange={(e) => handlePlayerChange(e.target.value)}
                  >
                    <option value="">— প্লেয়ার বাছুন —</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {teamOptions.length > 0 && (
                  <div>
                    <label className={labelCls} htmlFor="ev-team">টিম</label>
                    <select
                      id="ev-team"
                      className={inputCls}
                      value={evTeamId}
                      onChange={(e) => setEvTeamId(e.target.value)}
                    >
                      <option value="">— টিম বাছুন —</option>
                      {teamOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {match.sport === "football" ? (
                  <div>
                    <label className={labelCls} htmlFor="ev-minute">মিনিট</label>
                    <input
                      id="ev-minute"
                      type="number"
                      min={0}
                      max={150}
                      className={inputCls}
                      value={evMinute}
                      onChange={(e) => setEvMinute(e.target.value)}
                      placeholder="যেমন: ২৩"
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelCls} htmlFor="ev-over">ওভার</label>
                    <input
                      id="ev-over"
                      className={inputCls}
                      value={evOver}
                      onChange={(e) => setEvOver(e.target.value)}
                      placeholder="যেমন: 12.3"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="ev-detail">বিবরণ (ঐচ্ছিক)</label>
                  <input
                    id="ev-detail"
                    className={inputCls}
                    value={evDetail}
                    onChange={(e) => setEvDetail(e.target.value)}
                    placeholder="ছোট নোট, যেমন: হেডারে গোল"
                  />
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => void handleAdd()}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {adding ? "যোগ হচ্ছে…" : "যোগ করুন"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Team-entry panel for one tournament (owner's rules, 2026-11-02):
 * pick the registered teams from the existing Teams list, or
 * quick-create a new tournament team. The selection order is the
 * seed. Saving replaces the entries exactly (verified in the hook).
 */
function TournamentTeamsPanel({
  tournament,
  allTeams,
  fetchTournamentTeams,
  setTournamentTeams,
  onCreateTeam,
  onPrint,
  onMessage,
}: {
  tournament: Tournament;
  allTeams: Team[];
  fetchTournamentTeams: (id: string) => Promise<TournamentTeam[]>;
  setTournamentTeams: (
    id: string,
    teamIds: string[],
    codes?: Record<string, string | null>,
  ) => Promise<string | null>;
  onCreateTeam: (sport: Sport, name: string) => Promise<Team | null>;
  onPrint: () => void;
  onMessage: (kind: "error" | "notice", msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  // The entries as loaded from the database — they carry each
  // entered team's Team ID (migration 0056), shown beside the
  // seed and carried over the replace-on-save so an assigned
  // ID is never lost by a panel save.
  const [entries, setEntries] = useState<TournamentTeam[]>([]);
  const [saving, setSaving] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchTournamentTeams(tournament.id);
      if (cancelled) return;
      setEntries(rows);
      setSelected(rows.map((e) => e.team_id));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTournamentTeams, tournament.id]);

  const sportTeams = allTeams.filter((t) => t.sport === tournament.sport);
  const target = tournament.team_count ?? null;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function handleSave() {
    setSaving(true);
    const codes: Record<string, string | null> = {};
    for (const e of entries) {
      if (selected.includes(e.team_id)) codes[e.team_id] = e.team_code ?? null;
    }
    const err = await setTournamentTeams(tournament.id, selected, codes);
    if (!err) {
      const rows = await fetchTournamentTeams(tournament.id);
      setEntries(rows);
      setSelected(rows.map((e) => e.team_id));
    }
    setSaving(false);
    if (err) onMessage("error", err);
    else onMessage("notice", "টুর্নামেন্টের টিম সংরক্ষিত হয়েছে (যাচাই সম্পন্ন)।");
  }

  async function handleCreate() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    const team = await onCreateTeam(tournament.sport, newTeamName);
    setCreating(false);
    if (team) {
      setNewTeamName("");
      setSelected((prev) => (prev.includes(team.id) ? prev : [...prev, team.id]));
      onMessage("notice", "নতুন টিম তৈরি হয়ে এই টুর্নামেন্টে যোগ হয়েছে — সংরক্ষণ করুন।");
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-brand-dark">
          {tournament.name} — টিম নিবন্ধন
        </h3>
        <button
          type="button"
          onClick={onPrint}
          className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white"
        >
          প্রিন্ট করুন
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        বেছে নেওয়ার ক্রমই টিমের ক্রম (seed)।{" "}
        {target
          ? `লক্ষ্য: ${bnNum(target)}টি টিম — এখন বেছে নেওয়া হয়েছে ${bnNum(selected.length)}টি।`
          : `এখন বেছে নেওয়া হয়েছে ${bnNum(selected.length)}টি টিম।`}
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-neutral-500">লোড হচ্ছে…</p>
      ) : (
        <>
          {sportTeams.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">
              এই খেলার কোনো টিম এখনো তৈরি হয়নি — নিচে নতুন টিম তৈরি করুন অথবা টিম-নিবন্ধন পেজ থেকে যোগ করুন।
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {sportTeams.map((team) => {
                const idx = selected.indexOf(team.id);
                const entryCode =
                  idx !== -1
                    ? (entries.find((e) => e.team_id === team.id)?.team_code ?? null)
                    : null;
                return (
                  <li key={team.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={idx !== -1}
                        onChange={() => toggle(team.id)}
                      />
                      {team.logo_url ? (
                        <img src={team.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                        {team.name}
                        {team.is_published ? "" : " (অপ্রকাশিত)"}
                      </span>
                      {entryCode && (
                        <span className="shrink-0 rounded-full bg-brand-light px-2 py-0.5 text-xs font-bold text-brand-dark">
                          {entryCode}
                        </span>
                      )}
                      {idx !== -1 && (
                        <span className="text-xs font-semibold text-brand">#{bnNum(idx + 1)}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="নতুন টিমের নাম"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              aria-label="নতুন টিমের নাম"
            />
            <button
              type="button"
              disabled={creating || !newTeamName.trim()}
              onClick={() => void handleCreate()}
              className="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand hover:text-white disabled:opacity-60"
            >
              {creating ? "তৈরি হচ্ছে…" : "+ নতুন টিম তৈরি করুন"}
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {saving ? "সংরক্ষণ হচ্ছে…" : "টিম সংরক্ষণ করুন"}
            </button>
            {target !== null && selected.length !== target && (
              <span className="self-center text-xs font-medium text-gold">
                লক্ষ্যমাত্রা {bnNum(target)}টি — এখন {bnNum(selected.length)}টি
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Points / bracket panel for one tournament: the computed table
 * (league) or round progression (knockout), fixture generation
 * with an impact confirmation, the champion, and the notification
 * shortcuts into the existing Notice/Email system.
 */
function TournamentTablePanel({
  tournament,
  allTeams,
  matches,
  fetchTournamentTeams,
  createMatchesBulk,
  onPrint,
  onMessage,
}: {
  tournament: Tournament;
  allTeams: Team[];
  matches: Match[];
  fetchTournamentTeams: (id: string) => Promise<TournamentTeam[]>;
  createMatchesBulk: (
    rows: {
      sport: Match["sport"];
      tournament_id: string;
      opponent: string;
      team_a_id: string;
      team_b_id: string;
      match_no: number;
      round: string;
    }[],
  ) => Promise<string | null>;
  onPrint: () => void;
  onMessage: (kind: "error" | "notice", msg: string) => void;
}) {
  const [entries, setEntries] = useState<TournamentTeam[]>([]);
  const [pendingGen, setPendingGen] = useState<{
    label: string;
    detail: string;
    rows: {
      sport: Match["sport"];
      tournament_id: string;
      opponent: string;
      team_a_id: string;
      team_b_id: string;
      match_no: number;
      round: string;
    }[];
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchTournamentTeams(tournament.id);
      if (!cancelled) setEntries(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTournamentTeams, tournament.id]);

  const teamByIdLocal = useMemo(() => new Map(allTeams.map((t) => [t.id, t])), [allTeams]);
  const enteredTeams = entries
    .map((e) => teamByIdLocal.get(e.team_id))
    .filter((t): t is Team => Boolean(t));
  const tMatches = matches.filter((m) => m.tournament_id === tournament.id);
  const champion = championOf(tournament, allTeams, matches);
  const nextNo = tMatches.reduce((max, m) => Math.max(max, m.match_no ?? 0), 0) + 1;

  function prepareKnockoutFirstRound() {
    if (enteredTeams.length < 2) {
      onMessage("error", "সূচি তৈরির জন্য অন্তত ২টি নিবন্ধিত টিম লাগবে — আগে টিম প্যানেল থেকে টিম যোগ করুন।");
      return;
    }
    const { pairs, byes } = seedPairs(enteredTeams);
    const round = knockoutRoundLabel(enteredTeams.length);
    setPendingGen({
      label: `${round}-এর সূচি`,
      detail: `${bnNum(pairs.length)}টি ম্যাচ তৈরি হবে (অপ্রকাশিত, আসন্ন)।${
        byes.length ? ` ${byes.map((t) => t.name).join(", ")} এই রাউন্ডে bye পাবে (ম্যাচ ছাড়াই পরের রাউন্ডে)।` : ""
      }`,
      rows: pairs.map((p, i) => ({
        sport: tournament.sport,
        tournament_id: tournament.id,
        opponent: p.teamB.name,
        team_a_id: p.teamA.id,
        team_b_id: p.teamB.id,
        match_no: nextNo + i,
        round,
      })),
    });
  }

  function prepareKnockoutNextRound() {
    const groups = groupByRound(tMatches);
    const latest = groups[groups.length - 1];
    if (!latest) {
      prepareKnockoutFirstRound();
      return;
    }
    if (latest.matches.some((m) => m.status !== "completed" || !m.winner_team_id)) {
      onMessage("error", "পরের রাউন্ডের আগে এই রাউন্ডের সব ম্যাচ সমাপ্ত করে বিজয়ী নির্ধারণ করুন।");
      return;
    }
    const winners = latest.matches
      .map((m) => teamByIdLocal.get(m.winner_team_id ?? ""))
      .filter((t): t is Team => Boolean(t));
    const playedIds = new Set(
      tMatches.flatMap((m) => [m.team_a_id, m.team_b_id]).filter(Boolean) as string[],
    );
    const byes = enteredTeams.filter((t) => !playedIds.has(t.id));
    const participants = [...winners, ...byes];
    if (participants.length < 2) {
      onMessage("error", "পরের রাউন্ডের জন্য অন্তত ২টি টিম দরকার।");
      return;
    }
    const { pairs, byes: midByes } = seedPairs(participants);
    const round = knockoutRoundLabel(participants.length);
    setPendingGen({
      label: `${round}-এর সূচি`,
      detail: `${bnNum(pairs.length)}টি ম্যাচ তৈরি হবে (অপ্রকাশিত, আসন্ন)।${
        midByes.length ? ` ${midByes.map((t) => t.name).join(", ")} bye পাবে।` : ""
      }`,
      rows: pairs.map((p, i) => ({
        sport: tournament.sport,
        tournament_id: tournament.id,
        opponent: p.teamB.name,
        team_a_id: p.teamA.id,
        team_b_id: p.teamB.id,
        match_no: nextNo + i,
        round,
      })),
    });
  }

  function prepareLeagueFixtures() {
    if (enteredTeams.length < 2) {
      onMessage("error", "সূচি তৈরির জন্য অন্তত ২টি নিবন্ধিত টিম লাগবে — আগে টিম প্যানেল থেকে টিম যোগ করুন।");
      return;
    }
    const rounds = roundRobinRounds(enteredTeams);
    const rows: NonNullable<typeof pendingGen>["rows"] = [];
    let no = nextNo;
    rounds.forEach((pairs, ri) => {
      for (const p of pairs) {
        rows.push({
          sport: tournament.sport,
          tournament_id: tournament.id,
          opponent: p.teamB.name,
          team_a_id: p.teamA.id,
          team_b_id: p.teamB.id,
          match_no: no,
          round: `রাউন্ড ${bnNum(ri + 1)}`,
        });
        no += 1;
      }
    });
    setPendingGen({
      label: "Round Robin সূচি",
      detail: `প্রতিটি টিম প্রতিটি টিমের সঙ্গে একবার খেলবে — মোট ${bnNum(rows.length)}টি ম্যাচ তৈরি হবে (অপ্রকাশিত, আসন্ন)। তারিখ ও মাঠ পরে প্রতিটি ম্যাচে বসাতে হবে।`,
      rows,
    });
  }

  async function runGeneration() {
    if (!pendingGen) return;
    setGenerating(true);
    const err = await createMatchesBulk(pendingGen.rows);
    setGenerating(false);
    setPendingGen(null);
    if (err) onMessage("error", err);
    else onMessage("notice", "ম্যাচের সূচি তৈরি হয়েছে — ম্যাচ তালিকা থেকে তারিখ/মাঠ বসিয়ে প্রকাশ করুন।");
  }

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-brand-dark">
          {tournament.name} —{" "}
          {tournament.format === "league" || tournament.format === "group_knockout"
            ? "পয়েন্ট টেবিল"
            : "Knockout ব্র্যাকেট"}
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white"
          >
            প্রিন্ট করুন
          </button>
          <Link
            to="/tournaments"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Public পেজে দেখুন (Preview)
          </Link>
          <Link
            to="/admin/notifications"
            className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white"
          >
            ওয়েবসাইটে নোটিফিকেশন দিন
          </Link>
          <Link
            to="/admin/notifications"
            className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white"
          >
            ইমেইল পাঠান
          </Link>
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-500">নোটিশ &quot;নোটিফিকেশন&quot; পেজে প্রকাশ করলেই Website-এ দেখাবে ও ইমেইল যাবে।</p>

      {champion && (
        <p className="mt-3 rounded-xl bg-gold/15 px-3 py-2 text-sm font-bold text-brand-dark">
          চ্যাম্পিয়ন: {champion.name}
        </p>
      )}

      <p className="mt-2 text-xs text-neutral-500">মোট ম্যাচ: {bnNum(tMatches.length)}</p>

      <div className="mt-3">
        {tournament.format === "league" || tournament.format === "group_knockout" ? (
          <PointsTableView tournament={tournament} teams={allTeams} matches={matches} />
        ) : tournament.format === "knockout" ? (
          <BracketView
            teams={allTeams}
            matches={tMatches}
            teamTotal={enteredTeams.length || tournament.team_count || 0}
          />
        ) : (
          <p className="text-sm text-neutral-500">
            এই টুর্নামেন্টের ধরন (League/Knockout) এখনো নির্ধারণ হয়নি — টুর্নামেন্ট সম্পাদনা করে
            ধরন বেছে নিলে এখানে {`পয়েন্ট টেবিল / ব্র্যাকেট`} দেখা যাবে।
          </p>
        )}
      </div>

      {tournament.format && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          {pendingGen ? (
            <div className="rounded-xl border border-gold/60 bg-gold/10 p-3 text-sm text-neutral-800" role="alert">
              <strong>{pendingGen.label}:</strong> {pendingGen.detail}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void runGeneration()}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {generating ? "তৈরি হচ্ছে…" : "হ্যাঁ, তৈরি করুন"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingGen(null)}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  না
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tournament.format === "knockout" && tMatches.length === 0 && (
                <button
                  type="button"
                  onClick={prepareKnockoutFirstRound}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  প্রথম রাউন্ডের সূচি তৈরি করুন
                </button>
              )}
              {tournament.format === "knockout" && tMatches.length > 0 && (
                <button
                  type="button"
                  onClick={prepareKnockoutNextRound}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  পরের রাউন্ড তৈরি করুন
                </button>
              )}
              {(tournament.format === "league" ||
                tournament.format === "group_knockout") &&
                tMatches.length === 0 && (
                <button
                  type="button"
                  onClick={prepareLeagueFixtures}
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  Round Robin সূচি তৈরি করুন
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
