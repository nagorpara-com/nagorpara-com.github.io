import { useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

/**
 * Video upload field for admin forms (Important Places) —
 * video files only, max 50 MB, uploaded to the PUBLIC
 * `site-assets` bucket, after which the form stores the public
 * URL. Same discipline as PhotoUploadField: device upload only,
 * no URL input; removing clears the stored URL only (the file
 * itself is not deleted from the bucket).
 */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export default function VideoUploadField({
  value,
  onChange,
  pathPrefix,
  label = "ভিডিও",
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  pathPrefix: string;
  label?: string;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    if (!supabase) {
      setError("Supabase সংযুক্ত নয় — আপলোড করা যাচ্ছে না।");
      return;
    }
    if (!file.type.startsWith("video/")) {
      setError("শুধু ভিডিও ফাইল আপলোড করা যাবে (অন্য ধরনের ফাইল গ্রহণযোগ্য নয়)।");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("ভিডিওর আকার সর্বোচ্চ 50 MB হতে হবে — ছোট বা সংকুচিত ভিডিও বেছে নিন।");
      return;
    }
    setError(null);
    setUploading(true);
    const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from("site-assets")
      .upload(path, file);
    if (upErr) {
      setUploading(false);
      setError(`ভিডিও আপলোড ব্যর্থ: ${upErr.message}`);
      return;
    }
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="grid gap-2">
        {value && (
          <video
            src={value}
            controls
            preload="metadata"
            className="aspect-video w-full max-w-md rounded-xl bg-black object-contain"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || disabled}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {uploading ? "আপলোড হচ্ছে…" : value ? "ভিডিও বদলান" : "ডিভাইস থেকে ভিডিও আপলোড করুন"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={uploading || disabled}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
            >
              ভিডিও সরান
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          aria-label="ভিডিও ফাইল বেছে নিন"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      </div>
    </div>
  );
}
