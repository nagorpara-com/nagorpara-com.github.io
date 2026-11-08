-- =====================================================================
-- Migration 0049 — Sports page banner settings, stored on the
-- existing site_settings row: TWO banners for the public
-- ক্রীড়া প্রতিযোগিতা page (/sports), each with a photo and a
-- line of text shown inside the banner, managed from the Admin
-- page "ক্রীড়া প্রতিযোগিতা ব্যানার" inside the sports section.
--
-- STATUS: DRAFT — not applied live. Applying this file to the
-- live database needs the owner's separate approval, as with
-- every migration. (Number 0045 stays reserved for the postponed
-- group-stage Phase B.)
--
-- owner's instructions (2026-11-03): the sports page takes two
-- banners — one at the top of the page (above the football /
-- cricket part) and one above the টুর্নামেন্ট section — and
-- each banner can carry text written inside it.
--
-- What it does (and nothing else):
--   1. site_settings.sports_banner_url (text, nullable,
--      CHECK <= 1000 chars): the TOP banner photo URL. NULL
--      keeps the built-in green gradient.
--   2. site_settings.sports_banner_title (text, nullable,
--      CHECK <= 120 chars): the text shown inside the top
--      banner. NULL shows no text.
--   3. site_settings.sports_tournament_banner_url (text,
--      nullable, CHECK <= 1000 chars): the photo URL of the
--      banner above the টুর্নামেন্ট section. NULL (with no
--      title) hides that banner strip entirely.
--   4. site_settings.sports_tournament_banner_title (text,
--      nullable, CHECK <= 120 chars): the text shown inside
--      the tournament banner.
--
-- No new table is created, so no new GRANTs are needed: the
-- columns inherit the existing site_settings table privileges
-- and RLS policies (public read of the single row, admin-only
-- writes). The application code reads these columns through
-- separate tolerant fetches, so the live site keeps working
-- unchanged until this migration is applied.
-- =====================================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS sports_banner_url text
    CHECK (sports_banner_url IS NULL OR char_length(sports_banner_url) <= 1000),
  ADD COLUMN IF NOT EXISTS sports_banner_title text
    CHECK (sports_banner_title IS NULL OR char_length(sports_banner_title) <= 120),
  ADD COLUMN IF NOT EXISTS sports_tournament_banner_url text
    CHECK (sports_tournament_banner_url IS NULL OR char_length(sports_tournament_banner_url) <= 1000),
  ADD COLUMN IF NOT EXISTS sports_tournament_banner_title text
    CHECK (sports_tournament_banner_title IS NULL OR char_length(sports_tournament_banner_title) <= 120);
