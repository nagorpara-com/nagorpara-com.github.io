import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { useAdminMembers } from "../../hooks/useAdminMembers";
import type { Member } from "../../types/database.types";
import {
  validateMemberInput,
  type MemberInput,
} from "../../utils/member";

/**
 * Members Management (R-07, /admin/members) — full CRUD over
 * the `members` registry. Writes are enforced by the database
 * policy ("members: admin writes", is_admin()); this page only
 * explains that. Privacy rule kept visible in the UI: a phone
 * number reaches the public site ONLY through the
 * `members_public` view and ONLY when the admin marks it
 * public — the default is private.
 */

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";
const whiteBtn =
  "rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-dark-green disabled:opacity-60";
const dangerBtn =
  "rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60";

const EMPTY_FORM: MemberInput = {
  name: "",
  phone: "",
  facebook_url: "",
  is_phone_public: false,
  address: "",
  joined_date: "",
  photo_url: "",
  is_active: true,
  display_order: 0,
};

function toForm(m: Member): MemberInput {
  return {
    name: m.name,
    phone: m.phone ?? "",
    facebook_url: m.facebook_url ?? "",
    is_phone_public: m.is_phone_public,
    address: m.address ?? "",
    joined_date: m.joined_date ?? "",
    photo_url: m.photo_url ?? "",
    is_active: m.is_active,
    display_order: m.display_order,
  };
}

export default function AdminMembersPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const data = useAdminMembers();
  const [form, setForm] = useState<MemberInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.members.filter((m) => {
      if (statusFilter === "active" && !m.is_active) return false;
      if (statusFilter === "inactive" && m.is_active) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.members, search, statusFilter]);

  function set<K extends keyof MemberInput>(key: K, value: MemberInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(m: Member) {
    setEditingId(m.id);
    setForm(toForm(m));
    setFieldErrors({});
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const result = validateMemberInput(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    const res = editingId
      ? await data.updateMember(editingId, result.value)
      : await data.createMember(result.value);
    setBusy(false);
    if (res.error) {
      setFeedback({ kind: "err", text: `সংরক্ষণ ব্যর্থ হয়েছে: ${res.error}` });
      return;
    }
    setFeedback({
      kind: "ok",
      text:
        (editingId ? "সদস্যের তথ্য হালনাগাদ হয়েছে।" : "নতুন সদস্য যোগ হয়েছে।") +
        (res.linkSkipped
          ? " তবে মেসেজ লিংকটি সেভ হয়নি — ডেটাবেস আপডেট (migration 0030) চালানো বাকি।"
          : ""),
    });
    cancelEdit();
  }

  async function onToggleActive(m: Member) {
    setFeedback(null);
    const err = await data.setMemberActive(m.id, !m.is_active);
    if (err) setFeedback({ kind: "err", text: `অবস্থা বদল ব্যর্থ হয়েছে: ${err}` });
  }

  async function onDelete(m: Member) {
    setBusy(true);
    const err = await data.deleteMember(m.id);
    setBusy(false);
    setConfirmingDeleteId(null);
    if (err) {
      setFeedback({ kind: "err", text: `মুছে ফেলা ব্যর্থ হয়েছে: ${err}` });
    } else {
      setFeedback({ kind: "ok", text: `“${m.name}” মুছে ফেলা হয়েছে।` });
      if (editingId === m.id) cancelEdit();
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-bold text-dark-green">সদস্য পরিচালনা</h1>
        <p className="mt-1 text-sm text-slate-500">
            সদস্য যোগ, সম্পাদনা ও মুছে ফেলুন।
          </p>
      </div>

      {!data.isConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase সংযোগ সেট করা হয়নি — সংযোগ ছাড়া সদস্য লোড বা সংরক্ষণ করা যাবে না।
        </p>
      )}
      {profile && !isAdmin && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          সদস্য যোগ/সম্পাদনা/মোছার অনুমতি শুধু Admin-এর (Database-এর নীতি অনুযায়ী) — আপনার সংরক্ষণ কার্যকর হবে না।
        </p>
      )}
      {feedback && (
        <p
          className={
            feedback.kind === "ok"
              ? "rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-medium text-dark-green"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
          role="status"
        >
          {feedback.text}
        </p>
      )}

      <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-bold text-dark-green">{editingId ? "সদস্য সম্পাদনা" : "নতুন সদস্য যোগ করুন"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="mb-name">নাম *</label>
            <input id="mb-name" className={inputCls} value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="mb-phone">মোবাইল নম্বর</label>
            <input id="mb-phone" className={inputCls} value={form.phone} maxLength={11} placeholder="01XXXXXXXXX" onChange={(e) => set("phone", e.target.value)} />
            {fieldErrors.phone && <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>}
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.is_phone_public} onChange={(e) => set("is_phone_public", e.target.checked)} />
              এই নম্বরটি Public Website-এ দেখাও
            </label>
            <p className="mt-1 text-xs text-slate-400">টিক না দিলে নম্বরটি শুধু Admin Panel-এই থাকবে — Website-এ যাবে না।</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="mb-facebook">মেসেজের লিংক — Facebook প্রোফাইল (ঐচ্ছিক)</label>
            <input id="mb-facebook" className={inputCls} value={form.facebook_url} maxLength={300} placeholder="https://www.facebook.com/…" onChange={(e) => set("facebook_url", e.target.value)} />
            {fieldErrors.facebook_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.facebook_url}</p>}
            <p className="mt-1 text-xs text-slate-400">লিংক দিলে Website-এর কার্ডে "মেসেজ" বাটন এই লিংকে যাবে; না দিলে SMS যাবে।</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="mb-address">ঠিকানা</label>
            <input id="mb-address" className={inputCls} value={form.address} maxLength={200} onChange={(e) => set("address", e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">ঠিকানা কখনোই Public Website-এ দেখানো হয় না।</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="mb-joined">যোগদানের তারিখ</label>
            <input id="mb-joined" type="date" className={inputCls} value={form.joined_date} onChange={(e) => set("joined_date", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <PhotoUploadField
              label="সদস্যের ছবি"
              pathPrefix="members"
              sizeHint="800 × 1000 পিক্সেল (অনুপাত 4:5)"
              value={form.photo_url}
              onChange={(url) => set("photo_url", url)}
            />
            <div className="mt-2">
            </div>
            {fieldErrors.photo_url && <p className="mt-1 text-xs text-red-600">{fieldErrors.photo_url}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="mb-order">ক্রম</label>
            <input id="mb-order" type="number" min={0} className={inputCls} value={form.display_order} onChange={(e) => set("display_order", Number(e.target.value))} />
            {fieldErrors.display_order && <p className="mt-1 text-xs text-red-600">{fieldErrors.display_order}</p>}
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              Website-এ প্রকাশিত
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "হালনাগাদ করুন" : "সদস্য যোগ করুন"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} disabled={busy} className={whiteBtn}>বাতিল</button>
          )}
        </div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-dark-green">সদস্য তালিকা ({visible.length.toLocaleString("bn-BD")} জন)</h2>
          <input aria-label="নাম দিয়ে খুঁজুন" className="ml-auto w-52 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-primary" placeholder="নাম দিয়ে খুঁজুন…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="অবস্থা অনুযায়ী ছাঁকুন" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">সব অবস্থা</option>
            <option value="active">প্রকাশিত</option>
            <option value="inactive">অপ্রকাশিত</option>
          </select>
        </div>

        {data.error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {data.error}{" "}
            <button type="button" onClick={() => void data.reload()} className="font-semibold underline">আবার চেষ্টা করুন</button>
          </div>
        ) : data.loading ? (
          <p className="mt-4 text-sm text-slate-500">লোড হচ্ছে…</p>
        ) : visible.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            {data.members.length === 0 ? "এখনো কোনো সদস্য যোগ করা হয়নি।" : "খোঁজের সঙ্গে মিলে এমন কোনো সদস্য নেই।"}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {visible.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                {m.photo_url ? (
                  <img src={m.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-dark-green" aria-hidden="true">
                    {m.name.trim().charAt(0) || "স"}
                  </span>
                )}
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {m.name}{" "}
                    {!m.is_active && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">অপ্রকাশিত</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {m.phone ? (
                      <>মোবাইল: {m.phone} · <span className={m.is_phone_public ? "font-medium text-dark-green" : "text-slate-400"}>{m.is_phone_public ? "Website-এ দেখা যায়" : "শুধু Admin-এ"}</span></>
                    ) : (
                      "মোবাইল নম্বর নেই"
                    )}
                    {m.joined_date ? ` · যোগদান: ${m.joined_date}` : ""}
                    {m.facebook_url ? " · মেসেজ লিংক আছে" : ""}
                  </p>
                </div>
                {confirmingDeleteId === m.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-red-700">মুছে ফেলবেন?</span>
                    <button type="button" onClick={() => void onDelete(m)} disabled={busy} className={dangerBtn}>হ্যাঁ, মুছুন</button>
                    <button type="button" onClick={() => setConfirmingDeleteId(null)} disabled={busy} className={whiteBtn}>না</button>
                  </span>
                ) : (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => startEdit(m)} className={whiteBtn}>সম্পাদনা</button>
                    <button type="button" onClick={() => void onToggleActive(m)} className={whiteBtn}>{m.is_active ? "আনপাবলিশ করুন" : "প্রকাশ করুন"}</button>
                    <button type="button" onClick={() => setConfirmingDeleteId(m.id)} className={dangerBtn}>মুছে ফেলুন</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
