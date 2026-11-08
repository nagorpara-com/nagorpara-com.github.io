import { useState } from "react";
import {
  useAdminVillageCategories,
  type VillageCategoryInput,
} from "../../hooks/useVillageCategories";
import { isVillageAreaKey } from "../../utils/villageSection";
import type { VillageCategory, VillageCategoryKind } from "../../types/database.types";

/**
 * Village Profile category management (migration 0054).
 *
 * The categories of the public Village Profile page — chip
 * label, section heading, order, published flag — are rows of
 * `village_categories`, managed here. New categories are always
 * the plain text kind (village_sections articles with photo /
 * video); their `key` is chosen once at creation and never
 * edited, because section rows route by it. The three special
 * blocks (অবস্থান / গুরুত্বপূর্ণ স্থান / গ্রামের ছবি) can be
 * renamed, reordered and hidden here, but never deleted — the
 * page renders them with their own dedicated blocks.
 *
 * Every write is verified by reading the row back
 * (useAdminVillageCategories); a success message appears only
 * after the stored values match what was submitted. Before
 * migration 0054 is live the page shows an honest notice
 * instead of the form, and the public page keeps its built-in
 * category list.
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const KIND_LABELS: Record<VillageCategoryKind, string> = {
  text: "সাধারণ লেখা",
  location: "অবস্থান",
  places: "গুরুত্বপূর্ণ স্থান",
  photos: "গ্রামের ছবি",
};

const EMPTY_FORM: VillageCategoryInput = {
  key: "",
  label: "",
  title: "",
  displayOrder: 0,
  isPublished: true,
};

function formFromRow(row: VillageCategory): VillageCategoryInput {
  return {
    key: row.key,
    label: row.label,
    title: row.title,
    displayOrder: row.display_order,
    isPublished: row.is_published,
  };
}

function validateCategoryInput(input: VillageCategoryInput, isCreate: boolean): string | null {
  if (isCreate && !isVillageAreaKey(input.key.trim()))
    return "Key সঠিকভাবে দিন — ছোট হাতের ইংরেজি অক্ষর দিয়ে শুরু, শুধু a-z, 0-9 ও _ চলবে (সর্বোচ্চ ৪০ অক্ষর)।";
  if (!input.label.trim()) return "লেবেল (চিপের নাম) আবশ্যক।";
  if (input.label.trim().length > 80) return "লেবেল ৮০ অক্ষরের মধ্যে রাখুন।";
  if (!input.title.trim()) return "সেকশনের শিরোনাম আবশ্যক।";
  if (input.title.trim().length > 200) return "শিরোনাম ২০০ অক্ষরের মধ্যে রাখুন।";
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0)
    return "ক্রম অবশ্যই ০ বা তার বেশি পূর্ণ সংখ্যা হতে হবে।";
  return null;
}

export default function AdminVillageCategoriesPage() {
  const {
    isConfigured,
    rows,
    loading,
    loadError,
    migrationPending,
    reload,
    createCategory,
    editCategory,
    setCategoryPublished,
    deleteCategory,
  } = useAdminVillageCategories();

  const [form, setForm] = useState<VillageCategoryInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const editingRow = editingId ? rows.find((r) => r.id === editingId) ?? null : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateCategoryInput(form, !editingId);
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    const error = editingId ? await editCategory(editingId, form) : await createCategory(form);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    setMessage({
      ok: true,
      text: editingId
        ? "ক্যাটাগরি হালনাগাদ হয়েছে — Database-এ যাচাই করা হয়েছে।"
        : "ক্যাটাগরি তৈরি হয়েছে — Database-এ যাচাই করা হয়েছে।",
    });
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(row: VillageCategory) {
    setEditingId(row.id);
    setForm(formFromRow(row));
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
  }

  async function handleRowAction(id: string, action: () => Promise<string | null>, okText: string) {
    setRowBusyId(id);
    const error = await action();
    setRowBusyId(null);
    setMessage(error ? { ok: false, text: error } : { ok: true, text: okText });
    if (!error) setConfirmDeleteId(null);
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-brand-dark">ক্যাটাগরি পরিচালনা</h1>
      <p className="mt-1 text-sm leading-relaxed text-neutral-500">
        গ্রাম পেজের ক্যাটাগরি (চিপ ও সেকশন) পরিচালনা করুন।
      </p>

      {!isConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Supabase সংযুক্ত নয় — সংরক্ষণ করা যাবে না।
        </p>
      ) : loading ? (
        <p className="mt-4 text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>
      ) : migrationPending ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          এর Database অংশ (Migration 0054 — Village categories) Live Database-এ এখনো প্রয়োগ করা হয়নি।
          প্রয়োগের পর থেকে এই পেজ থেকে ক্যাটাগরি যোগ, নাম বদল, ক্রম ও প্রকাশ পরিচালনা করা যাবে। তার আগে
          গ্রাম পেজে তৈরি-থাকা ক্যাটাগরি তালিকাই দেখাবে।
        </p>
      ) : loadError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {loadError}
          <button type="button" onClick={() => void reload()} className="ml-3 font-semibold underline">
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : (
        <>
          <form
            onSubmit={handleSubmit}
            className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5"
            aria-label={editingId ? "ক্যাটাগরি সম্পাদনা" : "নতুন ক্যাটাগরি"}
          >
            <h2 className="text-base font-bold text-brand-dark">
              {editingId ? "ক্যাটাগরি সম্পাদনা করুন" : "নতুন ক্যাটাগরি যোগ করুন"}
            </h2>
            <div className="mt-3 grid gap-3">
              {!editingId ? (
                <>
                  <div>
                    <label className={labelCls} htmlFor="vc-key">Key (ইংরেজি, ছোট হাতের) *</label>
                    <input
                      id="vc-key"
                      className={inputCls}
                      value={form.key}
                      onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
                      placeholder="যেমন: utsob"
                      maxLength={40}
                    />
                    <p className="mt-1 text-xs text-neutral-400">
                      পেজের Anchor ও Section-এর Block হিসেবে ব্যবহৃত হয় — তৈরি করার পর আর বদলানো যায় না।
                    </p>
                  </div>
                  <p className="text-sm text-neutral-600">
                    ধরন: <span className="font-medium text-neutral-800">সাধারণ লেখা</span>
                    <span className="text-neutral-400"> (নতুন ক্যাটাগরি সবসময় এই ধরনের হয়)</span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-neutral-600">
                  Key: <span className="font-medium text-neutral-800">{editingRow?.key}</span>
                  <span className="mx-2 text-neutral-300">·</span>
                  ধরন:{" "}
                  <span className="font-medium text-neutral-800">
                    {editingRow ? KIND_LABELS[editingRow.kind] : ""}
                  </span>
                  <span className="text-neutral-400"> (Key ও ধরন বদলানো যায় না)</span>
                </p>
              )}
              <div>
                <label className={labelCls} htmlFor="vc-label">লেবেল (চিপের নাম) *</label>
                <input
                  id="vc-label"
                  className={inputCls}
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                  maxLength={80}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="vc-title">সেকশনের শিরোনাম *</label>
                <input
                  id="vc-title"
                  className={inputCls}
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  maxLength={200}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="vc-order">ক্রম</label>
                  <input
                    id="vc-order"
                    type="number"
                    min={0}
                    className={inputCls}
                    value={form.displayOrder}
                    onChange={(e) => setForm((prev) => ({ ...prev, displayOrder: Number(e.target.value) }))}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm font-medium text-neutral-700">
                  <input
                    id="vc-published"
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.checked }))}
                    className="h-4 w-4 accent-brand"
                  />
                  প্রকাশিত — Public Page-এ দেখাবে
                </label>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "পরিবর্তন সংরক্ষণ করুন" : "ক্যাটাগরি যোগ করুন"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 hover:border-brand hover:text-brand-dark"
                >
                  বাতিল
                </button>
              )}
              {message && (
                <p className={`text-sm ${message.ok ? "text-brand-dark" : "text-red-700"}`} role="status">
                  {message.text}
                </p>
              )}
            </div>
          </form>

          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5" aria-label="ক্যাটাগরি তালিকা">
            <h2 className="text-base font-bold text-brand-dark">সব ক্যাটাগরি ({rows.length}টি)</h2>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">
                এখনো কোনো ক্যাটাগরি তৈরি হয়নি। উপরের Form দিয়ে প্রথম ক্যাটাগরি যোগ করুন।
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="w-8 shrink-0 text-center text-sm font-bold text-neutral-400">
                      {row.display_order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-neutral-800">{row.label}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {row.title} · key: {row.key}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
                      {KIND_LABELS[row.kind]}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        row.is_published ? "bg-brand-light text-brand-dark" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {row.is_published ? "প্রকাশিত" : "খসড়া"}
                    </span>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={rowBusyId === row.id}
                        onClick={() =>
                          void handleRowAction(
                            row.id,
                            () => setCategoryPublished(row.id, !row.is_published),
                            row.is_published ? "ক্যাটাগরি অপ্রকাশিত করা হয়েছে।" : "ক্যাটাগরি প্রকাশিত হয়েছে।",
                          )
                        }
                        className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-brand hover:text-brand-dark disabled:opacity-40"
                      >
                        {row.is_published ? "অপ্রকাশ করুন" : "প্রকাশ করুন"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-brand hover:text-brand-dark"
                      >
                        সম্পাদনা
                      </button>
                      {row.kind === "text" ? (
                        confirmDeleteId === row.id ? (
                          <>
                            <button
                              type="button"
                              disabled={rowBusyId === row.id}
                              onClick={() =>
                                void handleRowAction(row.id, () => deleteCategory(row.id), "ক্যাটাগরি মুছে ফেলা হয়েছে।")
                              }
                              className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                            >
                              হ্যাঁ, মুছুন
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600"
                            >
                              না
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(row.id)}
                            className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            মুছুন
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-neutral-400">বিশেষ ব্লক — মোছা যাবে না</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs leading-relaxed text-neutral-400">
              ক্যাটাগরি মুছলে শুধু ক্যাটাগরির তথ্য মুছে যায়; ওই Block-এর Section-গুলো Database-এ থেকে যায়, তবে
              Public Page-এ আর দেখা যায় না।
            </p>
          </section>
        </>
      )}
    </div>
  );
}
