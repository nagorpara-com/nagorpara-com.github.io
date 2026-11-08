import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type { CommitteeMember, CommitteeTerm } from "../types/database.types";
import type { CommitteePayload } from "../utils/member";

const ROW_COLUMNS =
  "id, term_id, member_id, name, role_title, photo_url, phone, facebook_url, is_active, display_order";

const NOT_SAVED =
  "সংরক্ষণ হয়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই (শুধু Admin পারবে)। আবার চেষ্টা করুন।";
const NOT_VERIFIED = "লেখা হয়েছে, কিন্তু Database থেকে পুনরায় পড়ে যাচাই করা যায়নি — তালিকা আবার লোড করে অবস্থা দেখে নিন।";
const NOT_DELETED =
  "মোছা যায়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই (শুধু Admin পারবে)।";

/** Reads one committee row back by id, or null when it is gone. */
async function readRowById(id: string): Promise<CommitteeMember | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("committee_members").select(ROW_COLUMNS).eq("id", id);
  if (error || !data || data.length === 0) return null;
  return data[0] as CommitteeMember;
}

function rowMatches(row: CommitteeMember, payload: CommitteePayload): boolean {
  return (Object.entries(payload) as [keyof CommitteePayload, unknown][]).every(
    ([key, value]) => (row[key as keyof CommitteeMember] ?? null) === (value ?? null),
  );
}

/**
 * Admin committee management (R-07). Committee members belong
 * to a term (committee_terms, term_id NOT NULL), so this hook
 * manages terms (create, edit, mark current) and the members of the
 * selected term. Writes are enforced by the database policies
 * ("committee terms/members: admin writes", is_admin()).
 *
 * Marking a term current first clears the flag on the others
 * (two writes; if the second fails the reload shows the real
 * state and the admin can retry — no partial state is hidden).
 */
export function useAdminCommittee() {
  const [terms, setTerms] = useState<CommitteeTerm[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [rows, setRows] = useState<CommitteeMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reloadTerms = useCallback(async (): Promise<CommitteeTerm[]> => {
    if (!supabase) return [];
    const { data, error: queryError } = await supabase
      .from("committee_terms")
      .select("id, title, start_date, end_date, is_current, created_at")
      .order("created_at", { ascending: false });
    if (queryError) {
      setError(queryError.message);
      return [];
    }
    const list = (data ?? []) as CommitteeTerm[];
    setTerms(list);
    return list;
  }, []);

  const reloadRows = useCallback(async (termId: string | null) => {
    if (!supabase || !termId) {
      setRows([]);
      return;
    }
    const { data, error: pagedError } = await fetchAllRows((from, to) =>
      supabase!
        .from("committee_members")
        .select("id, term_id, member_id, name, role_title, photo_url, phone, facebook_url, is_active, display_order")
        .eq("term_id", termId)
        .order("display_order")
        .order("name")
        .range(from, to),
    );
    const queryError = pagedError ? { message: pagedError } : null;
    if (queryError) {
      setError(queryError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as CommitteeMember[]);
    }
  }, []);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase সংযোগ সেট করা হয়নি — কমিটি লোড করা যাচ্ছে না।");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const list = await reloadTerms();
    if (id !== requestId.current) return;
    const current = list.find((t) => t.is_current) ?? list[0] ?? null;
    setSelectedTermId((prev) =>
      prev && list.some((t) => t.id === prev) ? prev : current?.id ?? null,
    );
    await reloadRows(
      (selectedTermId && list.some((t) => t.id === selectedTermId)
        ? selectedTermId
        : current?.id) ?? null,
    );
    setLoading(false);
    // selectedTermId intentionally read once per reload cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTerms, reloadRows]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectTerm = useCallback(
    async (termId: string) => {
      setSelectedTermId(termId);
      await reloadRows(termId);
    },
    [reloadRows],
  );

  const createTerm = useCallback(
    async (input: {
      title: string;
      start_date: string | null;
      end_date: string | null;
      make_current: boolean;
    }): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data, error: insertError } = await supabase
        .from("committee_terms")
        .insert({
          title: input.title,
          start_date: input.start_date,
          end_date: input.end_date,
          is_current: false,
        })
        .select("id")
        .single();
      if (insertError) return insertError.message;
      const newId = (data as { id: string }).id;
      // Read-back: the stored term must match the submission before
      // success is claimed (Section 04 Item 2).
      const { data: stored, error: readError } = await supabase
        .from("committee_terms")
        .select("id, title, start_date, end_date, is_current")
        .eq("id", newId);
      const term = !readError && stored && stored.length > 0 ? (stored[0] as CommitteeTerm) : null;
      if (
        !term ||
        term.title !== input.title ||
        (term.start_date ?? null) !== (input.start_date ?? null) ||
        (term.end_date ?? null) !== (input.end_date ?? null) ||
        term.is_current !== false
      ) {
        await reloadTerms();
        return NOT_VERIFIED;
      }
      if (input.make_current) {
        const err = await setCurrentTerm(newId);
        if (err) return err;
      }
      await reloadTerms();
      setSelectedTermId(newId);
      await reloadRows(newId);
      return null;
    },
    [reloadTerms, reloadRows],
  );

  const setCurrentTerm = useCallback(
    async (termId: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      // Step 1: clear the flag elsewhere. Zero rows is fine here
      // (there may be no current term yet).
      const { error: clearError } = await supabase
        .from("committee_terms")
        .update({ is_current: false })
        .eq("is_current", true)
        .select("id");
      if (clearError) return clearError.message;
      // Step 2: mark the chosen term. Zero rows here means the
      // term is missing or the write was refused — the clear in
      // step 1 may already have happened, so say so honestly.
      const { data: marked, error: setError } = await supabase
        .from("committee_terms")
        .update({ is_current: true })
        .eq("id", termId)
        .select("id");
      if (setError) return setError.message;
      if (!marked || marked.length === 0) {
        await reloadTerms();
        return "নতুন মেয়াদকে বর্তমান করা যায়নি — আগের বর্তমান চিহ্ন সরানো হয়ে থাকতে পারে। তালিকা আবার লোড করা হয়েছে; দেখে আবার চেষ্টা করুন।";
      }
      // Verify the end state from the database: exactly one
      // current term, and it is the chosen one.
      const list = await reloadTerms();
      const currents = list.filter((t) => t.is_current);
      if (currents.length !== 1 || currents[0].id !== termId) {
        return "বর্তমান মেয়াদের অবস্থা যাচাই করা যায়নি — তালিকা আবার লোড করে দেখে নিন।";
      }
      return null;
    },
    [reloadTerms],
  );

  /**
   * Rename / re-date an existing term. Same write-verification
   * discipline as the other writes: the update must affect the
   * row, then the stored row is read back and compared field by
   * field before success is claimed. reloadTerms() then refreshes
   * every place the title shows (select labels, list heading).
   */
  const updateTerm = useCallback(
    async (
      termId: string,
      input: { title: string; start_date: string | null; end_date: string | null },
    ): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data: updated, error: updateError } = await supabase
        .from("committee_terms")
        .update({
          title: input.title,
          start_date: input.start_date,
          end_date: input.end_date,
        })
        .eq("id", termId)
        .select("id");
      if (updateError) return updateError.message;
      if (!updated || updated.length === 0) return NOT_SAVED;
      const { data: stored, error: readError } = await supabase
        .from("committee_terms")
        .select("id, title, start_date, end_date, is_current")
        .eq("id", termId);
      const term = !readError && stored && stored.length > 0 ? (stored[0] as CommitteeTerm) : null;
      if (
        !term ||
        term.title !== input.title ||
        (term.start_date ?? null) !== (input.start_date ?? null) ||
        (term.end_date ?? null) !== (input.end_date ?? null)
      ) {
        await reloadTerms();
        return NOT_VERIFIED;
      }
      await reloadTerms();
      return null;
    },
    [reloadTerms],
  );

  const createRow = useCallback(
    async (payload: CommitteePayload): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      if (!selectedTermId) return "আগে একটি মেয়াদ বেছে নিন বা তৈরি করুন।";
      const { data: inserted, error: insertError } = await supabase
        .from("committee_members")
        .insert({ ...payload, term_id: selectedTermId })
        .select("id")
        .single();
      if (insertError) return insertError.message;
      const back = inserted?.id ? await readRowById(inserted.id as string) : null;
      if (!back || !rowMatches(back, payload) || back.term_id !== selectedTermId) {
        await reloadRows(selectedTermId);
        return NOT_VERIFIED;
      }
      await reloadRows(selectedTermId);
      return null;
    },
    [reloadRows, selectedTermId],
  );

  const updateRow = useCallback(
    async (id: string, payload: CommitteePayload): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data: updated, error: updateError } = await supabase
        .from("committee_members")
        .update(payload)
        .eq("id", id)
        .select("id");
      if (updateError) return updateError.message;
      if (!updated || updated.length === 0) return NOT_SAVED;
      const back = await readRowById(id);
      if (!back || !rowMatches(back, payload)) {
        if (selectedTermId) await reloadRows(selectedTermId);
        return NOT_VERIFIED;
      }
      if (selectedTermId) await reloadRows(selectedTermId);
      return null;
    },
    [reloadRows, selectedTermId],
  );

  /** Publish / unpublish a committee row: only active rows
   *  reach the public website (the committee_public view). */
  const setRowActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data: updated, error: updateError } = await supabase
        .from("committee_members")
        .update({ is_active: active })
        .eq("id", id)
        .select("id");
      if (updateError) return updateError.message;
      if (!updated || updated.length === 0) return NOT_SAVED;
      const back = await readRowById(id);
      if (!back || back.is_active !== active) return NOT_VERIFIED;
      // Local state takes the verified row, not an optimistic guess.
      setRows((prev) => prev.map((r) => (r.id === id ? back : r)));
      return null;
    },
    [],
  );

  const deleteRow = useCallback(async (id: string): Promise<string | null> => {
    if (!supabase) return "Supabase সংযুক্ত নয়।";
    const { data: deleted, error: deleteError } = await supabase
      .from("committee_members")
      .delete()
      .eq("id", id)
      .select("id");
    if (deleteError) return deleteError.message;
    if (!deleted || deleted.length === 0) return NOT_DELETED;
    // Verified gone before success is claimed.
    const back = await readRowById(id);
    if (back) return NOT_VERIFIED;
    setRows((prev) => prev.filter((r) => r.id !== id));
    return null;
  }, []);

  return {
    terms,
    selectedTermId,
    rows,
    loading,
    error,
    isConfigured: isSupabaseConfigured,
    reload,
    selectTerm,
    createTerm,
    setCurrentTerm,
    updateTerm,
    createRow,
    updateRow,
    setRowActive,
    deleteRow,
  };
}
