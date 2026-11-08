-- =====================================================================
-- Migration 0022 — village_sections.area: which Village Profile
-- block a section belongs to (Phase V-1A preparation)
-- STATUS: APPLIED LIVE on 2026-10-25 (Phase V-1C), at the
-- owner's explicit approval, via the Supabase Dashboard SQL
-- Editor; all post-apply probes passed — see
-- docs/VILLAGE_V1C_LIVE_APPLY_REPORT_2026-10-25.md.
-- The SQL below is byte-identical to the version that was
-- applied and scratch-verified in Phases V-1A/V-1B (whose file
-- SHA-256 was c2d44cfd8160246d775103e88b9738c3b485cbd9dea615442381e1acdef7bd0a);
-- only this status comment was updated afterwards (Phase V-1D).
-- Prepared 2026-10-25 at the owner's Phase V-1A instruction:
-- migration FILE + scratch verification + implementation plan
-- only. Applying this file to the live database needs the
-- owner's separate approval.
--
-- Purpose (Phase 1 Village Profile audit, 2026-10-25):
--   The public Village Profile page has eight blocks, but only
--   "গ্রামের পরিচিতি" is database-driven: village_sections has
--   no column saying which block a row belongs to, so every
--   published row lands in the intro block, and ইতিহাস /
--   গুরুত্বপূর্ণ স্থান / প্রকৃতি ও পরিবেশ / কার্যক্রম have no
--   admin path at all (hardcoded empty states in code).
--   This migration adds ONE column so a row can be routed to
--   its block. The allowed values are the page's OWN existing
--   anchor ids (VillageProfilePage ANCHORS), not new inventions:
--     porichiti  গ্রামের পরিচিতি (current behaviour)
--     itihash    গ্রামের ইতিহাস
--     sthan      গুরুত্বপূর্ণ স্থান ও স্থাপনা
--     prokriti   প্রকৃতি ও পরিবেশ
--     karjokrom  সামাজিক, সাংস্কৃতিক ও ক্রীড়া কার্যক্রম
--   (অবস্থান ও ঠিকানা, ছবি গ্যালারি and সংগঠন পরিচিতি are NOT
--   village_sections areas — they stay settings/gallery/about
--   driven, untouched.)
--
-- Data safety:
--   * ADD COLUMN with DEFAULT 'porichiti': every existing row
--     reads as 'porichiti', which is exactly where every row
--     renders today — zero behaviour change on apply.
--   * No existing column, row, policy, grant or index is
--     touched. RLS is NOT modified. No GRANT section is needed:
--     this migration creates no table, and the 0010 grants for
--     village_sections already cover the table (grants are
--     table-level, they extend to the new column automatically).
--   * The CHECK constraint only rejects values outside the five
--     block keys; it cannot invalidate existing data (default).
--
-- Rollback (run manually, in this order, if ever needed):
--   drop index if exists public.village_sections_area_order_idx;
--   alter table public.village_sections
--     drop constraint if exists village_sections_area_check;
--   alter table public.village_sections drop column if exists area;
--   (All other columns and every row survive a rollback; only
--   the block assignments recorded in `area` are lost.)
-- =====================================================================

begin;

alter table public.village_sections
  add column area text not null default 'porichiti';

alter table public.village_sections
  add constraint village_sections_area_check
  check (area in ('porichiti', 'itihash', 'sthan', 'prokriti', 'karjokrom'));

create index village_sections_area_order_idx
  on public.village_sections (area, display_order);

commit;
