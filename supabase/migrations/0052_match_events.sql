-- =====================================================================
-- Migration 0052 — Match events (the match timeline) (owner's
-- approved Step D, 2026-11-03): every notable moment of a match
-- (goal, penalty goal, own goal, penalty missed, cards,
-- substitution, wicket) as one row, so the public match page can
-- show a timeline and the Admin declaration page can compare the
-- timeline's goal count against the declared score.
--
-- STATUS: APPLIED LIVE 2026-11-04 (owner order, after 0044). This file was applied to the
-- live database needs the owner's separate approval, as with
-- every migration. In the owner's sequence this activates AFTER
-- migration 0044 (the events editor lives on the declaration
-- page that 0044's match fields feed), although the table itself
-- only depends on matches / teams / players, which already exist.
--
-- What it does (and nothing else):
--   1. NEW table `match_events`: one row per event of one match.
--      Deleting a match removes its events (cascade). Deleting a
--      team or a player never deletes an event — the link simply
--      empties (set null), exactly like the match team links in
--      migration 0044.
--      * event_type is one of: goal, penalty_goal, own_goal,
--        penalty_missed, yellow_card, red_card, substitution,
--        wicket (CHECK).
--      * minute is the football clock (0..150, stoppage time
--        included); cricket events carry over_text ("12.3")
--        instead. detail is a short free-text note.
--      * related_player_id exists for the second player of an
--        event (e.g. the player coming ON in a substitution);
--        the current form leaves it empty.
--      * display_order keeps the Admin's entered order as the
--        primary timeline order.
--   2. RLS: the public may read events only of PUBLISHED matches
--      (the same EXISTS pattern as tournament_teams in 0044);
--      editors (can_edit_content()) manage events. Explicit
--      grants for anon / authenticated and service_role, per the
--      project rule that every migration creating a table ends
--      with its own grant section.
-- =====================================================================

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  player_id uuid references public.players (id) on delete set null,
  related_player_id uuid references public.players (id) on delete set null,
  event_type text not null
    check (event_type in (
      'goal', 'penalty_goal', 'own_goal', 'penalty_missed',
      'yellow_card', 'red_card', 'substitution', 'wicket'
    )),
  minute int
    check (minute is null or (minute >= 0 and minute <= 150)),
  over_text text
    check (over_text is null or char_length(over_text) <= 10),
  detail text
    check (detail is null or char_length(detail) <= 200),
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists match_events_match_idx
  on public.match_events (match_id);

comment on table public.match_events is
  'Timeline events of a match (Step D, migration 0052): goals, cards, substitutions, wickets. Public reads only events of published matches.';
comment on column public.match_events.team_id is
  'The team the event belongs to; null means unattributed (the timeline then falls back to the player''s team).';
comment on column public.match_events.related_player_id is
  'Second player of an event (e.g. the substitute coming on); the current form leaves it null.';
comment on column public.match_events.minute is
  'Football clock minute 0..150; cricket events use over_text (e.g. "12.3") instead.';
comment on column public.match_events.display_order is
  'Admin-entered order inside the match; the timeline sorts by this first, then by minute.';

alter table public.match_events enable row level security;

-- (drop-if-exists guards keep this draft safe to re-run in the
-- Dashboard SQL editor, like the column guards above.)
drop policy if exists "match events: public reads published matches" on public.match_events;
create policy "match events: public reads published matches"
  on public.match_events for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and m.is_published
    )
  );

drop policy if exists "match events: editors write" on public.match_events;
create policy "match events: editors write"
  on public.match_events for all
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- Grants (project rule: a migration that creates a table ends
-- with its own explicit grant section).
grant select on table public.match_events to anon;
grant select, insert, update, delete on table public.match_events to authenticated;
grant select, insert, update, delete on table public.match_events to service_role;
