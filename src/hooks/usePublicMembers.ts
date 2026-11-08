import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import type {
  CommitteeMember,
  CommitteeTerm,
  PublicMember,
} from "../types/database.types";

export interface PublicMembersData {
  loading: boolean;
  error: string | null;
  term: CommitteeTerm | null;
  committee: CommitteeMember[];
  members: PublicMember[];
}

/**
 * Public members & committee (R-07).
 *
 * Privacy by construction: the member list comes from the
 * `members_public` view — active members only, phone present
 * only when the member's number is marked public, address
 * never included. The committee shows the CURRENT term's
 * members (read from the `committee_public` view — active
 * rows only, with their public phone/Facebook); when no term is
 * marked current, all committee rows show, matching the
 * homepage preview's long-standing behaviour.
 */
export function usePublicMembers(): PublicMembersData {
  const [state, setState] = useState<PublicMembersData>({
    loading: true,
    error: null,
    term: null,
    committee: [],
    members: [],
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    void (async () => {
      const [membersRaw, termsRes, committeeRaw] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase!
            .from("members_public")
            .select("id, name, photo_url, phone, joined_date, display_order, facebook_url")
            .order("display_order")
            .order("name")
            .range(from, to),
        ),
        supabase!
          .from("committee_terms")
          .select("id, title, start_date, end_date, is_current, created_at")
          .eq("is_current", true)
          .limit(1),
        fetchAllRows((from, to) =>
          supabase!
            .from("committee_public")
            .select("id, term_id, member_id, name, role_title, photo_url, phone, facebook_url, display_order")
            .order("display_order")
            .order("name")
            .range(from, to),
        ),
      ]);
      // Until migration 0030 applies, members_public has no
      // facebook_url column and the select above fails — fall
      // back to the pre-0030 shape so the list keeps loading
      // (message links simply stay SMS-only until then).
      let membersRows = membersRaw.data;
      let membersErr = membersRaw.error;
      if (membersErr && membersErr.includes("facebook_url")) {
        const legacy = await fetchAllRows((from, to) =>
          supabase!
            .from("members_public")
            .select("id, name, photo_url, phone, joined_date, display_order")
            .order("display_order")
            .order("name")
            .range(from, to),
        );
        membersRows = legacy.data;
        membersErr = legacy.error;
      }
      const membersRes = {
        data: membersRows,
        error: membersErr ? { message: membersErr } : null,
      };
      const committeeRes = {
        data: committeeRaw.data,
        error: committeeRaw.error ? { message: committeeRaw.error } : null,
      };
      if (cancelled) return;
      const failed = membersRes.error || termsRes.error || committeeRes.error;
      const term = ((termsRes.data ?? []) as CommitteeTerm[])[0] ?? null;
      const allCommittee = (committeeRes.data ?? []) as CommitteeMember[];
      setState({
        loading: false,
        error: failed ? "তথ্য লোড করা যায়নি — কিছুক্ষণ পর আবার চেষ্টা করুন।" : null,
        term,
        committee: term
          ? allCommittee.filter((c) => c.term_id === term.id)
          : allCommittee,
        members: ((membersRes.data ?? []) as PublicMember[]).map((m) => ({
          ...m,
          facebook_url: m.facebook_url ?? null,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
