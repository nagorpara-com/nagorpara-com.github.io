import { Link } from "react-router-dom";
import SectionHeading from "./SectionHeading";
import EmptyState from "./EmptyState";
import { formatDateBn } from "../../utils/format";
import OpponentLabel from "../OpponentLabel";
import type { MatchRow } from "../../hooks/useHomepageData";

function MatchRowItem({ match, showResult }: { match: MatchRow; showResult: boolean }) {
  return (
    <li>
      <Link to={`/matches/${match.id}`} className="np-card np-card-hover flex items-center gap-3.5 p-3.5">
        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-brand text-white">
          <span className="text-sm font-bold leading-none">{match.match_date ? formatDateBn(match.match_date).split(" ")[0] : "—"}</span>
          <span className="mt-0.5 text-[10px] leading-none text-white/85">{match.match_date ? formatDateBn(match.match_date).replace(/^\S+\s*/, "") : ""}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-brand-dark">
            বনাম <OpponentLabel sport={match.sport} opponent={match.opponent} />
            <span className="ml-2 rounded bg-brand-light px-1.5 py-0.5 text-[11px] font-medium text-brand-dark">
              {match.sport === "cricket" ? "ক্রিকেট" : "ফুটবল"}
            </span>
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {showResult
              ? match.result ?? (match.our_score && match.opponent_score ? `${match.our_score} — ${match.opponent_score}` : "")
              : match.venue ?? ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Section 6 — upcoming matches + recent results, from published matches only. */
export default function MatchesPreview({
  upcoming,
  results,
  headingTitle,
}: {
  upcoming: MatchRow[];
  results: MatchRow[];
  headingTitle?: string;
}) {
  return (
    <section aria-label="আসন্ন ম্যাচ ও ফলাফল" className="mx-auto w-full max-w-7xl px-4 pt-12">
      <SectionHeading title={headingTitle ?? "আসন্ন ম্যাচ ও সাম্প্রতিক ফলাফল"} linkTo="/matches" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold text-brand-dark">আসন্ন ম্যাচ</h3>
          {upcoming.length === 0 ? (
            <EmptyState message="এখনো কোনো আসন্ন ম্যাচ নির্ধারিত হয়নি।" />
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((m) => (
                <MatchRowItem key={m.id} match={m} showResult={false} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-brand-dark">সাম্প্রতিক ফলাফল</h3>
          {results.length === 0 ? (
            <EmptyState message="এখনো কোনো সম্পন্ন ম্যাচের ফলাফল যোগ করা হয়নি।" />
          ) : (
            <ul className="space-y-2.5">
              {results.map((m) => (
                <MatchRowItem key={m.id} match={m} showResult />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
