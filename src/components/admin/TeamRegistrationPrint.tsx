import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Sport, Tournament } from "../../types/database.types";
import { TOURNAMENT_STATUS_LABELS_BN } from "../../utils/matchDisplay";
import {
  asciiFileSlug,
  downloadSheetPdf,
} from "../../utils/downloadSheetPdf";

/**
 * Print sheets (owner's print specification, 2026-11-05;
 * professional A4 redesign, v168): ONE shared sheet component
 * with two modes. Both sheets are true A4 documents (210mm
 * wide, 14mm margins, brand green #17623D / dark #0F4A2E with
 * the gold #F3C64E rule) built from structured label-value
 * tables — no web-style cards.
 *
 * - "tournament" (Sheet A, on the Admin টুর্নামেন্ট page):
 *   "টুর্নামেন্টের তথ্য" — masthead, the tournament banner
 *   (when set), a title band, the full তথ্য table, the
 *   পয়েন্ট ব্যবস্থা mini-table (when points exist), the
 *   নিয়মাবলি / বিবরণ section, and an organizer signature row.
 * - "combined" (Sheet B, on the Admin টিম-নিবন্ধন page):
 *   "টিম নিবন্ধন ফরম" — the same masthead, a compact
 *   tournament summary band, the Team ID as a large badge
 *   (or the "Team ID বরাদ্দ হয়নি" line when the shown entry
 *   carries no ID), the টিমের তথ্য table, a ঘোষণা line, and
 *   a three-signature row, so the printed copy can be handed
 *   to the team.
 *
 * Rendered in a portal modal; the @media print rules below
 * print ONLY the sheet: the app root is removed from the
 * print layout, everything else is visibility-hidden, and
 * the modal's own buttons (display-none in print) sit
 * outside the sheet so they never print. Beside প্রিন্ট
 * করুন, the toolbar's ডাউনলোড button (owner's request,
 * v170) saves the same sheet directly as a one-page A4 PDF
 * (see utils/downloadSheetPdf) with no print dialog. The
 * sheet itself
 * stays in normal flow, so a data-rich sheet paginates
 * cleanly onto a second A4 page instead of being clipped
 * or repeated. v174 (owner's print fixes): the signature
 * তারিখ lines auto-fill the print day's date, the printed
 * sheet sizes to the page content box so imposed print
 * margins reflow instead of clipping. v190 (owner's order,
 * 2026-11-10): every number on the sheets prints in English
 * (Latin) digits — dates, counts, points and the season
 * year — superseding the v174 Bengali-digit rule; Bengali
 * words and month names are unchanged. The in-sheet tournament selector (combined
 * mode, multiple entries) is likewise outside the sheet.
 */

export interface PrintTeamInfo {
  name: string;
  sport: Sport;
  shortName: string | null;
  ownerName: string | null;
  captainName: string | null;
  coachName: string | null;
  phone: string | null;
  jerseyColor: string | null;
  jerseyColorHex: string | null;
  establishedDate: string | null;
  displayOrder: number;
  logoUrl: string | null;
}

export interface PrintOption {
  tournament: Tournament;
  /** The team's Team ID on its entry in this tournament —
   * null when the entry carries no ID. */
  code: string | null;
}

/** Organization identity for the masthead / footer, taken
 * from the site settings the Admin pages already load. */
export interface PrintOrgInfo {
  nameBn: string;
  nameEn?: string | null;
  logo?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  tagline?: string | null;
}

const SPORT_LABELS: Record<Sport, string> = { football: "ফুটবল", cricket: "ক্রিকেট" };
const FORMAT_LABELS_BN: Record<string, string> = {
  league: "লিগ",
  knockout: "নকআউট",
  group_knockout: "গ্রুপ পর্ব ও নকআউট",
};

function bnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("bn-BD-u-nu-latn", { dateStyle: "long" });
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

/** মৌসুম as printed on the sheets: a bare 4-digit year is
 * stored in Latin digits and prints as-is, like every other
 * number on the sheet (owner's digit rule, 2026-11-10);
 * any other stored text is printed unchanged. */
const seasonText = (v: string | null | undefined): string =>
  v && /^\d{4}$/.test(v) ? v : dash(v);

/** Today's date in Asia/Dhaka, in the same long Bengali form
 * bnDate produces — auto-filled onto the signature তারিখ
 * lines so a printed or downloaded sheet always carries the
 * day it was produced (owner's print rule, 2026-11-05).
 * Stored/entered dates are never affected by this. */
function printDayDate(): string {
  return new Date().toLocaleDateString("bn-BD-u-nu-latn", {
    dateStyle: "long",
    timeZone: "Asia/Dhaka",
  });
}

/* ---------------- Shared document pieces ---------------- */

/** Organization masthead: logo, names, contact line, and the
 * gold rule (with a hairline green rule under it). */
function Masthead({ org }: { org: PrintOrgInfo }) {
  const contact = [org.address, org.email, org.phone]
    .filter((v) => v && v.trim())
    .join("  ·  ");
  return (
    <header>
      <div className="flex items-center gap-[4mm]">
        {org.logo && (
          <img
            src={org.logo}
            alt=""
            className="h-[15mm] w-[15mm] shrink-0 object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="text-[16pt] font-black leading-tight text-brand-dark">
            {org.nameBn}
          </p>
          {org.nameEn && org.nameEn.trim() && (
            <p className="text-[9pt] font-semibold uppercase tracking-[0.16em] text-neutral-500">
              {org.nameEn}
            </p>
          )}
          {contact && (
            <p className="mt-[0.6mm] text-[9pt] text-neutral-600 print:[overflow-wrap:anywhere]">{contact}</p>
          )}
        </div>
      </div>
      <div className="mt-[2.4mm] border-b-[2.2pt] border-[#F3C64E]" />
      <div className="mt-[0.7mm] border-b-[0.75pt] border-brand" />
    </header>
  );
}

/** Green document title band. */
function TitleBand({
  label,
  title,
}: {
  label?: string;
  title: string;
}) {
  return (
    <div className="mt-[5mm] break-inside-avoid bg-brand px-[5mm] py-[2.4mm] text-white">
      {label && (
        <p className="text-[8.5pt] font-bold uppercase tracking-[0.22em] text-[#F3C64E]">
          {label}
        </p>
      )}
      <p className="text-[15.5pt] font-black leading-snug">{title}</p>
    </div>
  );
}

/** Section heading with a gold tick. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-[2.5mm] text-[12pt] font-bold text-brand-dark">
      <span className="inline-block h-[4.6mm] w-[1.6mm] shrink-0 bg-[#F3C64E]" />
      {children}
    </h2>
  );
}

interface InfoRow {
  label: string;
  value: React.ReactNode;
}

/** Two-column label-value table: soft green label cells,
 * thin borders, aligned grid. */
function InfoTable({ rows }: { rows: InfoRow[] }) {
  return (
    <div className="border border-neutral-300">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`grid grid-cols-[44mm_1fr] ${i > 0 ? "border-t border-neutral-300" : ""}`}
        >
          <div className="bg-brand-light px-[3.5mm] py-[1.3mm] text-[10pt] font-semibold text-brand-dark">
            {r.label}
          </div>
          <div className="px-[3.5mm] py-[1.3mm] text-[10.5pt] font-medium text-neutral-900">
            {r.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** True when at least one points value exists on the row. */
function hasPoints(tr: Tournament): boolean {
  return [tr.points_win, tr.points_draw, tr.points_loss].some(
    (v) => typeof v === "number",
  );
}

/** পয়েন্ট ব্যবস্থা mini-table (render only when hasPoints). */
function PointsTable({ tr }: { tr: Tournament }) {
  const cells: { label: string; value: number | undefined }[] = [
    { label: "জয়", value: tr.points_win },
    { label: "ড্র", value: tr.points_draw },
    { label: "পরাজয়", value: tr.points_loss },
  ];
  return (
    <table className="w-[104mm] border-collapse text-center">
      <thead>
        <tr>
          {cells.map((c) => (
            <th
              key={c.label}
              className="border border-brand-dark bg-brand px-2 py-[1.2mm] text-[10pt] font-bold text-white"
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {cells.map((c) => (
            <td
              key={c.label}
              className="border border-neutral-300 py-[1.2mm] text-[11.5pt] font-bold text-neutral-900"
            >
              {typeof c.value === "number" ? String(c.value) : "—"}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** One signature block: signing space, rule, label, and
 * (optionally) a তারিখ line under it carrying the print
 * day's date (v174 — auto-filled, never a blank line). */
function SignatureBlock({
  label,
  withDate = false,
  dateText,
}: {
  label: string;
  withDate?: boolean;
  dateText?: string;
}) {
  return (
    <div className="min-w-0 flex-1 break-inside-avoid">
      <div className="h-[6.5mm]" />
      <div className="border-t border-neutral-600 pt-[1.6mm] text-center text-[9.5pt] font-semibold text-neutral-700">
        {label}
      </div>
      {withDate && (
        <p className="mt-[2.2mm] text-center text-[9pt] text-neutral-500">
          তারিখ: {dateText}
        </p>
      )}
    </div>
  );
}

/* ---------------- Sheet A: টুর্নামেন্টের তথ্য ---------------- */

function TournamentInfoSheet({
  org,
  tr,
  teamNameById,
}: {
  org: PrintOrgInfo;
  tr: Tournament;
  teamNameById?: ReadonlyMap<string, string>;
}) {
  const runnerUpName = tr.runner_up_team_id
    ? teamNameById?.get(tr.runner_up_team_id)
    : undefined;
  const printDate = printDayDate();

  const rows: InfoRow[] = [
    { label: "খেলা", value: SPORT_LABELS[tr.sport] },
    { label: "মৌসুম", value: seasonText(tr.season) },
    {
      label: "ফরম্যাট",
      value: tr.format ? (FORMAT_LABELS_BN[tr.format] ?? tr.format) : "—",
    },
    { label: "অবস্থা", value: TOURNAMENT_STATUS_LABELS_BN[tr.status] },
    { label: "শুরুর তারিখ", value: bnDate(tr.start_date) },
    { label: "শেষের তারিখ", value: bnDate(tr.end_date) },
    { label: "মাঠ / ভেন্যু", value: dash(tr.venue) },
    { label: "আয়োজক", value: dash(tr.organizer) },
    { label: "পরিচালক", value: dash(tr.director) },
    { label: "পরিচালকের ফোন", value: dash(tr.director_phone) },
    {
      label: "মোট টিম",
      value: tr.team_count ? `${tr.team_count}টি` : "—",
    },
  ];
  if (runnerUpName) {
    rows.push({ label: "রানার্স-আপ টিম", value: runnerUpName });
  }
  if (typeof tr.squad_size === "number") {
    rows.push({
      label: "প্রতি দলে প্লেয়ার",
      value: `${tr.squad_size} জন`,
    });
  }
  if (tr.sport === "football" && typeof tr.match_minutes === "number") {
    rows.push({
      label: "ম্যাচের সময়",
      value: `${tr.match_minutes} মিনিট`,
    });
  }
  if (tr.sport === "cricket" && (typeof tr.cricket_overs === "number" || tr.ball_type)) {
    const parts: string[] = [];
    if (typeof tr.cricket_overs === "number") parts.push(`${tr.cricket_overs} ওভার`);
    if (tr.ball_type && tr.ball_type.trim()) parts.push(tr.ball_type.trim());
    rows.push({ label: "ম্যাচের সময়", value: parts.join(", ") });
  }

  return (
    <>
      <Masthead org={org} />
      {tr.banner_url && (
        <img
          src={tr.banner_url}
          alt=""
          className="mt-[4mm] h-[22mm] w-full border border-neutral-300 object-cover"
        />
      )}
      <TitleBand label="টুর্নামেন্টের তথ্য" title={tr.name} />
      <div className="mt-[4mm]">
        <InfoTable rows={rows} />
      </div>
      {hasPoints(tr) && (
        <div className="mt-[4mm]">
          <SectionHeading>পয়েন্ট ব্যবস্থা</SectionHeading>
          <div className="mt-[2mm]">
            <PointsTable tr={tr} />
          </div>
        </div>
      )}
      {tr.description && tr.description.trim() && (
        <div className="mt-[4mm]">
          <SectionHeading>নিয়মাবলি ও বিবরণ</SectionHeading>
          <p className="mt-[2mm] whitespace-pre-line text-[10.5pt] leading-normal text-neutral-800">
            {tr.description}
          </p>
        </div>
      )}
      <div className="mt-[6mm] flex break-inside-avoid gap-[12mm]">
        <SignatureBlock label="আয়োজকের স্বাক্ষর" />
        <div className="min-w-0 flex-1">
          <div className="h-[6.5mm]" />
          <div className="border-t border-neutral-600 pt-[1.6mm] text-center text-[9.5pt] font-semibold text-neutral-700">
            তারিখ: {printDate}
          </div>
        </div>
      </div>
      <footer className="mt-auto break-inside-avoid pt-[5mm]">
        <p className="border-t border-neutral-300 pt-[2mm] text-center text-[8.5pt] text-neutral-500">
          {org.nameBn} — {org.tagline && org.tagline.trim() ? org.tagline : "ক্রীড়া প্রতিযোগিতা"}
        </p>
      </footer>
    </>
  );
}

/* ---------------- Sheet B: টিম নিবন্ধন ফরম ---------------- */

function TeamRegistrationSheet({
  org,
  tr,
  team,
  code,
}: {
  org: PrintOrgInfo;
  tr: Tournament;
  team: PrintTeamInfo;
  code: string | null;
}) {
  const printDate = printDayDate();
  const dateRange =
    tr.start_date && tr.end_date
      ? `${bnDate(tr.start_date)} — ${bnDate(tr.end_date)}`
      : bnDate(tr.start_date ?? tr.end_date);

  const summaryPairs: { label: string; value: React.ReactNode }[] = [
    { label: "খেলা", value: SPORT_LABELS[tr.sport] },
    { label: "মৌসুম", value: seasonText(tr.season) },
    {
      label: "ফরম্যাট",
      value: tr.format ? (FORMAT_LABELS_BN[tr.format] ?? tr.format) : "—",
    },
    { label: "তারিখ", value: dateRange },
    { label: "মাঠ / ভেন্যু", value: dash(tr.venue) },
    { label: "অবস্থা", value: TOURNAMENT_STATUS_LABELS_BN[tr.status] },
  ];

  const teamRows: InfoRow[] = [
    { label: "টিমের নাম", value: team.name },
    { label: "সংক্ষিপ্ত নাম", value: dash(team.shortName) },
    { label: "দায়িত্বশীল ব্যক্তি", value: dash(team.ownerName) },
    { label: "মোবাইল নম্বর", value: dash(team.phone) },
    { label: "অধিনায়ক", value: dash(team.captainName) },
    { label: "কোচ", value: dash(team.coachName) },
    {
      label: "জার্সির রং",
      value: (
        <span className="inline-flex items-center gap-2">
          {dash(team.jerseyColor)}
          {team.jerseyColorHex && (
            <span
              className="inline-block h-[3.6mm] w-[3.6mm] rounded-full border border-neutral-300"
              style={{ backgroundColor: team.jerseyColorHex }}
            />
          )}
        </span>
      ),
    },
    { label: "শুরুর তারিখ", value: bnDate(team.establishedDate) },
    { label: "প্রদর্শনের ক্রম", value: String(team.displayOrder) },
  ];

  return (
    <>
      <Masthead org={org} />
      <TitleBand title="টিম নিবন্ধন ফরম" />

      {/* Tournament summary band — which tournament this
          registration belongs to. */}
      <div className="mt-[5mm] break-inside-avoid border border-brand/30 bg-brand-light/60 px-[4.5mm] py-[3.5mm]">
        <p className="text-[10.5pt]">
          <span className="font-semibold text-brand-dark">টুর্নামেন্টের নাম:</span>{" "}
          <span className="font-bold text-neutral-900">{tr.name}</span>
        </p>
        <div className="mt-[2mm] grid grid-cols-2 gap-x-[8mm] gap-y-[1.2mm] text-[10pt]">
          {summaryPairs.map((p) => (
            <p key={p.label}>
              <span className="font-semibold text-brand-dark">{p.label}:</span>{" "}
              <span className="font-medium text-neutral-900">{p.value}</span>
            </p>
          ))}
        </div>
      </div>

      {/* Team ID badge */}
      <div className="mt-[5mm] flex break-inside-avoid justify-center">
        {code ? (
          <div className="flex items-baseline gap-[3.5mm] rounded-[1.5mm] border-[0.55mm] border-brand px-[7mm] py-[2.8mm]">
            <span className="text-[10pt] font-bold uppercase tracking-[0.2em] text-neutral-500">
              Team ID
            </span>
            <p className="text-5xl font-black tracking-wide text-brand-dark">{code}</p>
          </div>
        ) : (
          <p className="py-[2mm] text-[10.5pt] font-semibold text-neutral-600">
            Team ID বরাদ্দ হয়নি
          </p>
        )}
      </div>

      {/* Team information */}
      <div className="mt-[5mm] break-inside-avoid">
        <div className="flex items-start justify-between gap-[4mm]">
          <SectionHeading>টিমের তথ্য</SectionHeading>
          {team.logoUrl && (
            <img
              src={team.logoUrl}
              alt=""
              className="h-[15mm] w-[15mm] shrink-0 object-contain"
            />
          )}
        </div>
        <div className="mt-[2.5mm]">
          <InfoTable rows={teamRows} />
        </div>
      </div>

      {/* Declaration */}
      <p className="mt-[5mm] border border-neutral-300 bg-neutral-50 px-[4mm] py-[3mm] text-[10.5pt] leading-relaxed text-neutral-800">
        <span className="font-bold text-brand-dark">ঘোষণা:</span>{" "}
        উক্ত টিম টুর্নামেন্টের সকল নিয়মাবলি মেনে অংশগ্রহণ করতে সম্মত আছে।
      </p>

      {/* Signatures */}
      <div className="mt-[6mm] flex break-inside-avoid gap-[8mm]">
        <SignatureBlock label="দায়িত্বশীল ব্যক্তির স্বাক্ষর" withDate dateText={printDate} />
        <SignatureBlock label="অধিনায়কের স্বাক্ষর" withDate dateText={printDate} />
        <SignatureBlock label="গ্রহণকারীর (আয়োজক) স্বাক্ষর ও সিল" withDate dateText={printDate} />
      </div>

      <footer className="mt-auto break-inside-avoid pt-[5mm]">
        <p className="border-t border-neutral-300 pt-[2mm] text-center text-[8.5pt] text-neutral-500">
          {org.nameBn}
          {org.address ? `, ${org.address}` : ""} · এই কপিটি দলের জন্য
        </p>
      </footer>
    </>
  );
}

/* ---------------- Modal shell ---------------- */

export default function TeamRegistrationPrint({
  mode = "combined",
  org,
  team,
  options,
  initialTournamentId,
  teamNameById,
  onClose,
}: {
  mode?: "tournament" | "combined";
  org: PrintOrgInfo;
  /** Required in "combined" mode; unused in "tournament" mode. */
  team?: PrintTeamInfo;
  options: PrintOption[];
  initialTournamentId: string;
  /** Team id-to-name lookup, used only for the রানার্স-আপ row
   * on Sheet A when a name can be resolved. */
  teamNameById?: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  // The modal mounts fresh for every print (the parent renders
  // it conditionally), so the initial tournament is simply the
  // starting state — no sync effect needed.
  const [tournamentId, setTournamentId] = useState(initialTournamentId);
  const chosen =
    options.find((o) => o.tournament.id === tournamentId) ?? options[0];

  // Direct PDF download (v170): the sheet node is rasterised
  // and saved as one A4 page; the button shows a busy label
  // and any failure lands in downloadError, never silently.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!chosen) return null;
  if (mode === "combined" && !team) return null;
  const tr = chosen.tournament;

  // File names are ASCII slugs (see asciiFileSlug): a name
  // part slugged from the display name when it has Latin
  // letters or digits, else a fixed fallback (the season for
  // a tournament, the Team ID for a registration).
  const downloadStem =
    mode === "tournament"
      ? `tournament-${asciiFileSlug(tr.name) || asciiFileSlug(tr.season ?? "") || "sheet"}`
      : `team-registration-${asciiFileSlug(team?.name ?? "") || chosen.code || "sheet"}`;

  const handleDownload = async () => {
    const sheetEl = sheetRef.current;
    if (!sheetEl || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadSheetPdf(sheetEl, downloadStem);
    } catch {
      setDownloadError("ডাউনলোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div id="team-registration-print-modal" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <style>{`
        #team-registration-print-sheet, #team-registration-print-sheet * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          #root { display: none !important; }
          body * { visibility: hidden; }
          #team-registration-print-modal {
            position: static !important; overflow: visible !important;
            background: transparent !important; padding: 0 !important;
          }
          #team-registration-print-toolbar { display: none !important; }
          #team-registration-print-sheet, #team-registration-print-sheet * { visibility: visible; }
          /* Margin-robust sizing (v174): the sheet takes the
             page content box's width and height instead of a
             fixed 210×297mm, so a print path that imposes
             margins reflows the sheet inside the box instead
             of clipping it. At margin 0 the content box IS
             A4, so output is unchanged. (100vh in print is
             the content-box height.) */
          #team-registration-print-modal > div {
            width: 100% !important; max-width: 100% !important;
          }
          #team-registration-print-sheet {
            margin: 0; box-shadow: none; border: none; padding-bottom: 10mm;
            width: 100% !important; max-width: 100% !important; min-height: 100vh;
          }
        }
        @page { size: A4; margin: 0; }
      `}</style>
      <div className="mx-auto w-fit max-w-full">
        <div id="team-registration-print-toolbar" className="mb-3 flex flex-wrap items-center gap-2">
          {mode === "combined" && options.length > 1 && (
            <select
              aria-label="প্রিন্টের জন্য টুর্নামেন্ট বাছুন"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={chosen.tournament.id}
              onChange={(e) => setTournamentId(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.tournament.id} value={o.tournament.id}>
                  {o.tournament.name}
                  {o.code ? ` — Team ID: ${o.code}` : ""}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            প্রিন্ট করুন
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand disabled:cursor-wait disabled:opacity-60"
          >
            {downloading ? "অপেক্ষা করুন…" : "ডাউনলোড"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700"
          >
            বন্ধ করুন
          </button>
          {downloadError && (
            <p
              role="alert"
              className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-600"
            >
              {downloadError}
            </p>
          )}
        </div>

        <div
          ref={sheetRef}
          id="team-registration-print-sheet"
          className="flex min-h-[297mm] w-[210mm] max-w-full flex-col bg-white p-[14mm] shadow-xl"
        >
          {mode === "tournament" ? (
            <TournamentInfoSheet org={org} tr={tr} teamNameById={teamNameById} />
          ) : (
            team && (
              <TeamRegistrationSheet
                org={org}
                tr={tr}
                team={team}
                code={chosen.code}
              />
            )
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
