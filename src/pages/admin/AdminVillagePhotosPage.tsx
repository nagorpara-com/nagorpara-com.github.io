import { useState } from "react";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { VILLAGE_ALBUM_TITLE } from "../../components/public/VillagePhotosBlock";
import { useAdminGallery, type GalleryItemRow } from "../../hooks/useAdminGallery";
import { validateGalleryItemInput } from "../../utils/galleryItem";

/**
 * গ্রামের ছবি (Village Photos) — dedicated admin page (owner's
 * order, 2026-11-01). Manages the photo items of ONE gallery
 * album titled "গ্রামের ছবি" in the EXISTING gallery tables
 * (migration 0001 — no new schema): upload a photo (device only,
 * max 2 MB via PhotoUploadField), optional caption, order,
 * publish flag. Published photos appear on the public Village
 * Profile page in the গ্রামের ছবি block (grid + large viewer).
 * The album itself is created once, from this page, the first
 * time it is needed. All writes go through useAdminGallery
 * (read-back verification on every write).
 */

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "mb-1 block text-sm font-medium text-neutral-700";

export default function AdminVillagePhotosPage() {
  const g = useAdminGallery();
  const album = g.albums.find((a) => a.title === VILLAGE_ALBUM_TITLE);
  const photos = album ? g.items.filter((i) => i.album_id === album.id && i.type === "photo") : [];

  const [fileUrl, setFileUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [order, setOrder] = useState(0);
  const [isPublished, setIsPublished] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  function resetForm(nextOrder?: number) {
    setFileUrl("");
    setCaption("");
    setOrder(nextOrder ?? 0);
    setIsPublished(true);
    setEditingId(null);
  }

  async function ensureAlbum() {
    setBusy(true);
    const error = await g.createAlbum(VILLAGE_ALBUM_TITLE, true);
    setBusy(false);
    setMessage(
      error
        ? { ok: false, text: error }
        : { ok: true, text: "অ্যালবাম তৈরি হয়েছে — এখন ছবি যোগ করা যাবে।" },
    );
  }

  async function save() {
    if (!album) return;
    const input = {
      albumId: album.id,
      type: "photo" as const,
      fileUrl,
      youtubeUrl: "",
      caption,
      displayOrder: order,
      isPublished,
    };
    const invalid = validateGalleryItemInput(input);
    if (invalid) return setMessage({ ok: false, text: invalid });
    setBusy(true);
    const error = editingId ? await g.editItem(editingId, input) : await g.createItem(input);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error });
    setMessage({ ok: true, text: editingId ? "পরিবর্তন সংরক্ষিত হয়েছে।" : "ছবি যোগ হয়েছে।" });
    resetForm(photos.length > 0 ? Math.max(...photos.map((p) => p.display_order)) + 1 : 0);
  }

  function startEdit(row: GalleryItemRow) {
    setEditingId(row.id);
    setFileUrl(row.file_url ?? "");
    setCaption(row.caption ?? "");
    setOrder(row.display_order);
    setIsPublished(row.is_published);
    setMessage(null);
  }

  async function togglePublish(row: GalleryItemRow) {
    setRowBusyId(row.id);
    const error = await g.setItemPublished(row.id, !row.is_published);
    setRowBusyId(null);
    if (error) setMessage({ ok: false, text: error });
  }

  async function remove(row: GalleryItemRow) {
    setRowBusyId(row.id);
    const error = await g.deleteItem(row.id);
    setRowBusyId(null);
    setConfirmDeleteId(null);
    if (error) setMessage({ ok: false, text: error });
    else if (editingId === row.id) resetForm();
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-bold text-brand-dark">গ্রামের ছবি</h1>
      <p className="mt-1 text-sm text-neutral-500">
            গ্রাম পেজে দেখানো ছবি পরিচালনা।
          </p>

      {!g.isConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Supabase সংযুক্ত নয় — সংরক্ষণ করা যাবে না।
        </p>
      ) : g.loading ? (
        <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
      ) : g.loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          {g.loadError}
        </p>
      ) : !album ? (
        <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <h2 className="text-base font-bold text-brand-dark">শুরু করুন</h2>
          <p className="mt-1 text-sm text-neutral-600">
            ছবি রাখার জন্য প্রথমে "{VILLAGE_ALBUM_TITLE}" নামে একটি অ্যালবাম তৈরি করতে হবে — একবারই করতে হয়।
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void ensureAlbum()}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "তৈরি হচ্ছে…" : "অ্যালবাম তৈরি করুন"}
          </button>
          {message && (
            <p className={`mt-3 text-sm ${message.ok ? "text-brand" : "text-red-700"}`} role="status">
              {message.text}
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-bold text-brand-dark">{editingId ? "ছবি সম্পাদনা" : "নতুন ছবি যোগ করুন"}</h2>
            <div className="mt-3 grid gap-3">
              <PhotoUploadField
                value={fileUrl}
                onChange={setFileUrl}
                pathPrefix="village-photos"
                hideHint
              />
              <div>
                <label className={labelCls} htmlFor="vp-caption">ছবির নাম / ক্যাপশন</label>
                <input
                  id="vp-caption"
                  className={inputCls}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={300}
                  placeholder="যেমন: গ্রামের ঈদগাহ মাঠ"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="vp-order">ক্রম</label>
                  <input
                    id="vp-order"
                    type="number"
                    min={0}
                    className={inputCls}
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                  />
                </div>
                <label className="mt-6 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
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
                {busy ? "সংরক্ষণ হচ্ছে…" : editingId ? "পরিবর্তন সংরক্ষণ করুন" : "ছবি যোগ করুন"}
              </button>
              {editingId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    resetForm();
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
            <h2 className="text-base font-bold text-brand-dark">সংরক্ষিত ছবি</h2>
            {photos.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">এখনো কোনো ছবি যোগ করা হয়নি।</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((row) => (
                  <div key={row.id} className="overflow-hidden rounded-xl ring-1 ring-neutral-200">
                    {row.file_url ? (
                      <img loading="lazy" src={row.file_url} alt={row.caption ?? ""} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <span className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-xs text-slate-400">ছবি নেই</span>
                    )}
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-neutral-700">{row.caption || "(ক্যাপশন নেই)"}</p>
                      <p className="text-[11px] text-neutral-500">ক্রম {row.display_order} · {row.is_published ? "প্রকাশিত" : "খসড়া"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={rowBusyId === row.id}
                          onClick={() => startEdit(row)}
                          className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand/40 hover:bg-brand-light disabled:opacity-60"
                        >
                          সম্পাদনা
                        </button>
                        <button
                          type="button"
                          disabled={rowBusyId === row.id}
                          onClick={() => void togglePublish(row)}
                          className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                        >
                          {row.is_published ? "অপ্রকাশ" : "প্রকাশ"}
                        </button>
                        {confirmDeleteId === row.id ? (
                          <>
                            <button
                              type="button"
                              disabled={rowBusyId === row.id}
                              onClick={() => void remove(row)}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              হ্যাঁ, মুছুন
                            </button>
                            <button
                              type="button"
                              disabled={rowBusyId === row.id}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                            >
                              না
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={rowBusyId === row.id}
                            onClick={() => setConfirmDeleteId(row.id)}
                            className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                          >
                            মুছুন
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
