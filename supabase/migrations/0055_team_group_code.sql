-- =====================================================================
-- Migration 0055 — Team group code (owner's confirmed model,
-- 2026-11-05): at টিম-নিবন্ধন (Admin team registration) each team
-- may be given a GROUP CODE like A1, A2, B1, B2 … chosen from a
-- dropdown. A code already taken by another team of the SAME
-- sport no longer appears in the dropdown; the same code in the
-- other sport is fine. The code is a label only — it is shown
-- beside the team in the Admin registration list and in the
-- Admin match form's টিম A / টিম B pickers, never publicly, and
-- it does not change display_order sorting or tournament seeds.
--
-- STATUS: APPLIED LIVE 2026-11-05 (owner tap; verified: column,
-- format CHECK and partial unique index present; no data changed).
-- Applying this file to the
-- live database needs the owner's separate approval, as with
-- every migration. (Number 0045 stays reserved for the postponed
-- group-stage Phase B.)
--
-- What it does (and nothing else) — all on public.teams:
--   1. team_code (text, nullable): the team's group code. NULL
--      means the team has no code.
--   2. A format CHECK: a capital letter followed by 1–2 digits
--      (^[A-Z][0-9]{1,2}$), so A1 … H10 (and beyond) are valid
--      and lowercase or longer codes are not.
--   3. A partial unique index on (sport, team_code) for rows
--      whose team_code is not null: one code per sport, while
--      any number of code-less teams may coexist.
--
-- No new table is created and no GRANT or policy change is
-- needed: the column rides on the existing teams table, whose
-- table-level grants and RLS policies (migration 0043) already
-- cover it. The Admin Teams hook probes for this column (the
-- same fail-soft pattern as registered_by_name / migration
-- 0047): until this migration is live, the code field does not
-- appear in the form and match-form labels stay plain, so the
-- panel keeps working unchanged.
-- =====================================================================

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS team_code text;

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_team_code_format,
  ADD CONSTRAINT teams_team_code_format
    CHECK (team_code IS NULL OR team_code ~ '^[A-Z][0-9]{1,2}$');

CREATE UNIQUE INDEX IF NOT EXISTS teams_sport_team_code_unique
  ON public.teams (sport, team_code)
  WHERE team_code IS NOT NULL;

COMMENT ON COLUMN public.teams.team_code IS
  'The team''s group code (for example A1, B2), chosen from a dropdown on the Admin team registration form. Unique per sport; NULL means the team has no code.';
