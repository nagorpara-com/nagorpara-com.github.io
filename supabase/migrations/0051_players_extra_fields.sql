-- =====================================================================
-- Migration 0051 — Players extra fields (owner's approved Step B,
-- 2026-11-03): the প্লেয়ার form gains date of birth, phone,
-- address, a preferred-foot field for football and a playing-role
-- field for cricket (the role replaces the free-text position
-- for cricket in the form).
--
-- STATUS: DRAFT — not applied live. Applying this file to the
-- live database needs the owner's separate approval, as with
-- every migration. (Number 0045 stays reserved for the postponed
-- group-stage Phase B.)
--
-- What it does (and nothing else) — all on public.players, every
-- column nullable, nothing existing is touched:
--   1. date_of_birth (date): the player's date of birth. The
--      public profile shows the computed age, never the raw
--      birth date math by hand. NULL = not recorded.
--   2. phone (text, CHECK <= 20 chars): the player's phone.
--      ADMIN ONLY by application rule: no public query selects
--      this column and no public page renders it. NULL = not
--      recorded.
--   3. address (text, CHECK <= 300 chars): the player's
--      address. ADMIN ONLY, same rule as phone. NULL = not
--      recorded.
--   4. preferred_foot (text, CHECK one of right / left / both):
--      a footballer's preferred foot. NULL = not recorded.
--   5. role (text, CHECK one of batsman / bowler / all_rounder /
--      wicket_keeper): a cricketer's playing role. NULL = not
--      recorded (older rows keep their free-text position).
--
-- players.is_active already exists (migration 0001), so the
-- form's সক্রিয় toggle needs no column here.
--
-- No new table is created and no GRANT or policy change is
-- needed: the columns ride on the existing players table, whose
-- table-level grants and RLS policies already cover them. The
-- Admin player form probes for these columns as one group (the
-- same fail-soft pattern as club / 0025 and team_id / 0046):
-- until this migration is live, the new fields show an honest
-- note, stay disabled, and saves omit them. Public player
-- queries select an explicit column list (never phone or
-- address) and fall back to the pre-0051 list while the columns
-- are missing, so the public site keeps working unchanged.
-- =====================================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS phone text
    CHECK (phone IS NULL OR char_length(phone) <= 20),
  ADD COLUMN IF NOT EXISTS address text
    CHECK (address IS NULL OR char_length(address) <= 300),
  ADD COLUMN IF NOT EXISTS preferred_foot text
    CHECK (preferred_foot IS NULL OR preferred_foot IN ('right', 'left', 'both')),
  ADD COLUMN IF NOT EXISTS role text
    CHECK (role IS NULL OR role IN ('batsman', 'bowler', 'all_rounder', 'wicket_keeper'));

COMMENT ON COLUMN public.players.date_of_birth IS
  'The player''s date of birth, entered on the Admin player form; the public profile shows the computed age. NULL means not recorded.';
COMMENT ON COLUMN public.players.phone IS
  'The player''s phone number. ADMIN ONLY: no public query selects this column and no public page renders it. NULL means not recorded.';
COMMENT ON COLUMN public.players.address IS
  'The player''s address. ADMIN ONLY: no public query selects this column and no public page renders it. NULL means not recorded.';
COMMENT ON COLUMN public.players.preferred_foot IS
  'A footballer''s preferred foot: right, left or both. NULL means not recorded.';
COMMENT ON COLUMN public.players.role IS
  'A cricketer''s playing role: batsman, bowler, all_rounder or wicket_keeper. NULL means not recorded; older rows keep their free-text position.';
