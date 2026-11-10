/**
 * Direct PDF download for the print sheets (owner's request,
 * 2026-11-05; v170): the sheet modals already offer প্রিন্ট
 * করুন (the browser print dialog); this helper adds a direct
 * ডাউনলোড that saves the sheet as a real PDF file, with no
 * print dialog in between.
 *
 * How it works: the sheet's DOM node is rasterised with
 * html-to-image (the browser renders the clone itself, so the
 * Tailwind v4 oklch colours and the Hind Siliguri webfont come
 * out exactly as on screen — the older html2canvas parser
 * throws on oklch) and the image is placed on ONE A4 portrait
 * page with jsPDF, scaled to fit the page. Both libraries are
 * loaded with dynamic import() on click only, so they ship as
 * a separate lazy chunk and never grow the initial bundle.
 *
 * Capture width (v184): the raster is ALWAYS taken from a
 * clone of the sheet laid out at its full A4 design width
 * (210mm ≈ 794px), never from the on-screen node. On a phone
 * the preview sheet is capped by its max-w-full to the
 * viewport width, so capturing the visible node produced a
 * squeezed narrow-strip PDF with reflowed text (the owner's
 * real download measured 784×2602 against the desktop's
 * 1588×2246). The clone lives in an off-screen host only for
 * the duration of the capture; the visible preview — and the
 * প্রিন্ট করুন browser-print path — are never touched.
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

  // Lay a clone of the sheet out at the full design width in
  // an off-screen host (far left of the viewport, never
  // visible, removed as soon as the capture settles). The
  // clone drops the sheet's id so the document never holds
  // two elements with the print sheet's id at once; raster
  // output does not depend on it. The sheet contents use no
  // viewport-responsive sizing, so at 794px the clone lays
  // out exactly like the desktop preview.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;pointer-events:none;";
  const clone = sheet.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const canvas = await toCanvas(clone, {
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
  } finally {
    host.remove();
  }
}
