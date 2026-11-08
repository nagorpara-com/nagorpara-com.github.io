-- =====================================================================
-- Migration 0023 — Village Page settings: gallery album choice +
-- banner image URL, stored on the existing site_settings row.
-- STATUS: APPLIED LIVE on 2026-10-25 (Phase VG-2C), at the
-- owner's explicit approval, via the Supabase Dashboard SQL
-- Editor; all post-apply probes passed — see
-- docs/VILLAGE_GALLERY_VG2C_LIVE_APPLY_REPORT_2026-10-25.md.
-- The SQL below is byte-identical to the version that was
-- applied and scratch-verified in Phases VG-2A/VG-2B (whose
-- file SHA-256 was 9b45f0c3c62dd61c4507c3e57ba427acf704309870ac391d1ce0008dc1d4b883);
-- only this status comment was updated afterwards (Phase VG-2D).
-- Prepared 2026-10-25 at the owner's Phase VG-2A instruction:
-- migration DRAFT + plan only. Applying this file to the live
-- database needs the owner's separate approval (the same
-- draft -> scratch -> review -> approve -> apply sequence as
-- migration 0022).
--
-- What it does (and nothing else):
--   1. site_settings.village_gallery_album_id (uuid, nullable,
--      FK -> gallery_albums.id, ON DELETE SET NULL): which
--      gallery album the Village Page's gallery preview shows.
--      NULL (the default, and the state of the existing row)
--      keeps today's behaviour — the preview shows all
--      published items.
--   2. site_settings.village_banner_url (text, nullable): the
--      Village Page banner photo URL, chosen in the Admin Panel
--      from the existing gallery or the existing upload flow
--      (the file itself is never copied — only its URL is
--      stored). NULL keeps today's gradient-only banner.
--
-- What it does NOT do:
--   - No new table, no new bucket, no RLS/policy/grant change:
--     site_settings already has table-level grants and policies
--     (public read; admin writes) and new columns inherit them.
--   - No existing row or column is changed: both columns are
--     added NULL, so the seeded settings row and every reader
--     behave exactly as before until an admin sets a value.
--   - Deleting the chosen album never breaks the setting: the
--     FK clears it (SET NULL) and the preview falls back to
--     showing all published items.
--
-- ROLLBACK (owner-approved only; run manually if ever needed):
--   begin;
--   alter table public.site_settings
--     drop column if exists village_banner_url;
--   alter table public.site_settings
--     drop column if exists village_gallery_album_id;
--   commit;
-- Rollback removes ONLY these two columns (and with them the
-- two stored setting values); no other column, row or table is
-- touched.
-- =====================================================================

begin;

alter table public.site_settings
  add column if not exists village_gallery_album_id uuid
    references public.gallery_albums (id) on delete set null;

alter table public.site_settings
  add column if not exists village_banner_url text;

commit;
