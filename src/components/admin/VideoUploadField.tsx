import { useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  isYouTubeUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
} from "../../utils/youtube";

/**
 * Video field for admin forms (Village sections + Important
 * Places) — v193. Two ways to set a video, owner's choice:
 * 1. Upload a video file (max 50 MB) to the PUBLIC
 *    `site-assets` bucket; the form stores the public URL.
 * 2. Paste a YouTube link (owner's order, 2026-11-10 — the
 *    standing "device upload only, no URL input" rule gets
 *    this one exception for video, because a linked video
 *    costs the site no Storage egress at all). The pasted URL
 *    is stored as-is in the same field; the public page
 *    renders YouTube values as embeds and file values with
 *    the <video> player (src/utils/youtube.ts).
 * Removing clears the stored value only — an uploaded file
 * itself is not deleted from the bucket.
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
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState("");

  const youTube = isYouTubeUrl(value);
  const thumbnail = youtubeThumbnailUrl(value);

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

  function openLinkMode() {
    setLink(youTube ? value : "");
    setError(null);
    setLinkMode(true);
  }

  function addLink() {
    const v = link.trim();
    if (!youtubeVideoId(v)) {
      setError("সঠিক YouTube লিংক দিন।");
      return;
    }
    setError(null);
    onChange(v);
    setLinkMode(false);
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="grid gap-2">
        {value &&
          (youTube ? (
            <div className="max-w-md">
              {thumbnail && (
                <img
                  src={thumbnail}
                  alt=""
                  className="aspect-video w-full rounded-xl bg-black object-cover"
                  loading="lazy"
                />
              )}
              <p className="mt-1 break-all text-xs text-slate-500">
                YouTube: {value}
              </p>
            </div>
          ) : (
            <video
              src={value}
              controls
              preload="metadata"
              className="aspect-video w-full max-w-md rounded-xl bg-black object-contain"
            />
          ))}
        {linkMode ? (
          <div className="flex max-w-md flex-wrap items-center gap-2">
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="YouTube লিংক"
              disabled={disabled}
              className="min-w-0 flex-1 rounded-md bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              type="button"
              onClick={addLink}
              disabled={disabled}
              className="rounded-md bg-dark-green px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              যোগ করুন
            </button>
            <button
              type="button"
              onClick={() => {
                setLinkMode(false);
                setError(null);
              }}
              disabled={disabled}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60"
            >
              বাতিল
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || disabled}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {uploading ? "আপলোড হচ্ছে…" : value ? "ভিডিও বদলান" : "ডিভাইস থেকে ভিডিও আপলোড করুন"}
            </button>
            <button
              type="button"
              onClick={openLinkMode}
              disabled={uploading || disabled}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60"
            >
              YouTube লিংক দিন
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
        )}
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
