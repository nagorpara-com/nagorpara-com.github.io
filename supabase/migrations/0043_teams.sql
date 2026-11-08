-- =====================================================================
-- Migration 0043 — teams (টিমসমূহ): a real teams table for football
-- and cricket, managed from Admin ক্রীড়া প্রতিযোগিতা টিমসমূহ.
-- STATUS: APPLIED LIVE 2026-11-02 at the owner's tap
-- ("হ্যাঁ, 0042 + 0043 এখন লাইভ করে দাও"); Dashboard result
-- "Success. No rows returned" (a first attempt failed on an
-- editor artefact — a stray ")" the editor appended — created
-- nothing, verified by re-check; the identical text was re-run
-- cleanly); post-checks verified the table exists and exactly
-- the 2 policies are present.
--
-- WHY: until now the system had NO teams entity at all — each
-- sport had only the organization's own team name in
-- site_settings, and a match's opponent was free text with no
-- list behind it. The owner asked for a teams system: add a team
-- (name + logo), edit it, delete it, publish/unpublish it, and
-- pick the opponent from the list when creating a match.
--
-- DESIGN NOTES
--   * matches.opponent stays TEXT and the match form stores the
--     picked team's NAME there — no foreign key — so deleting a
--     team can never break or rewrite match history (the
--     owner's history-preservation stance). The public site
--     shows a team's logo next to the opponent name when a
--     PUBLISHED team of that sport has exactly that name.
--   * The organization's OWN teams keep living in site_settings
--     (name/season/logo) exactly as before — this table is for
--     the teams they play against (and any other team worth
--     listing); nothing existing moves.
--   * RLS mirrors matches (0001): the public reads PUBLISHED
--     rows only; content editors (can_edit_content()) write.
--
-- What it does (and nothing else):
--   * create table public.teams + index
--   * enable RLS + 2 policies (public reads published /
--     editors write)
--   * explicit grants (project rule)
-- =====================================================================

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  sport public.sport_type not null,
  name text not null
    check (char_length(btrim(name)) between 1 and 120),
  logo_url text,
  is_published boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index teams_sport_order_idx
  on public.teams (sport, display_order, created_at);

alter table public.teams enable row level security;

-- The public site reads published teams only (opponent logos on
-- match cards; nothing else public consumes this table).
create policy "teams: public reads published"
  on public.teams for select
  using (is_published);

-- Content editors manage teams from the Admin Panel — same
-- helper and shape as the matches policies.
create policy "teams: editors write"
  on public.teams for all
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- GRANTs (project rule: every migration that creates a table
-- ends with its own explicit grant section).
revoke all on table public.teams from anon;
revoke all on table public.teams from authenticated;
grant select on table public.teams to anon;
grant select, insert, update, delete on table public.teams to authenticated;
grant select, insert, update, delete on table public.teams to service_role;
