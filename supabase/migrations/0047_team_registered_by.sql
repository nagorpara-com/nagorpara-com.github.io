-- 0047_team_registered_by.sql
-- Record WHOSE NAME a team is registered under (owner's order,
-- 2026-11-02: the টিম-নিবন্ধন form needs a field for the person
-- the team is being registered for — the team's responsible
-- person / owner).
--
-- DRAFT — not applied live. Applying needs the owner's separate
-- approval, like every live migration. (Number 0045 stays
-- reserved for the postponed group-stage Phase B.)
--
-- Shape: one nullable text column, nothing else. No RLS or
-- grant change: the column rides on the existing teams table,
-- whose table-level grants and policies already cover it. The
-- admin Teams hook probes for this column (the same pattern as
-- players.club / migration 0025): until this migration is live,
-- the field shows an honest note and saves omit it.

alter table public.teams
  add column if not exists registered_by_name text;

alter table public.teams
  drop constraint if exists teams_registered_by_name_len,
  add constraint teams_registered_by_name_len
    check (registered_by_name is null or char_length(registered_by_name) <= 120);

comment on column public.teams.registered_by_name is
  'The name of the person this team is registered under (the team''s responsible person / owner), entered on the Admin team registration form. NULL means not recorded.';
