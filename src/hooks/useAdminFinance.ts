import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import {
  financePayload,
  friendlyFinanceError,
  type FinanceInput,
  type FinanceStatus,
} from "../utils/finance";

/**
 * Admin data layer for Finance — Phase 4 CRUD + F1 workflow (2026-10-24).
 *
 * COMPATIBILITY (owner's rule): the workflow columns (status,
 * reference_no, reversal_of, corrects_id, approved_*, updated_at)
 * arrive with migrations 0018/0019, which are applied separately.
 * This hook DETECTS them: if the database does not have them yet it
 * runs in LEGACY mode — the exact Phase 4 behaviour (records count
 * immediately, edit/delete as before) — and the page shows a notice
 * that the workflow activates after the migration. Nothing about
 * the old database breaks.
 *
 * Write discipline (verify_admin_writes skill) is unchanged: every
 * create/update/status change/delete is read back by id and compared
 * before success is reported; zero-row writes are honest failures.
 * Errors pass through friendlyFinanceError (guard messages from the
 * 0018 trigger become clear Bengali). Totals are never computed
 * here — pages read the finance_summary view.
 */

export interface FinanceTxnRow {
  id: string;
  type: string;
  category: string | null;
  amount: number;
  txn_date: string;
  member_id: string | null;
  donor_name: string | null;
  description: string | null;
  is_public: boolean;
  created_at: string;
  // Workflow fields — null in legacy mode / pre-migration rows.
  status: FinanceStatus | null;
  reference_no: string | null;
  approved_by: string | null;
  approved_at: string | null;
  status_reason: string | null;
  reversal_of: string | null;
  corrects_id: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface FinanceAuditRow {
  id: string;
  transaction_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}

export interface MemberOption {
  id: string;
  name: string;
}

export const STALE_RESULT = "STALE_DATA";

const LEGACY_COLUMNS =
  "id, type, category, amount, txn_date, member_id, donor_name, description, is_public, created_at";
const WORKFLOW_COLUMNS =
  LEGACY_COLUMNS +
  ", status, reference_no, approved_by, approved_at, status_reason, reversal_of, corrects_id, updated_at, created_by";
const NOT_SAVED =
  "সংরক্ষণ হয়নি: কোনো তথ্য পরিবর্তিত হয়নি — আপনার Role-এর Finance পরিচালনার অনুমতি নাও থাকতে পারে (RLS), অথবা তথ্যটি আর নেই।";

function isMissingColumnError(message: string): boolean {
  return /does not exist|42703|could not find/i.test(message);
}

function fieldsMatch(row: object, payload: Record<string, unknown>): boolean {
  const rec = row as Record<string, unknown>;
  return Object.entries(payload).every(([key, value]) => {
    if (key === "created_by") return true;
    if (key === "amount") return Number(rec[key]) === Number(value);
    return rec[key] === value;
  });
}

function normalize(row: Record<string, unknown>): FinanceTxnRow {
  return {
    id: String(row.id),
    type: String(row.type),
    category: (row.category as string | null) ?? null,
    amount: Number(row.amount),
    txn_date: String(row.txn_date),
    member_id: (row.member_id as string | null) ?? null,
    donor_name: (row.donor_name as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    is_public: Boolean(row.is_public),
    created_at: String(row.created_at),
    status: (row.status as FinanceStatus | null) ?? null,
    reference_no: (row.reference_no as string | null) ?? null,
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    status_reason: (row.status_reason as string | null) ?? null,
    reversal_of: (row.reversal_of as string | null) ?? null,
    corrects_id: (row.corrects_id as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
  };
}

export function useAdminFinance() {
  const [rows, setRows] = useState<FinanceTxnRow[]>([]);
  const [auditRows, setAuditRows] = useState<FinanceAuditRow[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [workflowReady, setWorkflowReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const modeRef = useRef<boolean | null>(null);

  const columns = useCallback(
    () => (modeRef.current ? WORKFLOW_COLUMNS : LEGACY_COLUMNS),
    [],
  );

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Detect the workflow schema once (0018 applied or not).
    if (modeRef.current === null) {
      const probe = await supabase
        .from("finance_transactions")
        .select("status")
        .limit(1);
      modeRef.current = !probe.error;
      if (probe.error && !isMissingColumnError(probe.error.message)) {
        // Some other failure (e.g. RLS/network) — assume legacy shape
        // for this load; detection retries on the next reload.
        modeRef.current = false;
      }
      setWorkflowReady(modeRef.current);
    }
    const [txnRes, memberRes, auditRes, profileRes] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase!
          .from("finance_transactions")
          .select(columns())
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      supabase.from("members").select("id, name").order("name"),
      supabase
        .from("finance_audit_logs")
        .select("id, transaction_id, action, old_data, new_data, changed_by, changed_at")
        .order("changed_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("id, full_name"),
    ]);
    setLoading(false);
    if (txnRes.error) {
      // Detection may have been wrong (e.g. transient) — retry legacy.
      if (modeRef.current && isMissingColumnError(txnRes.error)) {
        modeRef.current = false;
        setWorkflowReady(false);
        void reload();
        return;
      }
      setLoadError(txnRes.error);
      return;
    }
    setLoadError(null);
    setRows(((txnRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalize));
    if (!memberRes.error && memberRes.data) {
      setMembers(memberRes.data as MemberOption[]);
    }
    if (!auditRes.error && auditRes.data) {
      setAuditRows(auditRes.data as FinanceAuditRow[]);
    }
    if (!profileRes.error && Array.isArray(profileRes.data)) {
      const map: Record<string, string> = {};
      for (const p of profileRes.data as Array<{ id: string; full_name: string }>) {
        map[p.id] = p.full_name;
      }
      setProfileNames(map);
    }
  }, [columns]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const readBack = useCallback(
    async (id: string): Promise<FinanceTxnRow | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("finance_transactions")
        .select(columns())
        .eq("id", id)
        .single();
      if (error || !data) return null;
      return normalize(data as unknown as Record<string, unknown>);
    },
    [columns],
  );

  const myId = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  }, []);

  /** Insert or update one form record (status is NOT changed by edit). */
  const writeRow = useCallback(
    async (
      input: FinanceInput,
      id: string | null,
      expectedUpdatedAt?: string | null,
    ): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      // Stale check (workflow mode): refuse to overwrite a record
      // that changed after the form was opened.
      if (id && modeRef.current && expectedUpdatedAt) {
        const current = await readBack(id);
        if (current && current.updated_at && current.updated_at !== expectedUpdatedAt) {
          return STALE_RESULT;
        }
      }
      const payload = financePayload(input, await myId()) as Record<string, unknown>;
      if (!modeRef.current) {
        delete payload.status;
        delete payload.reference_no;
      }
      let rowId = id;
      if (id) {
        const updatePayload = { ...payload };
        delete updatePayload.created_by;
        delete updatePayload.status; // status moves only via setStatus
        const { data, error } = await supabase
          .from("finance_transactions")
          .update(updatePayload)
          .eq("id", id)
          .select("id");
        if (error) return friendlyFinanceError(error.message);
        if (!data || data.length === 0) {
          await reload();
          return NOT_SAVED;
        }
      } else {
        const { data, error } = await supabase
          .from("finance_transactions")
          .insert(payload)
          .select("id");
        if (error) return friendlyFinanceError(error.message);
        rowId = (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
        if (!rowId) return NOT_SAVED;
      }
      if (!rowId) return NOT_SAVED;
      const saved = await readBack(rowId);
      const comparePayload = { ...payload };
      delete comparePayload.created_by;
      if (id) delete comparePayload.status;
      if (!saved || !fieldsMatch(saved, comparePayload)) {
        await reload();
        return "সংরক্ষণের যাচাই মেলেনি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      await reload();
      return null;
    },
    [myId, readBack, reload],
  );

  const createTxn = useCallback(
    (input: FinanceInput) => writeRow(input, null),
    [writeRow],
  );
  const editTxn = useCallback(
    (id: string, input: FinanceInput, expectedUpdatedAt?: string | null) =>
      writeRow(input, id, expectedUpdatedAt),
    [writeRow],
  );

  /** Workflow transition with read-back verification (0018 guard enforces legality). */
  const setStatus = useCallback(
    async (id: string, to: FinanceStatus, reason?: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      if (!modeRef.current) return "Workflow এখনো সক্রিয় নয় (Migration বাকি)।";
      const patch: Record<string, unknown> = { status: to };
      if (reason !== undefined) patch.status_reason = reason.trim() || null;
      const { data, error } = await supabase
        .from("finance_transactions")
        .update(patch)
        .eq("id", id)
        .select("id");
      if (error) return friendlyFinanceError(error.message);
      if (!data || data.length === 0) {
        await reload();
        return NOT_SAVED;
      }
      const saved = await readBack(id);
      if (!saved || saved.status !== to) {
        await reload();
        return "অবস্থা পরিবর্তনের যাচাই মেলেনি — তালিকা নতুন করে লোড করা হয়েছে।";
      }
      await reload();
      return null;
    },
    [readBack, reload],
  );

  /** Create a linked record (reversal or correction) as a Draft. */
  const createLinked = useCallback(
    async (
      source: FinanceTxnRow,
      link: "reversal_of" | "corrects_id",
      label: string,
    ): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      if (!modeRef.current) return "Workflow এখনো সক্রিয় নয় (Migration বাকি)।";
      const payload: Record<string, unknown> = {
        type: source.type,
        amount: source.amount,
        txn_date: source.txn_date,
        category: source.category,
        member_id: source.member_id,
        donor_name: source.donor_name,
        description: `${label}: ${source.description ?? source.category ?? ""}`.trim(),
        is_public: source.is_public,
        status: "draft",
        [link]: source.id,
        created_by: await myId(),
      };
      const { data, error } = await supabase
        .from("finance_transactions")
        .insert(payload)
        .select("id");
      if (error) return friendlyFinanceError(error.message);
      const rowId = (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
      if (!rowId) return NOT_SAVED;
      const saved = await readBack(rowId);
      if (
        !saved ||
        saved[link] !== source.id ||
        Number(saved.amount) !== Number(source.amount) ||
        saved.status !== "draft"
      ) {
        await reload();
        return "তৈরির যাচাই মেলেনি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      await reload();
      return null;
    },
    [myId, readBack, reload],
  );

  const createReversal = useCallback(
    (source: FinanceTxnRow) => createLinked(source, "reversal_of", "Reversal"),
    [createLinked],
  );
  const createCorrection = useCallback(
    (source: FinanceTxnRow) => createLinked(source, "corrects_id", "Correction"),
    [createLinked],
  );

  const deleteTxn = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error } = await supabase
        .from("finance_transactions")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) return friendlyFinanceError(error.message);
      if (!data || data.length === 0) {
        await reload();
        return NOT_SAVED;
      }
      const stillThere = await readBack(id);
      if (stillThere) {
        await reload();
        return "মুছে ফেলার যাচাই মেলেনি — তথ্যটি এখনো আছে।";
      }
      await reload();
      return null;
    },
    [readBack, reload],
  );

  return {
    isConfigured: isSupabaseConfigured,
    /** null while detecting; false = pre-migration legacy mode. */
    workflowReady,
    rows,
    auditRows,
    members,
    profileNames,
    loading,
    loadError,
    reload,
    createTxn,
    editTxn,
    setStatus,
    createReversal,
    createCorrection,
    deleteTxn,
  };
}
