/**
 * Direct PDF download for the print sheets (owner's request,
 * 2026-11-05; v170): the sheet modals already offer প্রিন্ট
 * করুন (the browser print dialog); this helper adds a direct
 * ডাউনলোড that saves the sheet as a real PDF file, with no
 * print dialog in between.
 *
 * How it works: the sheet's own DOM node is rasterised with
 * html-to-image (the browser renders the clone itself, so the
 * Tailwind v4 oklch colours and the Hind Siliguri webfont come
 * out exactly as on screen — the older html2canvas parser
 * throws on oklch) and the image is placed on ONE A4 portrait
 * page with jsPDF, scaled to fit the page. Both libraries are
 * loaded with dynamic import() on click only, so they ship as
 * a separate lazy chunk and never grow the initial bundle.
 *
 * Failure behaviour: any error (library load, rasterise, or
 * PDF build) rejects the promise; the caller shows a plain
 * Bengali message. Nothing here fails silently, and a broken
 * image inside the sheet degrades to a blank slot instead of
 * aborting the whole download.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Transparent 1x1 PNG, used if a sheet image cannot be
 * fetched for embedding (the slot renders blank, the rest of
 * the sheet still downloads). */
const EMPTY_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Make an ASCII-only file-name slug from a display name:
 * lowercase letters and digits are kept, every other run of
 * characters becomes one dash. File names stay ASCII on
 * purpose — a blob download whose name carries Bengali (or
 * other non-ASCII) characters loses its name entirely in
 * some browsers and is saved as a bare "download". A purely
 * Bengali name therefore slugs to "" and the caller falls
 * back to a fixed word (season, Team ID, ...).
 */
export function asciiFileSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/**
 * Rasterise the given sheet element and save it as a one-page
 * A4 PDF named `${fileStem}.pdf`. The sheet is scaled to fit
 * the page (never cropped, never split across pages) and
 * centred horizontally, which for the sheets' natural A4 size
 * is the full page, keeping the print version's margins look.
 */
export async function downloadSheetPdf(
  sheet: HTMLElement,
  fileStem: string,
): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

  const canvas = await toCanvas(sheet, {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    cacheBust: true,
    imagePlaceholder: EMPTY_IMAGE,
    onImageErrorHandler: () => undefined,
  });
  if (!canvas.width || !canvas.height) {
    throw new Error("Sheet render produced an empty image");
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const fit = Math.min(
    A4_WIDTH_MM / canvas.width,
    A4_HEIGHT_MM / canvas.height,
  );
  const widthMm = canvas.width * fit;
  const heightMm = canvas.height * fit;
  const xMm = (A4_WIDTH_MM - widthMm) / 2;
  pdf.addImage(
    canvas.toDataURL("image/jpeg", 0.96),
    "JPEG",
    xMm,
    0,
    widthMm,
    heightMm,
  );
  pdf.save(`${fileStem}.pdf`);
}
