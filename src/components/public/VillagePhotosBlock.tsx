import { useCallback, useEffect, useState } from "react";
import { usePublicGallery } from "../../hooks/usePublicGallery";

/**
 * গ্রামের ছবি — the Village Photos block on the public Village
 * Profile page (owner's order, 2026-11-01). Shows the published
 * photos of the gallery album titled "গ্রামের ছবি" (managed at
 * Admin গ্রামের পরিচিতি গ্রামের ছবি) as a grid; tapping a
 * photo opens a large viewer (close on ✕, backdrop click or
 * Escape; ‹ › move between photos). With no published photos it
 * renders the same honest empty state the page's other blocks
 * use. Photos only — videos live on the গুরুত্বপূর্ণ স্থান block.
 */
export const VILLAGE_ALBUM_TITLE = "গ্রামের ছবি";

export default function VillagePhotosBlock() {
  const { albums, items, loading } = usePublicGallery();
  const [viewer, setViewer] = useState<number | null>(null);

  const album = albums.find((a) => a.title === VILLAGE_ALBUM_TITLE);
  const photos = album
    ? items.filter((i) => i.album_id === album.id && i.type === "photo" && i.file_url)
    : [];

  const close = useCallback(() => setViewer(null), []);
  const step = useCallback(
    (dir: 1 | -1) =>
      setViewer((cur) => (cur === null ? cur : (cur + dir + photos.length) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (viewer === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, close, step]);

  if (loading) return <p className="text-sm text-neutral-500">লোড হচ্ছে…</p>;
  if (photos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
        এখনো কোনো ছবি যোগ করা হয়নি। Admin Panel থেকে ছবি আপলোড করে প্রকাশ করলেই এখানে দেখা যাবে।
      </div>
    );
  }

  const current = viewer !== null ? photos[viewer] : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {photos.map((photo, idx) => (
          <figure key={photo.id} className="overflow-hidden rounded-2xl bg-neutral-50 ring-1 ring-neutral-200/70">
            <button
              type="button"
              onClick={() => setViewer(idx)}
              className="block w-full cursor-pointer"
              aria-label={photo.caption ? `বড় করে দেখুন: ${photo.caption}` : "বড় করে দেখুন"}
            >
              <img
                src={photo.file_url ?? ""}
                alt={photo.caption ?? ""}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.03]"
              />
            </button>
            {photo.caption && (
              <figcaption className="px-3 py-2 text-sm text-neutral-700">{photo.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="ছবি বড় করে দেখা"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="বন্ধ করুন"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/25"
          >
            ✕
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="আগের ছবি"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/25"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="পরের ছবি"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/25"
              >
                ›
              </button>
            </>
          )}
          <figure className="max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={current.file_url ?? ""}
              alt={current.caption ?? ""}
              className="max-h-[82vh] w-auto max-w-full rounded-xl object-contain"
            />
            {current.caption && (
              <figcaption className="mt-3 text-center text-sm text-white/90">{current.caption}</figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
