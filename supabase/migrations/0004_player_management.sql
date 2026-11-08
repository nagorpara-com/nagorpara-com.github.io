-- =====================================================================
-- Nagar Para Agragami Youth Sangha — 0004: Player management rules
-- (Phase 6 management rules, set by the project owner)
--
-- WHAT THIS ADDS (existing tables are reused — no new content tables):
--  1. Publishing workflow on `players`: status draft/pending/published
--     + `archived_at` soft-archive. Public may see a player ONLY when
--     status = 'published' AND is_active AND not archived.
--  2. Approval enforcement IN THE DATABASE: a trigger stops anyone who
--     is not an admin/super_admin from setting status = 'published'.
--     Hiding a button in the frontend is NOT the security boundary.
--  3. Season-wise football statistics: `football_player_stats` primary
--     key becomes (player_id, season) so seasons never mix.
--  4. Match performances gain yellow/red cards, and the view
--     `football_season_stats` COMPUTES season stats from performance
--     records (season = tournament season, else the match year).
--     Display rule (no double counting): for a season that exists in
--     the view, the computed numbers are final; stored rows are used
--     only for seasons with no performance records (older history).
--  5. Football team settings stored in the existing `site_settings`
--     row (team name, current season, layout, sorting, card stats) so
--     they survive refresh and are editable from the Admin Panel.
--  6. Security fixes from the Phase 6 final audit:
--     a. The stats view is created WITH (security_invoker = true) so
--        the underlying tables' RLS applies to whoever queries it —
--        a plain view would bypass RLS and expose unpublished
--        players' aggregates through direct API calls.
--     b. The players write policy is split per operation: editors
--        keep read-all/insert/update, but DELETE is admin-only —
--        deleting a player cascades to stats and match performances,
--        so it must never be an editor-level operation.
--
-- Like 0001–0003 this is a reviewed draft: run it in the Supabase SQL
-- Editor AFTER 0001–0003, then verify the checks at the bottom.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Publishing workflow + archive on players
-- ---------------------------------------------------------------------
create type public.player_status as enum ('draft', 'pending', 'published');

alter table public.players
  add column status public.player_status not null default 'draft',
  add column archived_at timestamptz;

comment on column public.players.status is
  'draft = incomplete, admin only; pending = awaiting approval; published = approved for public site';
comment on column public.players.archived_at is
  'Soft archive: set instead of deleting a player who has linked match/stat records. Archived players keep all history.';

-- ---------------------------------------------------------------------
-- 2. Approval enforcement (database level)
-- Only profiles with role admin/super_admin (public.is_admin()) may
-- publish. Direct database access (SQL editor / service role, where
-- auth.uid() is null) is the owner's own access and is not blocked.
-- ---------------------------------------------------------------------
create or replace function public.enforce_player_publish_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin can publish a player (approval required).';
  end if;
  return new;
end;
$$;

create trigger players_publish_approval
  before insert or update on public.players
  for each row execute function public.enforce_player_publish_permission();

-- Public visibility rule tightened: published + active + not archived.
drop policy "players: public reads active" on public.players;
create policy "players: public reads published"
  on public.players for select
  using (status = 'published' and is_active and archived_at is null);

-- Write access split per operation (audit fix 6b). The 0001 policy
-- "players: editors write" was FOR ALL, which silently included
-- DELETE for editors. Deleting a player cascades (ON DELETE CASCADE)
-- into football/cricket stats and match_performances, destroying
-- history — so DELETE is restricted to admins here at the database
-- level, not only in the UI. The Admin UI additionally refuses to
-- delete a player who still has performance records and offers
-- Archive instead; this policy is the hard boundary behind it.
drop policy "players: editors write" on public.players;
create policy "players: editors read all"
  on public.players for select
  using (public.can_edit_content());
create policy "players: editors insert"
  on public.players for insert
  with check (public.can_edit_content());
create policy "players: editors update"
  on public.players for update
  using (public.can_edit_content()) with check (public.can_edit_content());
create policy "players: admins delete"
  on public.players for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Season-wise football stats (seasons never mix)
-- ---------------------------------------------------------------------
alter table public.football_player_stats
  drop constraint football_player_stats_pkey,
  add primary key (player_id, season);

-- Stats of a non-public player must not leak: restrict public reads to
-- players that pass the same visibility rule.
drop policy "football stats: public read" on public.football_player_stats;
create policy "football stats: public read"
  on public.football_player_stats for select
  using (
    public.can_edit_content()
    or exists (
      select 1 from public.players p
      where p.id = player_id
        and p.status = 'published'
        and p.is_active
        and p.archived_at is null
    )
  );

-- ---------------------------------------------------------------------
-- 4. Cards in match performances + computed season stats view
-- ---------------------------------------------------------------------
alter table public.match_performances
  add column yellow_cards int not null default 0,
  add column red_cards int not null default 0;

-- security_invoker = true (audit fix 6a, PostgreSQL 15+ / Supabase):
-- the view evaluates the underlying tables' RLS as the CALLER, so an
-- anonymous caller only ever aggregates performances of publicly
-- visible players in published matches. Query, logic and output
-- columns are unchanged.
create or replace view public.football_season_stats
  with (security_invoker = true) as
select
  mp.player_id,
  coalesce(t.season, extract(year from m.match_date)::text, 'undated') as season,
  count(*)::int as matches,
  coalesce(sum(mp.goals), 0)::int as goals,
  coalesce(sum(mp.assists), 0)::int as assists,
  coalesce(sum(mp.yellow_cards), 0)::int as yellow_cards,
  coalesce(sum(mp.red_cards), 0)::int as red_cards
from public.match_performances mp
join public.matches m on m.id = mp.match_id
left join public.tournaments t on t.id = m.tournament_id
where m.sport = 'football' and m.is_published
-- GROUP BY the full expression, not the alias "season": tournaments
-- also has a real `season` column, so the bare alias resolves to that
-- input column and leaves m.match_date ungrouped (error 42803 — found
-- on the first live run, 2026-10-23; owner-approved fix).
group by mp.player_id,
  coalesce(t.season, extract(year from m.match_date)::text, 'undated');

comment on view public.football_season_stats is
  'Season stats computed from published match performances. For a season present here, these numbers are final — do not also store the same season in football_player_stats (no double counting).';

-- Performance rows of non-public players / unpublished matches stay private.
drop policy "performances: public read" on public.match_performances;
create policy "performances: public read"
  on public.match_performances for select
  using (
    public.can_edit_content()
    or exists (
      select 1
      from public.players p
      join public.matches m on m.id = match_id
      where p.id = player_id
        and p.status = 'published'
        and p.is_active
        and p.archived_at is null
        and m.is_published
    )
  );

-- ---------------------------------------------------------------------
-- 5. Football team settings in the existing site_settings row
-- ---------------------------------------------------------------------
alter table public.site_settings
  add column football_team_name text not null default 'নগর পাড়া ফুটবল দল',
  add column football_current_season text not null default '2026',
  add column football_layout text not null default 'grid',
  add column football_sorting text not null default 'custom',
  add column football_card_stats jsonb not null
    default '["matches","goals","assists","yellow_cards","red_cards"]'::jsonb;

-- =====================================================================
-- VERIFY AFTER RUNNING (Supabase SQL Editor):
--  1. As an editor (not admin), try: update players set status =
--     'published' — it MUST fail with the approval exception.
--  2. As anon, select from players — only published + active +
--     unarchived rows may appear; draft/pending rows must be absent.
--  3. select * from football_season_stats — one row per player/season,
--     computed only from published matches. As ANON, the view must
--     return rows ONLY for published + active + unarchived players
--     (security_invoker makes the base-table RLS apply).
--  4. Two seasons of stored stats for one player must coexist
--     (primary key player_id + season).
--  5. As an editor, try: delete from players — it MUST affect 0 rows
--     or fail (delete is admin-only). As an admin it must succeed.
--     Editors must still be able to insert/update/select all players.
-- =====================================================================
