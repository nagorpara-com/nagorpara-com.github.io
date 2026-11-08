import type {
  Match,
  MatchEventType,
  Sport,
  Tournament,
} from "../types/database.types";

/** Shared Bengali display helpers for matches & tournaments (public site). */
export const SPORT_LABELS_BN: Record<Sport, string> = {
  football: "ফুটবল",
  cricket: "ক্রিকেট",
};

export const MATCH_STATUS_LABELS_BN: Record<Match["status"], string> = {
  upcoming: "আসন্ন",
  live: "চলমান",
  completed: "সমাপ্ত",
  postponed: "স্থগিত",
  rescheduled: "পুনর্নির্ধারিত",
  abandoned: "পরিত্যক্ত",
};

/** Timeline event labels (Step D, migration 0052) — text only,
 * no emojis, per the owner's icon rule for this site. */
export const EVENT_TYPE_LABELS_BN: Record<MatchEventType, string> = {
  goal: "গোল",
  penalty_goal: "পেনাল্টি গোল",
  own_goal: "আত্মঘাতী গোল",
  penalty_missed: "পেনাল্টি মিস",
  yellow_card: "হলুদ কার্ড",
  red_card: "লাল কার্ড",
  substitution: "বদলি",
  wicket: "উইকেট",
};

export const TOURNAMENT_STATUS_LABELS_BN: Record<Tournament["status"], string> = {
  upcoming: "আসন্ন",
  ongoing: "চলমান",
  completed: "সমাপ্ত",
};

export function formatMatchDate(iso: string | null): string {
  if (!iso) return "তারিখ নির্ধারিত নয়";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
}

/** Date-only value ("2026-01-05", e.g. tournament start/end) in Bengali. */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("bn-BD", { dateStyle: "medium" });
}
