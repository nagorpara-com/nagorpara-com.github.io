import { useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

/**
 * Photo upload field for admin forms (members, committee,
 * village, gallery, news, logo) — image files only, max 2 MB,
 * uploaded to the PUBLIC `site-assets` bucket (storage
 * policies: anyone reads, content editors write), after which
 * the form stores the public URL. There is deliberately NO
 * URL input anywhere in the Admin Panel (owner's rule,
 * 2026-10-25): a photo is either uploaded here or picked from
 * the Website Gallery via GalleryPicker. Removing clears the
 * stored URL only — the file is not deleted from the bucket.
 */
export default function PhotoUploadField({
  value,
  onChange,
  pathPrefix,
  label = "ছবি",
  hideHint = false,
  bucket = "site-assets",
  sizeHint,
}: {
  value: string;
  onChange: (url: string) => void;
  pathPrefix: string;
  label?: string;
  /** Hide the small "JPG/PNG … 2 MB" helper line (owner asked
   * for it off on the Village admin page, 2026-10-29; the 2 MB
   * limit itself is still enforced with an error message). */
  hideHint?: boolean;
  /** Storage bucket override. Default is the shared PUBLIC
   * `site-assets` bucket; the Players form passes its dedicated
   * `player-photos` bucket so player photos keep living where
   * they always have (2026-11-02). */
  bucket?: string;
  /** Recommended upload size for THIS field's display frame,
   * shown as a "প্রস্তাবিত সাইজ: …" line right under the upload
   * button (owner's order, 2026-11-02: wherever a photo is
   * uploaded, the size to upload must be written under the
   * button). The size line shows even when hideHint hides the
   * generic helper line — since 2026-11-02 (v134) the banner
   * sections must carry their size everywhere, including the
   * village banner card. */
  sizeHint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onFile(file: File) {
    if (!supabase) {
      setError("Supabase সংযুক্ত নয় — আপলোড করা যাচ্ছে না।");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("শুধু ছবির ফাইল আপলোড করা যাবে (অন্য ধরনের ফাইল গ্রহণযোগ্য নয়)।");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("ছবির আকার সর্বোচ্চ 2 MB হতে হবে — ছোট বা সংকুচিত ছবি বেছে নিন।");
      return;
    }
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file);
    if (upErr) {
      setUploading(false);
      setPreview(null);
      setError(`ছবি আপলোড ব্যর্থ: ${upErr.message}`);
      return;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  }

  // The stored URL is the source of truth: the local object
  // URL preview shows ONLY while its upload is in flight, so a
  // form reset (value cleared after save) never leaves a stale
  // photo behind.
  const shown = value || (uploading ? preview : null);

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-start gap-3">
        {shown ? (
          <img loading="lazy"
            src={shown}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-slate-200"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400 ring-2 ring-slate-200">
            ছবি নেই
          </span>
        )}
        <div className="grid flex-1 gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {uploading ? "আপলোড হচ্ছে…" : "ডিভাইস থেকে ছবি আপলোড করুন"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  if (preview) URL.revokeObjectURL(preview);
                  setPreview(null);
                }}
                disabled={uploading}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
              >
                ছবি সরান
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="ছবির ফাইল বেছে নিন"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          {sizeHint && (
            <p className="text-xs font-medium text-slate-500">প্রস্তাবিত সাইজ: {sizeHint}</p>
          )}
          {!hideHint && (
            <p className="text-xs text-slate-400">JPG/PNG ছবি, সর্বোচ্চ 2 MB।</p>
          )}
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
