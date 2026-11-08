-- =====================================================================
-- Migration 0029 — Members & Committee page banner settings, stored
-- on the existing site_settings row: banner photo URL, page headline
-- and page description, all editable from Admin Website Settings.
--
-- STATUS: APPLIED LIVE 2026-11-02 (owner's approval; Dashboard SQL Editor, before/after verified: 0 -> 3 columns)
-- owner's instruction (banner + admin arrangement for the Members &
-- Committee page, per the agreed specification: photo on the right
-- of the banner at 480x220, radius 16, headline + description
-- admin-editable). Applying this file to the live database needs
-- the owner's separate approval, as with every migration.
--
-- What it does (and nothing else):
--   1. site_settings.members_banner_url (text, nullable,
--      CHECK <= 1000 chars): the Members & Committee page banner
--      photo URL, set in the Admin Panel through the existing
--      device-upload flow (only the resulting URL is stored).
--      NULL keeps the gradient-only banner.
--   2. site_settings.members_page_title (text, nullable,
--      CHECK <= 80 chars): the banner headline. NULL (or empty)
--      keeps the default "সদস্য ও কমিটি".
--   3. site_settings.members_page_description (text, nullable,
--      CHECK <= 300 chars): the banner description. NULL (or
--      empty) keeps the default description text.
--
-- No new table is created, so no new GRANTs are needed: the columns
-- inherit the existing site_settings table privileges and RLS
-- policies (public read of the single row, admin-only writes).
-- The application code reads these columns through a separate
-- tolerant fetch, so the live site keeps working unchanged until
-- this migration is applied.
-- =====================================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS members_banner_url text
    CHECK (members_banner_url IS NULL OR char_length(members_banner_url) <= 1000),
  ADD COLUMN IF NOT EXISTS members_page_title text
    CHECK (members_page_title IS NULL OR char_length(members_page_title) <= 80),
  ADD COLUMN IF NOT EXISTS members_page_description text
    CHECK (members_page_description IS NULL OR char_length(members_page_description) <= 300);
