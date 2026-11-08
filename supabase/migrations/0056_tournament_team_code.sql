-- =====================================================================
-- Migration 0056 — Tournament Team ID (owner's FINAL model,
-- 2026-11-05, superseding the per-sport model of 0055): a Team
-- ID like A1, A2, B1, B2 … belongs to a TOURNAMENT, not to the
-- sport. Each tournament's ID pool is generated in the app from
-- its team_count (exactly that many IDs, two per letter); at
-- টিম-নিবন্ধন the Admin picks a tournament and one free ID from
-- its pool, and the ID is stored on the team's entry in that
-- tournament (tournament_teams). The same team may hold a
-- different ID in another tournament. An assigned ID can never
-- be given to another team IN THE SAME tournament.
--
-- STATUS: APPLIED LIVE 2026-11-05 (owner tap; verified: column,
-- format CHECK and per-tournament unique index present; no data changed).
-- Applying this file to the
-- live database needs the owner's separate approval, as with
-- every migration. (Number 0045 stays reserved for the postponed
-- group-stage Phase B.)
--
-- What it does (and nothing else) — all on
-- public.tournament_teams (created by migration 0044):
--   1. team_code (text, nullable): the team's Team ID in this
--      tournament. NULL means the entry has no ID.
--   2. A format CHECK: a capital letter followed by 1–2 digits
--      (^[A-Z][0-9]{1,2}$), so A1 … J2 (and beyond) are valid
--      and lowercase or longer codes are not.
--   3. A partial unique index on (tournament_id, team_code) for
--      rows whose team_code is not null: one ID per tournament,
--      while the same ID in another tournament and any number
--      of ID-less entries are fine.
--
-- No new table is created and no GRANT or policy change is
-- needed: the column rides on the existing tournament_teams
-- table, whose grants and RLS policies (migration 0044) already
-- cover it. Migration 0055's teams.team_code column is left in
-- place, dormant — this migration does not touch it. The app
-- probes for this column (the same 42703 fail-soft pattern as
-- before): until this migration is live, no Team ID UI appears
-- anywhere and registration, the tournament panel and the match
-- form keep working exactly as before.
-- =====================================================================

ALTER TABLE public.tournament_teams
  ADD COLUMN IF NOT EXISTS team_code text;

ALTER TABLE public.tournament_teams
  DROP CONSTRAINT IF EXISTS tournament_teams_team_code_format,
  ADD CONSTRAINT tournament_teams_team_code_format
    CHECK (team_code IS NULL OR team_code ~ '^[A-Z][0-9]{1,2}$');

CREATE UNIQUE INDEX IF NOT EXISTS tournament_teams_code_unique
  ON public.tournament_teams (tournament_id, team_code)
  WHERE team_code IS NOT NULL;

COMMENT ON COLUMN public.tournament_teams.team_code IS
  'The team''s Team ID in this tournament (for example A1, B2), picked from the tournament''s ID pool on the Admin team registration form. Unique per tournament; NULL means the entry has no ID.';
