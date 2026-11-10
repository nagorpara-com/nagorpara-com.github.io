/**
 * YouTube link helpers (owner's request, 2026-11-10 — v193).
 * Videos added by LINK are stored as the pasted YouTube URL in
 * the same `video_url` column a Storage file URL uses; the
 * public page tells the two apart with youtubeEmbedUrl():
 * a YouTube value renders as an embed, anything else keeps
 * the plain <video> player. Keeping every byte of video
 * traffic on YouTube is also what keeps the site inside
 * Supabase's free egress quota.
 *
 * Accepted shapes: youtube.com/watch?v=ID, /shorts/ID,
 * /embed/ID, /live/ID (also m. and music. subdomains) and
 * youtu.be/ID. The ID must be exactly 11 characters of
 * [A-Za-z0-9_-]; anything else is not a YouTube video link.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        id = parts[1] ?? null;
      }
    }
  }
  return id && ID_PATTERN.test(id) ? id : null;
}

export function isYouTubeUrl(raw: string): boolean {
  return youtubeVideoId(raw) !== null;
}

/** The privacy-enhanced embed URL for a YouTube link, or
 * null when the value is not a YouTube link. */
export function youtubeEmbedUrl(raw: string): string | null {
  const id = youtubeVideoId(raw);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** YouTube's own thumbnail for a video link (Admin preview). */
export function youtubeThumbnailUrl(raw: string): string | null {
  const id = youtubeVideoId(raw);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
