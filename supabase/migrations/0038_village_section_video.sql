-- =====================================================================
-- Migration 0038 — Optional video for Village sections
-- STATUS: APPLIED LIVE 2026-11-01 (owner-approved; Dashboard run "Success. No rows returned"; REST verified same day).
-- Prepared 2026-11-01 at the owner's approval of the গুরুত্বপূর্ণ
-- স্থান (Important Places) plan: each place may carry ONE video
-- alongside its photo. Applying this file to the live database
-- needs the owner's separate approval.
--
-- Change: village_sections gains a nullable `video_url` column.
-- Values are public URLs of files uploaded to the `site-assets`
-- Storage bucket via the new Admin গুরুত্বপূর্ণ স্থান page
-- (video files only, max 50 MB, enforced in the upload field).
--
-- Column-only change on an existing table: the table's existing
-- grants and RLS policies cover the new column — no GRANT or
-- policy changes are needed (same pattern as 0029/0030/0037).
-- Until this is applied, the app runs tolerantly: video fields
-- stay disabled with an honest notice, everything else works.
-- =====================================================================

begin;

alter table public.village_sections
  add column video_url text;

comment on column public.village_sections.video_url is
  'Optional video (public site-assets URL) for a village section — used by গুরুত্বপূর্ণ স্থান places; added by migration 0038.';

commit;
