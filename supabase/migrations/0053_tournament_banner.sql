-- =====================================================================
-- Migration 0053 — Tournament banner column, ahead of 0044
-- (owner's tournament fixes, 2026-11-03): `tournaments.banner_url`
-- on its own, so the tournament banner the Admin uploads actually
-- saves and shows on the public site WITHOUT waiting for the
-- parked migration 0044.
--
-- STATUS: DRAFT — not applied live. Applying this file to the
-- live database needs the owner's separate approval, as with
-- every migration.
--
-- Why this file exists: the same column is also part of the
-- parked 0044 draft (its section 1). 0044 stays parked behind the
-- owner's backup gates, but the banner alone was approved to go
-- first. This file adds ONLY that one column — nothing else in
-- 0044 is touched or anticipated here, and no existing column or
-- row is modified.
--
-- Coexistence with 0044: this add uses IF NOT EXISTS, and 0044's
-- own tournaments banner add uses IF NOT EXISTS too, so the two
-- files apply in either order — when 0044 is applied after this
-- file, it skips the banner column it finds already present and
-- adds the rest as written.
-- =====================================================================

alter table public.tournaments
  add column if not exists banner_url text;

comment on column public.tournaments.banner_url is
  'Optional tournament banner image (Storage path or URL); null shows no banner. Added by migration 0053 ahead of the parked 0044, which carries the same column';
