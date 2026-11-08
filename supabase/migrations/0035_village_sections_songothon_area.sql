-- =====================================================================
-- Migration 0035 — village_sections: allow a SIXTH block area,
-- 'songothon' (সংগঠন পরিচিতি), so the Village Page's last
-- fixed-text block can be managed from Admin গ্রামের পরিচিতি
-- like every other block (owner's order, 2026-10-29: he checked
-- the category chips under অবস্থান ও ঠিকানা on the public page
-- and ordered Admin editing for everything a visitor can open).
--
-- STATUS: APPLIED LIVE 2026-10-29 (owner's approval in chat;
-- run once via the Supabase Dashboard SQL Editor; the table
-- reads back normally over REST). The application code stays
-- tolerant: with no published 'songothon' rows the public block
-- keeps its built-in text (পরিচিতি + উদ্দেশ্য).
--
-- What it does (and nothing else):
--   Replaces the village_sections_area_check constraint from
--   migration 0022 with the same list PLUS 'songothon'. No data
--   is touched; existing rows keep their areas. No new table,
--   no policy or GRANT change (village_sections already has
--   both from 0001/0022).
-- =====================================================================

ALTER TABLE public.village_sections
  DROP CONSTRAINT IF EXISTS village_sections_area_check;

ALTER TABLE public.village_sections
  ADD CONSTRAINT village_sections_area_check
  CHECK (area IN ('porichiti', 'itihash', 'sthan', 'prokriti', 'karjokrom', 'songothon'));
