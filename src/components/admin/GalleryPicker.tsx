import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePublicGallery } from "../../hooks/usePublicGallery";
import { safeHttpUrl } from "../../utils/safeUrl";
import type { GalleryItemRow } from "../../hooks/useAdminGallery";

/**
 * Gallery Picker (Phase VG-1, 2026-10-25; media types extended
 * the same day at the owner's "no URL in the Admin Panel" rule)
 * — lets an admin attach an EXISTING published gallery item to
 * a form's media field instead of pasting a URL: village
 * sections, the village banner, member/committee/news/player
 * photos and the site logo all pick from here (or upload).
 *
 * The pick stores the item's own URL in the form (file_url for
 * a photo, youtube_url for a video) — the file is never copied
 * or re-uploaded, so the same item stays a single gallery entry
 * shown in the gallery, the previews and wherever it is picked.
 * Picking another item just changes the stored URL; "সংযোগ
 * সরান" clears it. Nothing here can delete or modify a gallery
 * item or a storage file — this component only reads published
 * items and writes a URL string into the parent form.
 *
 * `mediaType` chooses what is offered: "photo" (default — every
 * existing usage), "video", or "any" for fields that accept
 * both. A stored value that came from an upload simply matches
 * no item, exactly as before.
 */
export default function GalleryPicker({
  value,
  onChange,
  mediaType = "photo",
}: {
  value: string;
  onChange: (url: string) => void;
  mediaType?: "photo" | "video" | "any";
}) {
  const [open, setOpen] = useState(false);
  const { items, loading, error } = usePublicGallery();

  const itemUrl = (item: GalleryItemRow): string | null =>
    item.type === "video" ? safeHttpUrl(item.youtube_url) : safeHttpUrl(item.file_url);

  const offered = useMemo(
    () =>
      items.filter((item) => {
        if (mediaType === "photo" && item.type !== "photo") return false;
        if (mediaType === "video" && item.type !== "video") return false;
        return itemUrl(item) !== null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, mediaType],
  );
  const selected = offered.find((item) => itemUrl(item) === value) ?? null;

  const noun = mediaType === "video" ? "ভিডিও" : mediaType === "any" ? "ছবি/ভিডিও" : "ছবি";
  const emptyNoun = mediaType === "video" ? "ভিডিও" : mediaType === "any" ? "ছবি বা ভিডিও" : "ছবি";

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-dark-green ring-1 ring-slate-300 transition hover:bg-slate-100"
        >
          {open ? "Gallery Picker বন্ধ করুন" : `Website Gallery থেকে ${noun} বাছুন`}
        </button>
        {selected && (
          <>
            <span className="text-xs font-medium text-slate-600">
              Gallery Item যুক্ত আছে: {selected.caption ?? "Caption নেই"}
            </span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
            >
              সংযোগ সরান (Unlink)
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {loading ? (
            <p className="text-sm text-slate-500">Gallery পড়া হচ্ছে…</p>
          ) : error ? (
            <p className="text-sm font-medium text-red-600">
              Gallery পড়া যায়নি — নেটওয়ার্ক যাচাই করে আবার চেষ্টা করুন।
            </p>
          ) : offered.length === 0 ? (
            <div className="rounded-md bg-white p-3 ring-1 ring-slate-200">
              <p className="text-sm text-slate-600">
                Gallery-তে এখনো কোনো প্রকাশিত {emptyNoun} নেই — আগে Gallery
                Management-এ {emptyNoun} যোগ করে প্রকাশ করুন, তারপর এখান থেকে
                বেছে নেওয়া যাবে। (Upload পথটি আগের মতোই ব্যবহার করা যাবে।)
              </p>
              <Link
                to="/admin/gallery"
                className="mt-2 inline-block text-sm font-semibold text-primary underline"
              >
                Gallery Management-এ যান
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {offered.map((item) => {
                  const url = itemUrl(item) as string;
                  const isSelected = url === value;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChange(isSelected ? "" : url)}
                      aria-pressed={isSelected}
                      className={`group overflow-hidden rounded-md bg-white text-left ring-2 transition ${
                        isSelected
                          ? "ring-gold"
                          : "ring-slate-200 hover:ring-primary/50"
                      }`}
                    >
                      {item.type === "video" ? (
                        <span className="flex aspect-[4/3] w-full items-center justify-center bg-brand-dark text-white" aria-hidden="true">
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
                        </span>
                      ) : (
                        <img
                          src={url}
                          alt={item.caption ?? "Gallery-এর ছবি"}
                          className="aspect-[4/3] w-full object-cover"
                          loading="lazy"
                        />
                      )}
                      <span className="block truncate px-1.5 py-1 text-[11px] text-slate-600">
                        {isSelected ? "✓ নির্বাচিত — " : ""}
                        {item.type === "video" ? "🎬 " : ""}
                        {item.caption ?? "Caption নেই"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {noun}-তে Click করলেই এই Field-এ যুক্ত হবে — মূল Gallery Item
                বা File-এর কোনো পরিবর্তন হবে না।
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
