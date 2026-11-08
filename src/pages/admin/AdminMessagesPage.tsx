import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAdminMessages } from "../../hooks/useAdminMessages";
import { resolveMessageDisplay } from "../../utils/contactMessage";
import { formatDateBn } from "../../utils/format";
import type { ContactMessage } from "../../types/database.types";

/**
 * Admin — Contact Messages (§11, Phase C / C1).
 *
 * List with search + read/unread filter, a details panel, mark
 * read/unread, and Admin-only delete behind an in-page confirmation
 * dialog (same pattern as the Players page — no window.confirm).
 * Database RLS (is_admin() for select/update/delete) is the real
 * enforcement; the role checks here only shape the UI honestly.
 */

type Filter = "all" | "unread" | "read";

export default function AdminMessagesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { messages, loading, error, reload, setRead, remove, isConfigured } =
    useAdminMessages();

  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(
    searchParams.get("filter") === "unread" ? "unread" : "all",
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContactMessage | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const unreadCount = useMemo(
    () => messages.filter((m) => !m.is_read).length,
    [messages],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (filter === "unread" && m.is_read) return false;
      if (filter === "read" && !m.is_read) return false;
      if (!q) return true;
      const { subject } = resolveMessageDisplay(m);
      return (
        m.name.toLowerCase().includes(q) ||
        (m.phone ?? "").includes(q) ||
        (subject ?? "").toLowerCase().includes(q) ||
        m.message.toLowerCase().includes(q)
      );
    });
  }, [messages, filter, query]);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  async function openMessage(m: ContactMessage) {
    setSelectedId(m.id);
    setActionError(null);
    if (!m.is_read && isAdmin) {
      const ok = await setRead(m.id, true);
      if (!ok) setActionError("বার্তাটি 'পড়া হয়েছে' হিসেবে চিহ্নিত করা যায়নি।");
    }
  }

  async function toggleRead(m: ContactMessage) {
    const ok = await setRead(m.id, !m.is_read);
    if (!ok) setActionError("অবস্থা বদলানো যায়নি — আবার চেষ্টা করুন।");
  }

  async function confirmDeleteMessage() {
    if (!confirmDelete) return;
    setDeleting(true);
    const ok = await remove(confirmDelete.id);
    setDeleting(false);
    if (!ok) {
      setActionError("বার্তাটি মোছা যায়নি — আবার চেষ্টা করুন।");
      setConfirmDelete(null);
      return;
    }
    if (selectedId === confirmDelete.id) setSelectedId(null);
    setConfirmDelete(null);
  }

  if (!isConfigured) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-bold text-brand-dark">যোগাযোগ বার্তা</h1>
        <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm leading-relaxed text-neutral-700">
          Supabase এখনো সংযুক্ত হয়নি, তাই যোগাযোগ বার্তা দেখানো যাচ্ছে না — কোনো
          নমুনা বার্তা দেখানো হয়নি। সংযোগ সম্পূর্ণ হলে Public যোগাযোগ ফর্ম থেকে
          আসা বার্তাগুলো এখানে দেখা যাবে।
        </div>
      </div>
    );
  }

  if (profile && !isAdmin) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-bold text-brand-dark">যোগাযোগ বার্তা</h1>
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm leading-relaxed text-neutral-700">
          যোগাযোগ বার্তা শুধু **Admin** দেখতে ও পরিচালনা করতে পারেন — Database-এর
          নিয়ম (RLS) অনুযায়ী অন্য কোনো Role-এর এই তথ্যে প্রবেশাধিকার নেই।
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">যোগাযোগ বার্তা</h1>
          <p className="mt-1 text-sm text-neutral-500">
            মোট {messages.length}টি বার্তা · অপঠিত {unreadCount}টি
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        >
          আবার লোড করুন
        </button>
      </div>

      {/* Search + filter */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="নাম, মোবাইল বা বার্তায় খুঁজুন…"
          className="w-full max-w-xs rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
          aria-label="বার্তা খুঁজুন"
        />
        <div className="flex overflow-hidden rounded border border-neutral-300 text-sm">
          {(
            [
              ["all", "সব"],
              ["unread", "অপঠিত"],
              ["read", "পঠিত"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-2 ${
                filter === key ? "bg-brand text-white" : "bg-white text-neutral-700"
              }`}
              aria-pressed={filter === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-neutral-500">বার্তা লোড হচ্ছে…</p>}
      {error && (
        <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {actionError}
        </p>
      )}

      {!loading && !error && visible.length === 0 && (
        <p className="mt-6 rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          {messages.length === 0
            ? "এখনো কোনো বার্তা আসেনি। Public যোগাযোগ ফর্ম থেকে কেউ বার্তা পাঠালে এখানে দেখা যাবে।"
            : "এই খোঁজ/ছাঁকনিতে কোনো বার্তা মেলেনি।"}
        </p>
      )}

      {visible.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          {/* ---------- List ---------- */}
          <ul className="space-y-2 lg:col-span-2">
            {visible.map((m) => {
              const { subject, body } = resolveMessageDisplay(m);
              const isSelected = m.id === selectedId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void openMessage(m)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      isSelected
                        ? "border-brand bg-brand/5"
                        : "border-neutral-200 bg-white hover:border-brand/50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm ${m.is_read ? "font-medium" : "font-bold"}`}>
                        {m.name}
                      </span>
                      {!m.is_read && (
                        <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-white">
                          নতুন
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-neutral-700">
                      {subject ?? body}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {formatDateBn(m.created_at)}
                      {m.phone ? ` · ${m.phone}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ---------- Details ---------- */}
          <div className="lg:col-span-3">
            {selected ? (
              <article className="rounded-xl border border-neutral-200 bg-white p-5">
                <MessageDetails
                  key={selected.id}
                  message={selected}
                  isAdmin={isAdmin}
                  onToggleRead={() => void toggleRead(selected)}
                  onDelete={() => setConfirmDelete(selected)}
                />
              </article>
            ) : (
              <p className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
                বিস্তারিত দেখতে বামদিক থেকে একটি বার্তা বেছে নিন।
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------- Delete confirmation (in-page dialog) ---------- */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="বার্তা মোছার নিশ্চিতকরণ"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5">
            <h2 className="font-semibold text-brand-dark">বার্তাটি মুছে ফেলবেন?</h2>
            <p className="mt-2 text-sm text-neutral-600">
              {confirmDelete.name}-এর বার্তাটি স্থায়ীভাবে মুছে যাবে — এটি ফেরত আনা
              যাবে না।
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
                disabled={deleting}
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteMessage()}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                disabled={deleting}
              >
                {deleting ? "মোছা হচ্ছে…" : "হ্যাঁ, মুছে ফেলুন"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageDetails({
  message,
  isAdmin,
  onToggleRead,
  onDelete,
}: {
  message: ContactMessage;
  isAdmin: boolean;
  onToggleRead: () => void;
  onDelete: () => void;
}) {
  const { subject, body } = resolveMessageDisplay(message);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-brand-dark">{message.name}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {formatDateBn(message.created_at)} ·{" "}
            {message.is_read ? "পড়া হয়েছে" : "অপঠিত"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleRead}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
          >
            {message.is_read ? "অপঠিত হিসেবে রাখুন" : "পড়া হয়েছে করুন"}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700"
            >
              মুছে ফেলুন
            </button>
          )}
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {message.phone && (
          <div>
            <dt className="text-neutral-500">মোবাইল</dt>
            <dd>
              <a className="text-brand underline" href={`tel:${message.phone}`}>
                {message.phone}
              </a>
            </dd>
          </div>
        )}
        {subject && (
          <div>
            <dt className="text-neutral-500">বিষয়</dt>
            <dd className="font-medium">{subject}</dd>
          </div>
        )}
        <div>
          <dt className="text-neutral-500">বার্তা</dt>
          <dd className="whitespace-pre-wrap leading-relaxed">{body}</dd>
        </div>
      </dl>
    </>
  );
}
