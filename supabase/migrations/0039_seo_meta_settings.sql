-- =====================================================================
-- Migration 0039 — SEO & social-share settings
-- STATUS: APPLIED LIVE 2026-11-01 (owner-approved; Dashboard run "Success. No rows returned"; REST verified same day).
-- Prepared 2026-11-01 at the owner's order to build the
-- "SEO ও মেটা" admin section. Applying this file to the live
-- database needs the owner's separate approval.
--
-- Change: site_settings gains four nullable columns the Admin
-- SEO ও মেটা page manages —
--   meta_title        browser tab / search-result title override
--   meta_description  search-result + share description
--   meta_keywords     optional comma-separated keywords
--   og_image_url      social share image (site-assets upload URL)
-- When a value is empty, the site falls back to the built-in
-- defaults in index.html (org name + standing description).
--
-- Column-only change on an existing table: existing grants and
-- RLS policies cover the new columns — no GRANT or policy
-- changes are needed (same pattern as 0029/0030/0037/0038).
-- Until applied, the app runs tolerantly: the SEO page shows an
-- honest pending notice and the site keeps its built-in tags.
-- =====================================================================

begin;

alter table public.site_settings
  add column meta_title text,
  add column meta_description text,
  add column meta_keywords text,
  add column og_image_url text;

comment on column public.site_settings.meta_title is
  'SEO title override (Admin SEO ও মেটা); NULL = org name. Added by migration 0039.';
comment on column public.site_settings.meta_description is
  'SEO/share description (Admin SEO ও মেটা); NULL = built-in default. Added by migration 0039.';
comment on column public.site_settings.meta_keywords is
  'Optional comma-separated SEO keywords (Admin SEO ও মেটা). Added by migration 0039.';
comment on column public.site_settings.og_image_url is
  'Social share (Open Graph) image URL (Admin SEO ও মেটা). Added by migration 0039.';

commit;
