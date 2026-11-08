/**
 * Gallery item validation + payload (pure — unit-testable).
 *
 * Mirrors the EXISTING schema (migration 0001): gallery_items has
 * type ('photo' | 'video'), file_url (photos), youtube_url (videos),
 * caption, display_order, is_published and an optional album_id.
 * There is NO title or alt-text column — the caption serves both as
 * the visible label and the image alt text. Adding title/alt columns
 * would need a migration and is not required for a working gallery.
 */
export interface GalleryItemInput {
  albumId: string;
  type: "photo" | "video";
  fileUrl: string;
  youtubeUrl: string;
  caption: string;
  displayOrder: number;
  isPublished: boolean;
}

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtu\.be)$/i;

export function isYouTubeUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && YOUTUBE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** Extract a YouTube video id for embedding; null when unparseable. */
export function youTubeVideoId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/,
  );
  return match ? match[1] : null;
}

export function validateGalleryItemInput(input: GalleryItemInput): string | null {
  if (input.type === "photo") {
    const url = input.fileUrl.trim();
    if (!url) return "ছবির জন্য Upload করুন অথবা একটি Image URL দিন।";
    if (!/^https?:\/\/.+/.test(url)) return "ছবির সঠিক URL দিন (http/https দিয়ে শুরু)।";
  } else {
    const url = input.youtubeUrl.trim();
    if (!url) return "ভিডিওর জন্য YouTube URL আবশ্যক।";
    if (!isYouTubeUrl(url)) return "শুধু YouTube-এর URL গ্রহণযোগ্য (youtube.com বা youtu.be)।";
  }
  if (input.caption.trim().length > 300) return "Caption ৩০০ অক্ষরের মধ্যে রাখুন।";
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0)
    return "ক্রম অবশ্যই ০ বা তার বেশি পূর্ণ সংখ্যা হতে হবে।";
  return null;
}

export function galleryItemPayload(input: GalleryItemInput) {
  return {
    album_id: input.albumId || null,
    type: input.type,
    file_url: input.type === "photo" ? input.fileUrl.trim() || null : null,
    youtube_url: input.type === "video" ? input.youtubeUrl.trim() || null : null,
    caption: input.caption.trim() || null,
    display_order: input.displayOrder,
    is_published: input.isPublished,
  };
}

export function validateAlbumTitle(title: string): string | null {
  if (!title.trim()) return "Album-এর নাম আবশ্যক।";
  if (title.trim().length > 120) return "Album-এর নাম ১২০ অক্ষরের মধ্যে রাখুন।";
  return null;
}
