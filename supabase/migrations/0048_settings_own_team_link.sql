-- 0048_settings_own_team_link.sql
-- Link Team Settings to the team registry (টিম-নিবন্ধন): WHICH
-- registered team is the organization's OWN team, per sport
-- (owner's order, 2026-11-02: প্লেয়ার, টিম-নিবন্ধন and টিম
-- সেটিং must be connected per sport — this is the link that
-- was missing). When a team is linked, the public site takes
-- the team's name (and logo, when it has one) from the
-- registry row, so editing the team in টিম-নিবন্ধন updates
-- every public surface at once. The settings' own name/logo
-- fields remain as the fallback when nothing is linked (or
-- the linked team cannot be read publicly).
--
-- DRAFT — not applied live. Applying needs the owner's
-- separate approval, like every live migration. (Number 0045
-- stays reserved for the postponed group-stage Phase B.)
--
-- Shape: two nullable FK columns on the single site_settings
-- row, nothing else. No RLS or grant change: the columns ride
-- on site_settings, whose policies and grants already exist.
-- Deleting a registered team SET NULLs the link — the site
-- falls back to the settings name/logo, never breaks.
-- The app reads and writes these columns through NARROW
-- separate queries (the same pattern as the 0025 logo
-- column), so until this migration is live everything keeps
-- working and the Team Settings page shows an honest note.

alter table public.site_settings
  add column if not exists football_team_id uuid references public.teams(id) on delete set null,
  add column if not exists cricket_team_id uuid references public.teams(id) on delete set null;

comment on column public.site_settings.football_team_id is
  'The registered team (public.teams) that is the organization''s own FOOTBALL team, picked in Team Settings. NULL means not linked - the public site then uses football_team_name / football_team_logo_url.';
comment on column public.site_settings.cricket_team_id is
  'The registered team (public.teams) that is the organization''s own CRICKET team, picked in Team Settings. NULL means not linked - the public site then uses cricket_team_name / cricket_team_logo_url.';
