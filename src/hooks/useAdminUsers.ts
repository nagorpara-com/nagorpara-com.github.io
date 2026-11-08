import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { fetchAllRows } from "../utils/fetchAll";
import {
  guardUserChange,
  type AssignableRole,
  type ManagedUser,
  type UserChange,
} from "../utils/userAdmin";

/**
 * Admin data layer for Users & Permissions (Section 01, 2026-10-24).
 *
 * Reads/writes the EXISTING `profiles` table. RLS is the real gate:
 * only an admin can read the full list ("own row or admin reads")
 * or write ("profiles: only admin writes", migration 0012). This
 * hook adds the lockout-prevention guard (utils/userAdmin) at the
 * code layer too, and follows the verify_admin_writes discipline:
 * every update is read back by id and compared before success is
 * reported; a zero-row write is an honest failure.
 *
 * NOT possible here by design: creating login accounts or deleting
 * users (needs a service-role Edge Function — separate approval),
 * and reading other users' login emails (they live in auth.users).
 */

const NOT_SAVED =
  "সংরক্ষণ হয়নি: কোনো তথ্য পরিবর্তিত হয়নি — আপনার Role-এর এই অনুমতি নাও থাকতে পারে (RLS), অথবা ব্যবহারকারীটি আর নেই।";

export function useAdminUsers(actor: { id: string; role: string; is_active: boolean } | null) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchAllRows((from, to) =>
      supabase!
        .from("profiles")
        .select("id, full_name, phone, avatar_url, role, is_active, created_at")
        .order("created_at", { ascending: true })
        .range(from, to),
    );
    setLoading(false);
    if (res.error) {
      setLoadError(res.error);
      return;
    }
    setLoadError(null);
    setUsers((res.data ?? []) as ManagedUser[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const readBack = useCallback(async (id: string): Promise<ManagedUser | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, avatar_url, role, is_active, created_at")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return data as ManagedUser;
  }, []);

  const applyChange = useCallback(
    async (target: ManagedUser, change: UserChange): Promise<string | null> => {
      if (!supabase) return "Supabase সংযুক্ত নয়।";
      const blocked = guardUserChange({ actor, target, allUsers: users, change });
      if (blocked) return blocked;

      const patch: Record<string, unknown> =
        change.kind === "role"
          ? { role: change.role }
          : change.kind === "active"
            ? { is_active: change.isActive }
            : { full_name: change.fullName.trim(), phone: change.phone.trim() || null };

      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", target.id)
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        await reload();
        return NOT_SAVED;
      }
      const saved = await readBack(target.id);
      const matches =
        saved !== null &&
        Object.entries(patch).every(
          ([k, v]) => (saved as unknown as Record<string, unknown>)[k] === v,
        );
      if (!matches) {
        await reload();
        return "সংরক্ষণের যাচাই মেলেনি — তালিকা নতুন করে লোড করা হয়েছে, দেখে নিন।";
      }
      await reload();
      return null;
    },
    [actor, users, readBack, reload],
  );

  const setRole = useCallback(
    (target: ManagedUser, role: AssignableRole) =>
      applyChange(target, { kind: "role", role }),
    [applyChange],
  );
  const setActive = useCallback(
    (target: ManagedUser, isActive: boolean) =>
      applyChange(target, { kind: "active", isActive }),
    [applyChange],
  );
  const editProfile = useCallback(
    (target: ManagedUser, fullName: string, phone: string) =>
      applyChange(target, { kind: "profile", fullName, phone }),
    [applyChange],
  );

  return {
    isConfigured: isSupabaseConfigured,
    users,
    loading,
    loadError,
    reload,
    setRole,
    setActive,
    editProfile,
  };
}
