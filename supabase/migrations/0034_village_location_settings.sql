-- =====================================================================
-- Migration 0034 — Village location settings: four new columns on
-- site_settings holding the Village Page's "অবস্থান ও ঠিকানা"
-- tiles (গ্রাম / উপজেলা / জেলা / দেশ), managed from Admin
-- গ্রামের পরিচিতি অবস্থান ও ঠিকানা (owner's order, 2026-10-29 —
-- he picked this section first of the three remaining village
-- sub-pages). The পূর্ণ ঠিকানা line keeps using the EXISTING
-- site_settings.address column (edited from the same new page).
--
-- STATUS: APPLIED LIVE 2026-10-29 (owner's approval in chat;
-- run once via the Supabase Dashboard SQL Editor; verified over
-- REST — the four columns read back, all NULL, so the built-in
-- defaults show until the owner edits them in the Admin Panel).
-- The application code stays tolerant of missing columns: the
-- public page falls back to the built-in defaults (নগর পাড়া /
-- তাড়াশ / সিরাজগঞ্জ / বাংলাদেশ — the confirmed facts), and the
-- Admin page shows an honest "database update pending" notice
-- instead of failing.
--
-- What it does (and nothing else):
--   1. Adds four NULLABLE text columns to public.site_settings:
--      village_name, upazila_name, district_name, country_name —
--      each capped at 120 characters by a CHECK. NULL = the
--      built-in default is shown (no row changes needed).
--   2. No new table, no policy change: site_settings already has
--      RLS (public read, editor write) and its GRANTs, so no new
--      GRANT statements are needed for added columns.
-- =====================================================================

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS village_name text
    CHECK (village_name IS NULL OR char_length(village_name) <= 120),
  ADD COLUMN IF NOT EXISTS upazila_name text
    CHECK (upazila_name IS NULL OR char_length(upazila_name) <= 120),
  ADD COLUMN IF NOT EXISTS district_name text
    CHECK (district_name IS NULL OR char_length(district_name) <= 120),
  ADD COLUMN IF NOT EXISTS country_name text
    CHECK (country_name IS NULL OR char_length(country_name) <= 120);
