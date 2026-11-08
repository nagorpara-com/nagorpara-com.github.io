/**
 * Only http: and https: URLs may be rendered as links or image
 * sources on public pages. Anything else (javascript:, data:,
 * scheme-relative or malformed values that could have been typed
 * into an admin field) is rejected and the item is skipped — the
 * database stores what the admin entered; the public renderer is
 * responsible for not turning it into an unsafe link.
 */
export function safeHttpUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
