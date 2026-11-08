-- =====================================================================
-- Migration 0050 — Teams extra fields (owner's approved Step B,
-- 2026-11-03): the টিম-নিবন্ধন form gains the team's short name,
-- founding date, captain, coach, jersey colour (name + hex) and a
-- contact phone.
--
-- STATUS: DRAFT — not applied live. Applying this file to the
-- live database needs the owner's separate approval, as with
-- every migration. (Number 0045 stays reserved for the postponed
-- group-stage Phase B.)
--
-- What it does (and nothing else) — all on public.teams, every
-- column nullable, nothing existing is touched:
--   1. short_name (text, CHECK <= 30 chars): the team's short
--      name for scorecards and tight spaces. NULL = not set.
--   2. established_date (date): the date the team was founded.
--      NULL = not recorded.
--   3. captain_name (text, CHECK <= 120 chars): the captain's
--      name. NULL = not recorded.
--   4. coach_name (text, CHECK <= 120 chars): the coach's name.
--      NULL = not recorded.
--   5. jersey_color (text, CHECK <= 60 chars): the jersey
--      colour's name (for example "সবুজ"). NULL = not recorded.
--   6. jersey_color_hex (text, CHECK pattern #RRGGBB): the
--      jersey colour as a hex value, shown as a colour dot
--      beside the team name on the public site. NULL = no dot.
--   7. phone (text, CHECK <= 20 chars): a contact phone for the
--      team. NULL = not recorded.
--
-- No new table is created and no GRANT or policy change is
-- needed: the columns ride on the existing teams table, whose
-- table-level grants and RLS policies (migration 0043) already
-- cover them. The Admin Teams hook probes for these columns as
-- one group (the same fail-soft pattern as registered_by_name /
-- migration 0047): until this migration is live, the new form
-- fields show an honest note, stay disabled, and saves omit
-- them, so the panel keeps working unchanged.
-- =====================================================================

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS short_name text
    CHECK (short_name IS NULL OR char_length(short_name) <= 30),
  ADD COLUMN IF NOT EXISTS established_date date,
  ADD COLUMN IF NOT EXISTS captain_name text
    CHECK (captain_name IS NULL OR char_length(captain_name) <= 120),
  ADD COLUMN IF NOT EXISTS coach_name text
    CHECK (coach_name IS NULL OR char_length(coach_name) <= 120),
  ADD COLUMN IF NOT EXISTS jersey_color text
    CHECK (jersey_color IS NULL OR char_length(jersey_color) <= 60),
  ADD COLUMN IF NOT EXISTS jersey_color_hex text
    CHECK (jersey_color_hex IS NULL OR jersey_color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS phone text
    CHECK (phone IS NULL OR char_length(phone) <= 20);

COMMENT ON COLUMN public.teams.short_name IS
  'The team''s short name (scorecards, tight spaces), entered on the Admin team registration form. NULL means not set.';
COMMENT ON COLUMN public.teams.established_date IS
  'The date the team was founded, entered on the Admin team registration form. NULL means not recorded.';
COMMENT ON COLUMN public.teams.captain_name IS
  'The team captain''s name, entered on the Admin team registration form. NULL means not recorded.';
COMMENT ON COLUMN public.teams.coach_name IS
  'The team coach''s name, entered on the Admin team registration form. NULL means not recorded.';
COMMENT ON COLUMN public.teams.jersey_color IS
  'The jersey colour''s name (for example সবুজ), entered on the Admin team registration form. NULL means not recorded.';
COMMENT ON COLUMN public.teams.jersey_color_hex IS
  'The jersey colour as a #RRGGBB hex value, shown as a colour dot beside the team name on the public site. NULL means no dot.';
COMMENT ON COLUMN public.teams.phone IS
  'A contact phone number for the team, entered on the Admin team registration form. NULL means not recorded.';
