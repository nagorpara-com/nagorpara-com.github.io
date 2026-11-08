/**
 * SEO meta application (pure DOM helper) — the runtime half of
 * the Admin SEO ও মেটা page (migration 0039). Sets the page
 * title and the description / Open Graph / Twitter meta tags
 * from the admin-saved values. A value that is empty leaves the
 * built-in index.html default untouched, so the site never ends
 * up with WORSE tags than its static defaults.
 */

export interface SeoMetaValues {
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image_url: string | null;
  /** Fallback title when meta_title is empty: the org name. */
  org_name: string | null;
}

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function applySeoMeta(values: SeoMetaValues): void {
  const title = values.meta_title?.trim() || values.org_name?.trim();
  if (title) {
    document.title = title;
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
  }
  const description = values.meta_description?.trim();
  if (description) {
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
  }
  const keywords = values.meta_keywords?.trim();
  if (keywords) {
    setMeta('meta[name="keywords"]', "name", "keywords", keywords);
  }
  const image = values.og_image_url?.trim();
  if (image) {
    setMeta('meta[property="og:image"]', "property", "og:image", image);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  }
  setMeta('meta[property="og:type"]', "property", "og:type", "website");
}
