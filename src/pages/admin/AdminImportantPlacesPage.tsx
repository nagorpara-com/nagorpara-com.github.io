import { useEffect, useState } from "react";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import VideoUploadField from "../../components/admin/VideoUploadField";
import {
  useAdminVillageSections,
  type VillageSectionAdminRow,
} from "../../hooks/useAdminVillageSections";
import {
  validateVillageSectionInput,
  type VillageSectionInput,
} from "../../utils/villageSection";

/**
 * গুরুত্বপূর্ণ স্থান (Important Places) — dedicated admin page
 * (owner's plan, approved 2026-11-01). A filtered view over the
 * SAME village_sections rows with area = 'sthan': nothing is
 * duplicated, so places added here also appear in the general
 * sections list and vice versa. Each place: title, description,
 * photo (device upload), optional video (device upload, max
 * 50 MB — migration 0038), order, published flag. The public
 * Village Profile page renders photo + video player + text.
 * Writes go through useAdminVillageSections (read-back
 * verification on every write).
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
  area: "sthan",
};

function formFromRow(row: VillageSectionAdminRow): VillageSectionInput {
  return {
    title: row.title,
    content: row.content ?? "",
    imageUrl: row.image_url ?? "",
    videoUrl: row.video_url ?? "",
    displayOrder: row.display_order,
    isPublished: row.is_published,
    area: "sthan",
  };
}

export default function AdminImportantPlacesPage() {
  const v = useAdminVillageSections();
  const places = v.rows.filter((r) => r.area === "sthan");
  const [form, setForm] = useState<VillageSectionInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId && places.length > 0) {
      setForm((prev) =>
        prev.displayOrder === 0 && !prev.title
          ? { ...prev, displayOrder: Math.max(...places.map((p) => p.display_order)) + 1 }
          : prev,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places.length]);

  const set = (key: keyof VillageSectionInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function save() {
    const invalid = validateVillageSectionInput(form);
    if (invalid) return setMessage({ ok: false, text: invalid });
    if (v.videoPending && form.videoUrl) {
      return setMessage({
        ok: false,
        text: "ভিডিও এখনো সংরক্ষণ করা যাবে না — Migration 0038 লাইভ হলে ভিডিও যোগ করা যাবে। আপাতত ভিডিও ছাড়া সংরক্ষণ করুন।",
      });
    }
    setBusy(true);
    const error = editingId ? await v.editSection(editingId, form) : await v.createSection(form);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error });
    setMessage({ ok: true, text: editingId ? "পরিবর্তন সংরক্ষিত হয়েছে।" : "নতুন স্থান যোগ হয়েছে।" });
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function togglePublish(row: VillageSectionAdminRow) {
    setRowBusyId(row.id);
    const error = await v.setPublished(row.id, !row.is_published);
    setRowBusyId(null);
    if (error) setMessage({ ok: false, text: error });
  }

  async function remove(row: VillageSectionAdminRow) {
    setRowBusyId(row.id);
    const error = await v.deleteSection(row.id);
    setRowBusyId(null);
    setConfirmDeleteId(null);
    if (error) setMessage({ ok: false, text: error });
    else if (editingId === row.id) {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-bold text-brand-dark">গুরুত্বপূর্ণ স্থান</h1>
      
      {v.videoPending && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ভিডিওর Database অংশ (Migration 0038) এখনো লাইভ হয়নি — আপাতত ছবি ও লেখা সংরক্ষণ হবে; 0038 লাইভ হলেই ভিডিও আপলোড চালু হবে।
        </p>
      )}

      {!v.isConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Supabase সংযুক্ত নয় — সংরক্ষণ করা যাবে না।
        </p>
      ) : v.loading ? (
        <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
      ) : v.loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          {v.loadError}
        </p>
      ) : (
        <>
          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-bold text-brand-dark">{editingId ? "স্থান সম্পাদনা" : "নতুন স্থান যোগ করুন"}</h2>
            <div className="mt-3 grid gap-3">
              <div>
                <label className={labelCls} htmlFor="pl-title">স্থানের নাম *</label>
                <input id="pl-title" className={inputCls} value={form.title} onChange={set("title")} maxLength={200} />
              </div>
              <div>
                <label className={labelCls} htmlFor="pl-content">বিবরণ</label>
                <textarea id="pl-content" className={inputCls} rows={4} value={form.content} onChange={set("content")} />
              </div>
              <PhotoUploadField
                value={form.imageUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, imageUrl: url }))}
                pathPrefix="village-places"
                hideHint
              />
              <VideoUploadField
                value={form.videoUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, videoUrl: url }))}
                pathPrefix="village-places"
                disabled={v.videoPending}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="pl-order">ক্রম</label>
                  <input
                    id="pl-order"
                    type="number"
                    min={0}
                    className={inputCls}
                    value={form.displayOrder}
                    onChange={(e) => setForm((prev) => ({ ...prev, displayOrder: Number(e.target.value) }))}
                  />
                </div>
                <label className="mt-6 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.checked }))}
                  />
                  প্রকাশিত (Public Website-এ দেখাবে)
                </label>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "পরিবর্তন সংরক্ষণ করুন" : "স্থান যোগ করুন"}
              </button>
              {editingId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                    setMessage(null);
                  }}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                >
                  বাতিল
                </button>
              )}
              {message && (
                <p className={`text-sm ${message.ok ? "text-brand" : "text-red-700"}`} role="status">
                  {message.text}
                </p>
              )}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-bold text-brand-dark">সংরক্ষিত স্থান</h2>
            {places.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">এখনো কোনো স্থান যোগ করা হয়নি।</p>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {places.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                    {row.image_url ? (
                      <img loading="lazy" src={row.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">ছবি নেই</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-800">{row.title}</p>
                      <p className="text-xs text-neutral-500">
                        ক্রম {row.display_order} · {row.video_url ? "ভিডিও আছে · " : ""}{row.is_published ? "প্রকাশিত" : "খসড়া"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={rowBusyId === row.id}
                        onClick={() => {
                          setEditingId(row.id);
                          setForm(formFromRow(row));
                          setMessage(null);
                        }}
                        className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light disabled:opacity-60"
                      >
                        সম্পাদনা
                      </button>
                      <button
                        type="button"
                        disabled={rowBusyId === row.id}
                        onClick={() => void togglePublish(row)}
                        className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                      >
                        {row.is_published ? "অপ্রকাশ করুন" : "প্রকাশ করুন"}
                      </button>
                      {confirmDeleteId === row.id ? (
                        <>
                          <button
                            type="button"
                            disabled={rowBusyId === row.id}
                            onClick={() => void remove(row)}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            হ্যাঁ, মুছুন
                          </button>
                          <button
                            type="button"
                            disabled={rowBusyId === row.id}
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                          >
                            না
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={rowBusyId === row.id}
                          onClick={() => setConfirmDeleteId(row.id)}
                          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                        >
                          মুছুন
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
