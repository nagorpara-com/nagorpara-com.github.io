import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type { Member } from "../types/database.types";
import type { MemberPayload } from "../utils/member";

const MEMBER_COLUMNS =
  "id, name, photo_url, phone, facebook_url, is_phone_public, address, joined_date, is_active, display_order, created_at";
/** Pre-0030 shape: until migration 0030 applies, the members
 *  table has no facebook_url column. Reads/writes fall back to
 *  this column set so member management keeps working; only the
 *  message link itself waits for the migration. */
const MEMBER_COLUMNS_LEGACY =
  "id, name, photo_url, phone, is_phone_public, address, joined_date, is_active, display_order, created_at";

const isMissingLinkColumn = (message: string) => message.includes("facebook_url");

/** The payload without the (possibly not-yet-existing) link. */
function stripLink(payload: MemberPayload): Omit<MemberPayload, "facebook_url"> {
  const rest: Record<string, unknown> = { ...payload };
  delete rest.facebook_url;
  return rest as Omit<MemberPayload, "facebook_url">;
}

export interface MemberWriteResult {
  error: string | null;
  /** True when the member saved but the message link could not
   *  (migration 0030 not applied yet). */
  linkSkipped: boolean;
}

const NOT_SAVED =
  "সংরক্ষণ হয়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই (শুধু Admin পারবে)। আবার চেষ্টা করুন।";
const NOT_VERIFIED = "লেখা হয়েছে, কিন্তু Database থেকে পুনরায় পড়ে যাচাই করা যায়নি — তালিকা আবার লোড করে অবস্থা দেখে নিন।";
const NOT_DELETED =
  "মোছা যায়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই (শুধু Admin পারবে)।";

/** Reads one member back by id, or null when it is gone. */
async function readMemberById(id: string): Promise<Member | null> {
  if (!supabase) return null;
  const full = await supabase.from("members").select(MEMBER_COLUMNS).eq("id", id);
  if (!full.error && full.data && full.data.length > 0) return full.data[0] as Member;
  if (full.error && isMissingLinkColumn(full.error.message)) {
    const legacy = await supabase.from("members").select(MEMBER_COLUMNS_LEGACY).eq("id", id);
    if (!legacy.error && legacy.data && legacy.data.length > 0) {
      return { ...(legacy.data[0] as Member), facebook_url: null };
    }
  }
  return null;
}

/** Every submitted field must match the stored row exactly. */
function memberMatches(row: Member, payload: MemberPayload): boolean {
  return (Object.entries(payload) as [keyof MemberPayload, unknown][]).every(
    ([key, value]) => (row[key as keyof Member] ?? null) === (value ?? null),
  );
}

/**
 * Admin member registry (R-07). Reads run under the caller's
 * JWT — the admin write policy (is_admin()) is what lets an
 * admin see inactive members too (permissive SELECT policies
 * combine). Every write is enforced by the database policy
 * "members: admin writes"; this hook adds no authority.
 */
export function useAdminMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase সংযোগ সেট করা হয়নি — সদস্য তালিকা লোড করা যাচ্ছে না।");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let { data, error: pagedError } = await fetchAllRows((from, to) =>
      supabase!
        .from("members")
        .select(MEMBER_COLUMNS)
        .order("display_order")
        .order("name")
        .range(from, to),
    );
    if (pagedError && isMissingLinkColumn(pagedError)) {
      ({ data, error: pagedError } = await fetchAllRows((from, to) =>
        supabase!
          .from("members")
          .select(MEMBER_COLUMNS_LEGACY)
          .order("display_order")
          .order("name")
          .range(from, to),
      ));
      if (data) data = data.map((r) => ({ ...(r as Record<string, unknown>), facebook_url: null }));
    }
    const queryError = pagedError ? { message: pagedError } : null;
    if (id !== requestId.current) return;
    if (queryError) {
      setError(queryError.message);
      setMembers([]);
    } else {
      setMembers((data ?? []) as Member[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createMember = useCallback(
    async (payload: MemberPayload): Promise<MemberWriteResult> => {
      if (!supabase) return { error: "Supabase সংযুক্ত নয়।", linkSkipped: false };
      let used: MemberPayload | Omit<MemberPayload, "facebook_url"> = payload;
      let linkSkipped = false;
      let { data: inserted, error: insertError } = await supabase
        .from("members")
        .insert(payload)
        .select("id")
        .single();
      if (insertError && isMissingLinkColumn(insertError.message)) {
        // Migration 0030 not applied yet: save the member without
        // the link instead of failing the whole write.
        used = stripLink(payload);
        linkSkipped = true;
        ({ data: inserted, error: insertError } = await supabase
          .from("members")
          .insert(used)
          .select("id")
          .single());
      }
      if (insertError) return { error: insertError.message, linkSkipped: false };
      // Read-back verification (Section 04 Item 2): success is
      // claimed only when the stored row matches the submission.
      const back = inserted?.id ? await readMemberById(inserted.id as string) : null;
      if (!back || !memberMatches(back, used as MemberPayload)) {
        await reload();
        return { error: NOT_VERIFIED, linkSkipped: false };
      }
      await reload();
      return { error: null, linkSkipped };
    },
    [reload],
  );

  const updateMember = useCallback(
    async (id: string, payload: MemberPayload): Promise<MemberWriteResult> => {
      if (!supabase) return { error: "Supabase সংযুক্ত নয়।", linkSkipped: false };
      let used: MemberPayload | Omit<MemberPayload, "facebook_url"> = payload;
      let linkSkipped = false;
      let { data: updated, error: updateError } = await supabase
        .from("members")
        .update(payload)
        .eq("id", id)
        .select("id");
      if (updateError && isMissingLinkColumn(updateError.message)) {
        used = stripLink(payload);
        linkSkipped = true;
        ({ data: updated, error: updateError } = await supabase
          .from("members")
          .update(used)
          .eq("id", id)
          .select("id"));
      }
      if (updateError) return { error: updateError.message, linkSkipped: false };
      // Zero affected rows (missing record or RLS) is NOT a success.
      if (!updated || updated.length === 0) return { error: NOT_SAVED, linkSkipped: false };
      const back = await readMemberById(id);
      if (!back || !memberMatches(back, used as MemberPayload)) {
        await reload();
        return { error: NOT_VERIFIED, linkSkipped: false };
      }
      await reload();
      return { error: null, linkSkipped };
    },
    [reload],
  );

  const setMemberActive = useCallback(
    async (id: string, active: boolean): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data: updated, error: updateError } = await supabase
        .from("members")
        .update({ is_active: active })
        .eq("id", id)
        .select("id");
      if (updateError) return updateError.message;
      if (!updated || updated.length === 0) return NOT_SAVED;
      const back = await readMemberById(id);
      if (!back || back.is_active !== active) return NOT_VERIFIED;
      // Local state takes the verified row, not an optimistic guess.
      setMembers((prev) => prev.map((m) => (m.id === id ? back : m)));
      return null;
    },
    [],
  );

  /** Hard delete. Guarded by the database policy; finance
   *  rows referencing the member keep their history
   *  (member_id is ON DELETE SET NULL in the schema). */
  const deleteMember = useCallback(
    async (id: string): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const { data: deleted, error: deleteError } = await supabase
        .from("members")
        .delete()
        .eq("id", id)
        .select("id");
      if (deleteError) return deleteError.message;
      if (!deleted || deleted.length === 0) return NOT_DELETED;
      // Verified gone before success is claimed.
      const back = await readMemberById(id);
      if (back) return NOT_VERIFIED;
      setMembers((prev) => prev.filter((m) => m.id !== id));
      return null;
    },
    [],
  );

  return {
    members,
    loading,
    error,
    isConfigured: isSupabaseConfigured,
    reload,
    createMember,
    updateMember,
    setMemberActive,
    deleteMember,
  };
}
