-- =====================================================================
-- Migration 0042 — cricket team logo: site_settings gets
-- cricket_team_logo_url, the exact counterpart of the football
-- logo column (migration 0025).
-- STATUS: APPLIED LIVE 2026-11-02 at the owner's tap
-- ("হ্যাঁ, 0042 + 0043 এখন লাইভ করে দাও"); Dashboard result
-- "Success. No rows returned"; post-check verified the column
-- exists (logo_col 0 1).
--
-- WHY: the owner found the football team has a logo facility
-- (Team Settings টিমের লোগো) but cricket has none — no column,
-- no field, no public display. This column is the database half;
-- the app half (admin field + public cricket team card) ships in
-- the same build and degrades honestly until this is applied:
-- reads of the missing column fail soft (logo simply absent) and
-- the admin field shows the "not active yet" notice, exactly
-- like the football logo behaved before 0025 was applied.
--
-- What it does (and nothing else):
--   * add column cricket_team_logo_url text (nullable) to
--     public.site_settings.
-- No policy, grant or data change: site_settings already has its
-- RLS and grants; a new column inherits them.
-- =====================================================================

alter table public.site_settings
  add column cricket_team_logo_url text;

comment on column public.site_settings.cricket_team_logo_url is
  'Cricket team logo URL (Storage public URL), set from Admin টিম সেটিংস (ক্রিকেট). NULL = fall back to the organization logo on the public cricket page. Added by migration 0042.';
