/**
 * Finance form validation + payload (pure — unit-testable).
 *
 * Mirrors the schema: migration 0001 (type enum, amount numeric(12,2)
 * CHECK >= 0 — the form is stricter: > 0, max 2 decimals; txn_date;
 * member/donor/description) plus the F1 workflow design (migrations
 * 0018/0019, scratch-verified 2026-10-24): status, reference_no,
 * reversal_of / corrects_id links. Until those migrations are
 * applied the live schema has no status — the data hook detects
 * that and the workflow fields are simply not sent (legacy mode).
 *
 * NO finance formula lives here or anywhere in the client: every
 * total comes from the finance_summary view (balance =
 * (income + subscription + donation) − expense; withdrawal/transfer
 * informational only; the view counts approved records only).
 */
export const FINANCE_TYPES = [
  "income",
  "subscription",
  "donation",
  "expense",
  "withdrawal",
  "transfer",
] as const;

export type FinanceType = (typeof FINANCE_TYPES)[number];

export const FINANCE_TYPE_LABELS: Record<FinanceType, string> = {
  income: "আয়",
  subscription: "চাঁদা",
  donation: "অনুদান",
  expense: "ব্যয়",
  withdrawal: "উত্তোলন",
  transfer: "স্থানান্তর",
};

export const FINANCE_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

export const FINANCE_STATUS_LABELS: Record<FinanceStatus, string> = {
  draft: "Draft (খসড়া)",
  pending: "Pending (অনুমোদনের অপেক্ষায়)",
  approved: "Approved (অনুমোদিত)",
  rejected: "Rejected (প্রত্যাখ্যাত)",
  cancelled: "Cancelled (বাতিল)",
};

export interface FinanceInput {
  type: FinanceType;
  amount: string;
  txnDate: string;
  category: string;
  memberId: string;
  donorName: string;
  description: string;
  isPublic: boolean;
  /** Creation-time workflow choice (workflow mode only). */
  status?: "draft" | "pending";
  referenceNo?: string;
}

/** Parse a user-typed amount into a number of taka (max 2 decimals). */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[,৳\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function validateFinanceInput(input: FinanceInput): string | null {
  if (!FINANCE_TYPES.includes(input.type)) return "লেনদেনের ধরন সঠিক নয়।";
  const amount = parseAmount(input.amount);
  if (amount === null) return "সঠিক পরিমাণ দিন — সংখ্যা, সর্বোচ্চ দুই দশমিক ঘর (যেমন 1500 বা 1500.50)।";
  if (amount <= 0) return "পরিমাণ অবশ্যই ০-এর বেশি হতে হবে।";
  if (amount > 9999999999.99) return "পরিমাণটি অনুমোদিত সীমার চেয়ে বড়।";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.txnDate) || Number.isNaN(Date.parse(input.txnDate)))
    return "সঠিক তারিখ দিন।";
  if (input.category.trim().length > 80) return "Category ৮০ অক্ষরের মধ্যে রাখুন।";
  if (input.donorName.trim().length > 120) return "নাম ১২০ অক্ষরের মধ্যে রাখুন।";
  if (input.description.trim().length > 500) return "বিবরণ ৫০০ অক্ষরের মধ্যে রাখুন।";
  if (input.status !== undefined && input.status !== "draft" && input.status !== "pending")
    return "নতুন Record শুধু Draft বা Pending হিসেবে তৈরি করা যায়।";
  if ((input.referenceNo ?? "").trim().length > 60) return "Reference নম্বর ৬০ অক্ষরের মধ্যে রাখুন।";
  return null;
}

export function financePayload(input: FinanceInput, createdBy: string | null) {
  return {
    type: input.type,
    amount: parseAmount(input.amount),
    txn_date: input.txnDate,
    category: input.category.trim() || null,
    member_id: input.memberId || null,
    donor_name: input.donorName.trim() || null,
    description: input.description.trim() || null,
    is_public: input.isPublic,
    ...(input.status ? { status: input.status } : {}),
    ...(input.referenceNo !== undefined
      ? { reference_no: input.referenceNo.trim() || null }
      : {}),
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}

/**
 * Turn raw database/PostgREST errors (including the workflow guard
 * trigger's messages from migration 0018) into clear Bengali text.
 * Unknown errors pass through unchanged.
 */
export function friendlyFinanceError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("illegal finance status transition"))
    return "এই অবস্থা-পরিবর্তনটি অনুমোদিত নয় — Record-এর বর্তমান অবস্থা থেকে এই ধাপে যাওয়া যায় না।";
  if (m.includes("immutable"))
    return "অনুমোদিত (Approved) Record-এর পরিমাণ, ধরন বা তারিখ বদলানো যায় না — ভুল হলে Reversal ব্যবহার করুন।";
  if (m.includes("live reversal"))
    return "এই Record-এর একটি সক্রিয় Reversal আছে — আগে Reversal-টি মেটাতে হবে, তারপর Cancel করা যাবে।";
  if (m.includes("approved reversals cannot be cancelled"))
    return "অনুমোদিত Reversal সরাসরি বাতিল করা যায় না — Correction Entry ব্যবহার করুন।";
  if (m.includes("must target an approved"))
    return "Reversal বা Correction শুধু অনুমোদিত (Approved) Record-এর জন্য তৈরি করা যায়।";
  if (m.includes("finance_txn_reference_no_key"))
    return "এই Reference নম্বরটি ইতিমধ্যে অন্য একটি Record-এ ব্যবহৃত হয়েছে।";
  if (m.includes("finance_txn_corrects_key"))
    return "এই Reversal-এর জন্য ইতিমধ্যে একটি Correction তৈরি হয়েছে।";
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "আপনার Role-এর এই কাজের অনুমতি নেই (Finance Role প্রয়োজন)।";
  return raw;
}
