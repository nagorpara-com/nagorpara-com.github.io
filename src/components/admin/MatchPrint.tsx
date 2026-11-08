import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Match, Sport, Tournament } from "../../types/database.types";
import type {
  PrintOrgInfo,
  PrintTeamInfo,
} from "./TeamRegistrationPrint";
import { MATCH_STATUS_LABELS_BN } from "../../utils/matchDisplay";
import { toBn } from "../../utils/format";
import {
  asciiFileSlug,
  downloadSheetPdf,
} from "../../utils/downloadSheetPdf";

/**
 * Match print sheet (owner's instruction, 2026-11-05; v169):
 * the registration print (TeamRegistrationPrint, Sheet B) is
 * handed to a team when it REGISTERS, so it may carry only
 * registration-time information. This sheet is the companion
 * for MATCH CREATION: one professional A4 page (same design
 * system as the v168 sheets — shared masthead style, green
 * title band, structured label-value tables, 210mm wide,
 * 14mm margins) carrying the fixture (tournament band, a
 * centre VS block with both teams' Team IDs, and the ম্যাচের
 * তথ্য table) TOGETHER WITH both teams' registration
 * information, so the printed copy shows who is playing and
 * how each team registered.
 *
 * A match is only SCHEDULED at creation, so this sheet never
 * prints scores, goals, results or a winner — even when it is
 * opened later for a played match, it stays a fixture /
 * registration sheet.
 *
 * An outside opponent (team B not picked, the প্রতিপক্ষ text
 * set instead) shows its name with a "বাইরের টিম" note in the
 * VS block and gets NO registration block — only registered
 * sides have registration information to print.
 *
 * Rendered in a portal modal; the @media print rules below
 * print ONLY the sheet (the v168 isolation: the app root is
 * removed from the print layout, the toolbar is hidden, and
 * the sheet stays in normal flow so it paginates cleanly
 * instead of being clipped or repeated). Beside প্রিন্ট
 * করুন, the toolbar's ডাউনলোড button (owner's request,
 * v170) saves the same sheet directly as a one-page A4 PDF
 * (see utils/downloadSheetPdf) with no print dialog.
 * v174 (owner's print fixes): the signature তারিখ line
 * auto-fills the print day's date, the printed sheet sizes
 * to the page content box so imposed print margins reflow
 * instead of clipping, and a bare-year মৌসুম prints in
 * Bengali digits.
 */

export interface MatchPrintSide {
  /** Display name of this side (team name, or the outside
   * opponent's free-text name). */
  name: string;
  /** The side's registration information when it is a
   * registered team; null for an outside opponent. */
  team: PrintTeamInfo | null;
  /** The side's Team ID on its entry in the match's
   * tournament; null when it carries no ID there. */
  code: string | null;
  /** True when this side is an outside (unregistered)
   * opponent named by the match's প্রতিপক্ষ text. */
  outside: boolean;
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
    : d.toLocaleDateString("bn-BD", { dateStyle: "long" });
}

function bnTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" });
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

/** মৌসুম as printed on the sheet: a bare 4-digit year is
 * rendered in Bengali digits like every other number on the
 * sheet (owner's print fix, v174); any other stored text is
 * printed unchanged. */
const seasonText = (v: string | null | undefined): string =>
  v && /^\d{4}$/.test(v) ? toBn(v) : dash(v);

/** Today's date in Asia/Dhaka, in the same long Bengali form
 * bnDate produces — auto-filled onto the signature তারিখ
 * line so a printed or downloaded sheet always carries the
 * day it was produced (owner's print rule, 2026-11-05).
 * Stored/entered dates are never affected by this. */
function printDayDate(): string {
  return new Date().toLocaleDateString("bn-BD", {
    dateStyle: "long",
    timeZone: "Asia/Dhaka",
  });
}

/* ---------------- Shared document pieces (v168 system) ---------------- */

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
      <div className="mt-[1.8mm] border-b-[2.2pt] border-[#F3C64E]" />
      <div className="mt-[0.7mm] border-b-[0.75pt] border-brand" />
    </header>
  );
}

/** Green document title band. */
function TitleBand({ label, title }: { label?: string; title: string }) {
  return (
    <div className="mt-[3.5mm] break-inside-avoid bg-brand px-[5mm] py-[1.8mm] text-white">
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
    <div className="border border-neutral-300 leading-[1.3]">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`grid grid-cols-[44mm_1fr] ${i > 0 ? "border-t border-neutral-300" : ""}`}
        >
          <div className="bg-brand-light px-[3.5mm] py-[0.6mm] text-[9pt] font-semibold text-brand-dark">
            {r.label}
          </div>
          <div className="px-[3.5mm] py-[0.6mm] text-[9.5pt] font-medium text-neutral-900">
            {r.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One signature block: signing space, rule, label. */
function SignatureBlock({ label }: { label: string }) {
  return (
    <div className="min-w-0 flex-1 break-inside-avoid">
      <div className="h-[2mm]" />
      <div className="border-t border-neutral-600 pt-[1.2mm] text-center text-[9.5pt] font-semibold text-neutral-700">
        {label}
      </div>
    </div>
  );
}

/* ---------------- Match sheet pieces ---------------- */

/** One side of the VS block: logo, name, and the Team ID
 * badge (or the no-ID line / outside-opponent note). */
function VsSide({ side }: { side: MatchPrintSide }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      {side.team?.logoUrl ? (
        <img
          src={side.team.logoUrl}
          alt=""
          className="h-[10mm] w-[10mm] object-contain"
        />
      ) : (
        <div className="h-[10mm]" />
      )}
      <p className="mt-[1mm] text-[12pt] font-black leading-snug text-brand-dark">
        {side.name}
      </p>
      <div className="mt-[1.5mm]">
        {side.outside ? (
          <p className="text-[9.5pt] font-semibold text-neutral-500">বাইরের টিম</p>
        ) : side.team ? (
          side.code ? (
            <span className="inline-flex items-baseline gap-[2mm] rounded-[1.2mm] border-[0.45mm] border-brand px-[3.5mm] py-[1mm]">
              <span className="text-[8pt] font-bold uppercase tracking-[0.18em] text-neutral-500">
                Team ID
              </span>
              <span className="text-[12.5pt] font-black leading-none text-brand-dark">
                {side.code}
              </span>
            </span>
          ) : (
            <p className="text-[9.5pt] font-semibold text-neutral-500">
              Team ID বরাদ্দ হয়নি
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}

/** One registered side's registration block: a header row
 * (team name + Team ID chip + logo) over the same
 * registration table the registration sheet prints. */
function RegistrationBlock({ side }: { side: MatchPrintSide }) {
  const team = side.team;
  if (!team) return null;
  const rows: InfoRow[] = [
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
  ];
  return (
    <div className="break-inside-avoid">
      <div className="flex items-center justify-between gap-[4mm]">
        <p className="min-w-0 text-[11.5pt] font-bold text-neutral-900">
          {team.name}
          <span className="ml-[3mm] whitespace-nowrap text-[9.5pt] font-bold text-brand-dark">
            {side.code ? `Team ID: ${side.code}` : "Team ID বরাদ্দ হয়নি"}
          </span>
        </p>
        {team.logoUrl && (
          <img
            src={team.logoUrl}
            alt=""
            className="h-[7mm] w-[7mm] shrink-0 object-contain"
          />
        )}
      </div>
      <div className="mt-[1.6mm]">
        <InfoTable rows={rows} />
      </div>
    </div>
  );
}

/* ---------------- The sheet ---------------- */

function MatchSheet({
  org,
  match,
  tournament,
  sideA,
  sideB,
}: {
  org: PrintOrgInfo;
  match: Match;
  tournament: Tournament | null;
  sideA: MatchPrintSide;
  sideB: MatchPrintSide;
}) {
  const fixture = sideA.team
    ? `${sideA.name} বনাম ${sideB.name}`
    : `বনাম ${sideB.name}`;
  const printDate = printDayDate();

  const bandPairs: { label: string; value: React.ReactNode }[] = [
    { label: "খেলা", value: SPORT_LABELS[match.sport] },
    { label: "মৌসুম", value: seasonText(tournament?.season) },
    {
      label: "ফরম্যাট",
      value: tournament?.format
        ? (FORMAT_LABELS_BN[tournament.format] ?? tournament.format)
        : "—",
    },
  ];

  const matchRows: InfoRow[] = [
    { label: "রাউন্ড", value: dash(match.round) },
    { label: "তারিখ", value: bnDate(match.match_date) },
    { label: "সময়", value: bnTime(match.match_date) },
    { label: "মাঠ / ভেন্যু", value: dash(match.venue ?? tournament?.venue) },
    { label: "অবস্থা", value: MATCH_STATUS_LABELS_BN[match.status] },
  ];
  if (sideB.outside && match.opponent && match.opponent.trim()) {
    matchRows.push({ label: "প্রতিপক্ষ", value: match.opponent });
  }

  const registeredSides = [sideA, sideB].filter((s) => s.team);

  return (
    <>
      <Masthead org={org} />
      <TitleBand label="ম্যাচের তথ্য" title={fixture} />

      {/* Tournament band — which tournament this fixture
          belongs to. */}
      <div className="mt-[2.5mm] break-inside-avoid border border-brand/30 bg-brand-light/60 px-[4.5mm] py-[1.6mm]">
        <p className="text-[10.5pt]">
          <span className="font-semibold text-brand-dark">টুর্নামেন্টের নাম:</span>{" "}
          <span className="font-bold text-neutral-900">
            {tournament ? tournament.name : "—"}
          </span>
        </p>
        <div className="mt-[1.2mm] grid grid-cols-3 gap-x-[8mm] text-[10pt]">
          {bandPairs.map((p) => (
            <p key={p.label}>
              <span className="font-semibold text-brand-dark">{p.label}:</span>{" "}
              <span className="font-medium text-neutral-900">{p.value}</span>
            </p>
          ))}
        </div>
      </div>

      {/* VS block */}
      <div className="mt-[2.5mm] flex break-inside-avoid items-start gap-[4mm]">
        <VsSide side={sideA} />
        <div className="flex h-[10mm] shrink-0 items-center">
          <span className="rounded-full bg-brand px-[3.5mm] py-[1.6mm] text-[10.5pt] font-bold text-white">
            বনাম
          </span>
        </div>
        <VsSide side={sideB} />
      </div>

      {/* Match information */}
      <div className="mt-[3mm]">
        <SectionHeading>ম্যাচের তথ্য</SectionHeading>
        <div className="mt-[1.8mm]">
          <InfoTable rows={matchRows} />
        </div>
      </div>

      {/* Registration information of the registered sides */}
      {registeredSides.length > 0 && (
        <div className="mt-[3mm]">
          <SectionHeading>
            {registeredSides.length === 2
              ? "দুই টিমের নিবন্ধন তথ্য"
              : "টিমের নিবন্ধন তথ্য"}
          </SectionHeading>
          <div className="mt-[2mm] space-y-[2mm]">
            {registeredSides.map((s) => (
              <RegistrationBlock key={s.team?.name ?? s.name} side={s} />
            ))}
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="mt-[3mm] flex break-inside-avoid gap-[12mm]">
        <SignatureBlock label="আয়োজকের স্বাক্ষর" />
        <div className="min-w-0 flex-1">
          <div className="h-[2mm]" />
          <div className="border-t border-neutral-600 pt-[1.2mm] text-center text-[9.5pt] font-semibold text-neutral-700">
            তারিখ: {printDate}
          </div>
        </div>
      </div>

      <footer className="mt-auto break-inside-avoid pt-[2mm]">
        <p className="border-t border-neutral-300 pt-[2mm] text-center text-[8.5pt] text-neutral-500">
          {org.nameBn} — {org.tagline && org.tagline.trim() ? org.tagline : "ক্রীড়া প্রতিযোগিতা"}
        </p>
      </footer>
    </>
  );
}

/* ---------------- Modal shell ---------------- */

export default function MatchPrint({
  org,
  match,
  tournament,
  sideA,
  sideB,
  onClose,
}: {
  org: PrintOrgInfo;
  match: Match;
  tournament: Tournament | null;
  sideA: MatchPrintSide;
  sideB: MatchPrintSide;
  onClose: () => void;
}) {
  // Direct PDF download (v170): the sheet node is rasterised
  // and saved as one A4 page; the button shows a busy label
  // and any failure lands in downloadError, never silently.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // File names are ASCII slugs (see asciiFileSlug): each
  // side slugged from its display name when it has Latin
  // letters or digits, else its Team ID, else "team".
  const sideSlug = (side: MatchPrintSide) =>
    asciiFileSlug(side.name) || side.code || "team";
  const downloadStem = `match-${sideSlug(sideA)}-vs-${sideSlug(sideB)}`;

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
    <div id="match-print-modal" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <style>{`
        #match-print-sheet, #match-print-sheet * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          #root { display: none !important; }
          body * { visibility: hidden; }
          #match-print-modal {
            position: static !important; overflow: visible !important;
            background: transparent !important; padding: 0 !important;
          }
          #match-print-toolbar { display: none !important; }
          #match-print-sheet, #match-print-sheet * { visibility: visible; }
          /* Margin-robust sizing (v174): the sheet takes the
             page content box's width and height instead of a
             fixed 210×297mm, so a print path that imposes
             margins reflows the sheet inside the box instead
             of clipping it. At margin 0 the content box IS
             A4, so output is unchanged. (100vh in print is
             the content-box height.) */
          #match-print-modal > div {
            width: 100% !important; max-width: 100% !important;
          }
          #match-print-sheet {
            margin: 0; box-shadow: none; border: none; padding-bottom: 10mm;
            width: 100% !important; max-width: 100% !important; min-height: 100vh;
          }
        }
        @page { size: A4; margin: 0; }
      `}</style>
      <div className="mx-auto w-fit max-w-full">
        <div id="match-print-toolbar" className="mb-3 flex flex-wrap items-center gap-2">
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
          id="match-print-sheet"
          className="flex min-h-[297mm] w-[210mm] max-w-full flex-col bg-white p-[14mm] shadow-xl"
        >
          <MatchSheet
            org={org}
            match={match}
            tournament={tournament}
            sideA={sideA}
            sideB={sideB}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
