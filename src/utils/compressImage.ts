/**
 * Client-side image compression for Admin uploads (owner's
 * storage-quota fix, 2026-11-10 — v191). Supabase's Free plan
 * counts every byte served from Storage, and full-size phone
 * photos (a 1.4 MB portrait was uploaded five times) are what
 * pushed the site over its cached-egress quota. From now on a
 * photo is re-encoded in the browser BEFORE upload: capped at
 * maxDimension px on its long side and saved as WebP at
 * quality 0.85 (transparency is preserved). The file on the
 * server — the one every visitor downloads — is the small
 * one, forever.
 *
 * Safety: the ORIGINAL file is returned unchanged whenever
 * compression does not apply or would not help — non-images,
 * GIF/SVG, files already small at or under the cap, decode
 * failures, and any result that is not smaller than the
 * original. A failed compression never blocks an upload.
 */

const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]);

export async function compressImageForUpload(
  file: File,
  maxDimension = 1920,
): Promise<File> {
  if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  // Already within the cap and small on disk: keep the
  // original bytes exactly as they are.
  if (scale === 1 && file.size <= 300 * 1024) {
    bitmap.close();
    return file;
  }
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  // Never upload something bigger than (or unlabelled
  // compared to) the original.
  if (!blob || !blob.type || blob.size >= file.size) return file;
  const ext =
    blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
