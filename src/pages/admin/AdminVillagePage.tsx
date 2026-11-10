import { useEffect, useState } from "react";
import { useAdminVillageSections, type VillageSectionAdminRow } from "../../hooks/useAdminVillageSections";
import { useAdminVillageCategories } from "../../hooks/useVillageCategories";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import VideoUploadField from "../../components/admin/VideoUploadField";
import VillagePageSettingsCard from "../../components/admin/VillagePageSettingsCard";
import {
  VILLAGE_AREAS,
  VILLAGE_AREA_LABELS,
  DEFAULT_VILLAGE_AREA,
  areaOptionsFromCategories,
  isVillageArea,
  isVillageAreaKey,
  validateVillageSectionInput,
  type VillageAreaOption,
  type VillageSectionInput,
} from "../../utils/villageSection";

/**
 * Village Profile admin (Phase 2, 2026-10-24; block routing
 * added Phase V-1D, 2026-10-25, on migration 0022).
 *
 * Manages the EXISTING `village_sections` rows. Each row belongs
 * to one of the public page's categories via its `area` — the
 * category's key. The Block select below is driven by the
 * category list (migration 0054, Admin ক্যাটাগরি পরিচালনা):
 * built-in blocks plus any Admin-created category; before that
 * migration is live it falls back to the built-in blocks.
 * Published rows appear — in display_order — inside their
 * block, replacing that block's default/empty-state content;
 * unpublished rows are drafts the public can never read (RLS).
 * Rows from before the column existed are 'porichiti', exactly
 * where they always rendered.
 *
 * The page's other blocks (অবস্থান ও ঠিকানা tiles, ছবি,
 * সংগঠন পরিচিতি) are settings/gallery/about driven — NOT
 * village_sections — and stay outside this page's scope.
 *
 * Every write is verified by reading the row back
 * (useAdminVillageSections); a success message appears only after
 * the stored values match what was submitted.
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

const EMPTY_FORM: VillageSectionInput = {
  title: "",
  content: "",
  imageUrl: "",
  videoUrl: "",
  displayOrder: 0,
  isPublished: false,
  area: "porichiti",
};

function formFromRow(row: VillageSectionAdminRow): VillageSectionInput {
  return {
    title: row.title,
    content: row.content ?? "",
    imageUrl: row.image_url ?? "",
    videoUrl: row.video_url ?? "",
    displayOrder: row.display_order,
    isPublished: row.is_published,
    // Any stored category slug stays selectable (migration
    // 0054); an unreadable value falls back to the default
    // block, as before.
    area: isVillageAreaKey(row.area) ? row.area : DEFAULT_VILLAGE_AREA,
  };
}

export default function AdminVillagePage() {
  const {
    rows,
    loading,
    loadError,
    videoPending,
    reload,
    createSection,
    editSection,
    setPublished,
    moveSection,
    deleteSection,
  } = useAdminVillageSections();
  const { rows: categoryRows, migrationPending: categoriesPending } = useAdminVillageCategories();

  /* Block options: the category list when it is available
   * (text + places categories hold sections), else the built-in
   * blocks — so this form works before migration 0054 too. */
  const areaOptions: VillageAreaOption[] =
    !categoriesPending && categoryRows.length > 0
      ? areaOptionsFromCategories(categoryRows)
      : VILLAGE_AREAS.map((area) => ({ value: area, label: VILLAGE_AREA_LABELS[area] }));
  const areaLabel = (area: string): string =>
    areaOptions.find((o) => o.value === area)?.label ??
    (isVillageArea(area) ? VILLAGE_AREA_LABELS[area] : area);

  const [form, setForm] = useState<VillageSectionInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  // When creating, suggest the next order number after the last row.
  useEffect(() => {
    if (!editingId) {
      setForm((prev) =>
        prev.displayOrder === 0 && rows.length > 0
          ? { ...prev, displayOrder: Math.max(...rows.map((r) => r.display_order)) + 1 }
          : prev,
      );
    }
  }, [rows, editingId]);

  const set =
    (key: keyof VillageSectionInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({
        ...prev,
        [key]: key === "displayOrder" ? Number(e.target.value) : e.target.value,
      }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateVillageSectionInput(form);
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    const error = editingId ? await editSection(editingId, form) : await createSection(form);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    setMessage({
      ok: true,
      text: editingId
        ? "Section হালনাগাদ হয়েছে — Database-এ যাচাই করা হয়েছে।"
        : "Section তৈরি হয়েছে — Database-এ যাচাই করা হয়েছে।",
    });
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(row: VillageSectionAdminRow) {
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
      <h1 className="text-xl font-bold text-brand-dark">গ্রামের পরিচিতি ও ইতিহাস</h1>
      
      <div className="mt-4">
        <VillagePageSettingsCard />
      </div>

      {loadError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {loadError}
          <button type="button" onClick={() => void reload()} className="ml-3 font-semibold underline">
            আবার চেষ্টা করুন
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5"
        aria-label={editingId ? "Section সম্পাদনা" : "নতুন Section"}
      >
        <h2 className="text-base font-bold text-brand-dark">
          {editingId ? "Section সম্পাদনা করুন" : "নতুন Section যোগ করুন"}
        </h2>
        <div className="mt-3 grid gap-3">
          <div>
            <label className={labelCls} htmlFor="vs-title">শিরোনাম *</label>
            <input id="vs-title" className={inputCls} value={form.title} onChange={set("title")} />
          </div>
          <div>
            <label className={labelCls} htmlFor="vs-area">কোন Block-এ দেখাবে *</label>
            <select
              id="vs-area"
              className={inputCls}
              value={form.area}
              onChange={(e) => setForm((prev) => ({ ...prev, area: e.target.value }))}
            >
              {(areaOptions.some((o) => o.value === form.area)
                ? areaOptions
                : [...areaOptions, { value: form.area, label: form.area }]
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="vs-content">বিবরণ</label>
            <textarea id="vs-content" className={inputCls} rows={5} value={form.content} onChange={set("content")} />
          </div>
          <PhotoUploadField
            label="Section-এর ছবি (ঐচ্ছিক)"
            pathPrefix="village"
            value={form.imageUrl}
            onChange={(url) => setForm((prev) => ({ ...prev, imageUrl: url }))}
            hideHint
          />
          <VideoUploadField
            value={form.videoUrl}
            onChange={(url) => setForm((prev) => ({ ...prev, videoUrl: url }))}
            pathPrefix="village"
            disabled={videoPending}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="vs-order">ক্রম</label>
              <input
                id="vs-order"
                type="number"
                min={0}
                className={inputCls}
                value={form.displayOrder}
                onChange={set("displayOrder")}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium text-neutral-700">
              <input
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
            {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "পরিবর্তন সংরক্ষণ করুন" : "Section যোগ করুন"}
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

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5" aria-label="Section তালিকা">
        <h2 className="text-base font-bold text-brand-dark">
          সব Section ({rows.length}টি)
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            এখনো কোনো Section তৈরি হয়নি। উপরের Form দিয়ে প্রথম Section যোগ করুন — প্রকাশিত হলেই তা
            Public Village Page-এর পরিচিতি অংশে দেখা যাবে।
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {rows.map((row, index) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-8 shrink-0 text-center text-sm font-bold text-neutral-400">
                  {row.display_order}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-neutral-800">{row.title}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {row.content ? row.content.slice(0, 90) : "বিবরণ নেই"}
                    {row.image_url ? " · ছবি আছে" : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
                  {areaLabel(row.area)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    row.is_published ? "bg-brand-light text-brand-dark" : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {row.is_published ? "প্রকাশিত" : "খসড়া"}
                </span>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-label={`${row.title} উপরে সরান`}
                    disabled={rowBusyId === row.id || index === 0}
                    onClick={() => void handleRowAction(row.id, () => moveSection(row.id, "up"), "ক্রম বদলানো হয়েছে।")}
                    className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-brand hover:text-brand-dark disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`${row.title} নিচে সরান`}
                    disabled={rowBusyId === row.id || index === rows.length - 1}
                    onClick={() => void handleRowAction(row.id, () => moveSection(row.id, "down"), "ক্রম বদলানো হয়েছে।")}
                    className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-brand hover:text-brand-dark disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={rowBusyId === row.id}
                    onClick={() =>
                      void handleRowAction(
                        row.id,
                        () => setPublished(row.id, !row.is_published),
                        row.is_published ? "Section অপ্রকাশিত করা হয়েছে।" : "Section প্রকাশিত হয়েছে।",
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
                  {confirmDeleteId === row.id ? (
                    <>
                      <button
                        type="button"
                        disabled={rowBusyId === row.id}
                        onClick={() =>
                          void handleRowAction(row.id, () => deleteSection(row.id), "Section মুছে ফেলা হয়েছে।")
                        }
                        className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        সত্যিই মুছবেন?
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
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">Section মুছলে আপলোড করা ছবি Storage-এ থেকে যায়।</p>
      </section>
    </div>
  );
}
