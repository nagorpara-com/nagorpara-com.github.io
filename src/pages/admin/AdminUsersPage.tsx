import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  validateProfileEdit,
  type AssignableRole,
  type ManagedUser,
} from "../../utils/userAdmin";
import { formatDateBn } from "../../utils/format";

/**
 * Users & Permissions (Section 01, 2026-10-24) — replaces the
 * PhasePlaceholder on the EXISTING /admin/users route.
 *
 * Scope (honest): manage EXISTING users — roles, active state,
 * name/phone. Creating a login account or deleting a user needs a
 * service-role Edge Function (separate approval, not built here);
 * other users' login emails live in auth.users and are never shown.
 *
 * Security: RLS is the real gate (only admins can read the list or
 * write — migration 0012). On top of it, the lockout rules from
 * utils/userAdmin are enforced in the hook AND reflected here:
 * your own role select is disabled and you cannot deactivate
 * yourself — the last-admin protection sits in the same guard.
 */

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
const btnCls = "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";

type Confirm =
  | { userId: string; kind: "role"; role: AssignableRole }
  | { userId: string; kind: "active"; isActive: boolean }
  | null;

export default function AdminUsersPage() {
  const { loading: authLoading, profile } = useAuth();
  const actor = useMemo(
    () =>
      profile
        ? { id: profile.id, role: profile.role as string, is_active: profile.is_active }
        : null,
    [profile],
  );
  const usersApi = useAdminUsers(actor);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usersApi.users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      if (!q) return true;
      return (
        u.full_name.toLowerCase().includes(q) ||
        (u.phone ?? "").includes(q)
      );
    });
  }, [usersApi.users, search, roleFilter, statusFilter]);

  if (authLoading) {
    return <p className="py-16 text-center text-sm text-neutral-500">লোড হচ্ছে…</p>;
  }

  if (!profile || profile.role !== "admin") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="text-lg font-bold text-neutral-800">
          এই পেজটি শুধু Admin-এর জন্য
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          ব্যবহারকারী ও Role পরিচালনা শুধু Admin Role-এর ব্যবহারকারী করতে
          পারেন। আপনার বর্তমান Role:{" "}
          <span className="font-semibold">{profile?.role ?? "—"}</span>
        </p>
        <Link
          to="/admin"
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Dashboard-এ ফিরে যান
        </Link>
      </div>
    );
  }

  const act = async (run: () => Promise<string | null>, okText: string) => {
    setBusy(true);
    const err = await run();
    setBusy(false);
    setConfirm(null);
    if (err) {
      setMessage({ kind: "err", text: err });
      return;
    }
    setMessage({ kind: "ok", text: okText });
  };

  const startEdit = (u: ManagedUser) => {
    setEditingId(u.id);
    setEditName(u.full_name);
    setEditPhone(u.phone ?? "");
    setMessage(null);
  };

  const saveEdit = (u: ManagedUser) => {
    const problem = validateProfileEdit(editName, editPhone);
    if (problem) {
      setMessage({ kind: "err", text: problem });
      return;
    }
    void act(async () => {
      const err = await usersApi.editProfile(u, editName, editPhone);
      if (!err) setEditingId(null);
      return err;
    }, "তথ্য সংরক্ষিত হয়েছে (যাচাই সম্পন্ন)।");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">ব্যবহারকারী ও অনুমতি</h1>
              </div>

      {!usersApi.isConfigured ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase সংযুক্ত নয় — ব্যবহারকারীর তালিকা লোড করা যাচ্ছে না।
        </p>
      ) : usersApi.loadError ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          তথ্য লোড করা যায়নি: {usersApi.loadError}{" "}
          <button type="button" onClick={() => void usersApi.reload()} className="font-semibold underline">
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-neutral-800">
                সব ব্যবহারকারী ({visible.length})
              </h2>
              <div className="ml-auto flex flex-wrap gap-2">
                <select
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="all">সব Role</option>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">সব অবস্থা</option>
                  <option value="active">সক্রিয়</option>
                  <option value="inactive">নিষ্ক্রিয়</option>
                </select>
                <input
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  placeholder="নাম বা ফোন দিয়ে খুঁজুন"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {usersApi.loading ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">লোড হচ্ছে…</p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">
                কোনো ব্যবহারকারী পাওয়া যায়নি।
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visible.map((u) => {
                  const isSelf = actor?.id === u.id;
                  return (
                    <li key={u.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {u.full_name.trim().charAt(0) || "?"}
                        </span>
                        <span className="text-sm font-bold text-neutral-900">{u.full_name}</span>
                        {isSelf && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                            আপনি
                          </span>
                        )}
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            u.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {u.is_active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                        </span>
                        <span className="ml-auto flex flex-wrap items-center gap-1">
                          <select
                            aria-label={`${u.full_name}-এর Role`}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                            value={ASSIGNABLE_ROLES.includes(u.role as AssignableRole) ? u.role : "viewer"}
                            disabled={busy || isSelf}
                            title={isSelf ? "নিজের Role বদলানো যায় না" : "Role বদলান"}
                            onChange={(e) =>
                              setConfirm({ userId: u.id, kind: "role", role: e.target.value as AssignableRole })
                            }
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                          {u.is_active ? (
                            <button
                              type="button"
                              disabled={busy || isSelf}
                              title={isSelf ? "নিজেকে নিষ্ক্রিয় করা যায় না" : "নিষ্ক্রিয় করুন"}
                              onClick={() => setConfirm({ userId: u.id, kind: "active", isActive: false })}
                              className={`${btnCls} bg-red-50 text-red-600`}
                            >
                              নিষ্ক্রিয় করুন
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirm({ userId: u.id, kind: "active", isActive: true })}
                              className={`${btnCls} bg-green-100 text-green-800`}
                            >
                              সক্রিয় করুন
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEdit(u)}
                            className={`${btnCls} bg-slate-100 text-slate-700`}
                          >
                            তথ্য সম্পাদনা
                          </button>
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        ফোন: {u.phone ?? "—"} · যোগ দিয়েছেন: {formatDateBn(u.created_at.slice(0, 10))}
                        {isSelf ? " · নিজের Role ও সক্রিয় অবস্থা এখানে বদলানো যায় না (Lockout সুরক্ষা)" : ""}
                      </p>

                      {confirm && confirm.userId === u.id && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                          <span>
                            {confirm.kind === "role"
                              ? `নিশ্চিত তো? ${u.full_name}-এর Role হবে: ${ROLE_LABELS[confirm.role]}`
                              : confirm.isActive
                                ? `নিশ্চিত তো? ${u.full_name}-কে আবার সক্রিয় করা হবে।`
                                : `নিশ্চিত তো? ${u.full_name} আর Login করতে পারবেন না (তথ্য মুছবে না)।`}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () =>
                                  confirm.kind === "role"
                                    ? usersApi.setRole(u, confirm.role)
                                    : usersApi.setActive(u, confirm.isActive),
                                confirm.kind === "role"
                                  ? "Role পরিবর্তন সংরক্ষিত হয়েছে (যাচাই সম্পন্ন)।"
                                  : "অবস্থা পরিবর্তন সংরক্ষিত হয়েছে (যাচাই সম্পন্ন)।",
                              )
                            }
                            className={`${btnCls} bg-red-600 text-white`}
                          >
                            হ্যাঁ, নিশ্চিত
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirm(null)}
                            className={`${btnCls} bg-slate-200 text-slate-700`}
                          >
                            থাক
                          </button>
                        </div>
                      )}

                      {editingId === u.id && (
                        <div className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                          <label className="block text-xs font-medium text-neutral-600">
                            নাম
                            <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} />
                          </label>
                          <label className="block text-xs font-medium text-neutral-600">
                            ফোন
                            <input
                              className={inputCls}
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              placeholder="01XXXXXXXXX"
                              inputMode="tel"
                            />
                          </label>
                          <div className="flex gap-2 sm:col-span-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveEdit(u)}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              সংরক্ষণ করুন
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className={`${btnCls} bg-slate-200 text-slate-700`}
                            >
                              বাতিল
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {usersApi.users.length === 1 && (
            <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
              বর্তমানে আপনিই একমাত্র ব্যবহারকারী। নতুন কাউকে Admin Panel-এর
              প্রবেশ দিতে হলে প্রথমে তাঁর Login Account তৈরি করতে হয় — সেই
              ব্যবস্থা আলাদা ধাপে (Service-ভিত্তিক) তৈরি করা হবে।
            </p>
          )}

          {message && (
            <p className={`rounded-lg px-4 py-3 text-sm ${message.kind === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              {message.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}
