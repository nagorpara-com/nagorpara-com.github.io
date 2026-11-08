-- =====================================================================
-- Nagar Para Agragami Youth Sangha — 0005: Cricket module (Phase 7)
--
-- Built under the permanent Admin-First rule: every public cricket
-- display has its Admin management, database storage, validation and
-- RLS in this same phase. Existing tables are extended — no duplicate
-- content tables are created. Migrations 0001–0004 are NOT edited.
--
-- WHAT THIS ADDS:
--  1. `players.batting_style` / `players.bowling_style` (free text set
--     from the Admin Panel, e.g. "Right-hand bat", "Right-arm medium").
--  2. Season-wise cricket statistics: `cricket_player_stats` primary
--     key becomes (player_id, season) and gains the full supported
--     field set — batting (innings, balls_faced, highest_score,
--     not_outs, fours, sixes), bowling (balls_bowled, runs_conceded,
--     maidens, best_bowling) and fielding (stumpings, run_outs).
--     Derived figures (average, strike rate, economy, bowling
--     average/strike rate) are CALCULATED from these raw numbers by
--     the application — never stored, never invented; division by
--     zero yields "no value", not a fake number.
--  3. `match_performances` gains the per-match cricket fields needed
--     to compute season stats (balls_faced, fours, sixes, not_out,
--     balls_bowled, runs_conceded, maidens, stumpings, run_outs).
--  4. View `cricket_season_stats` (security_invoker = true, same
--     protection as the football view) computes per player+season:
--     matches, innings, runs, highest score, not-outs, balls faced,
--     fours, sixes, fifties, hundreds, wickets, balls bowled, runs
--     conceded, maidens, catches, stumpings, run-outs. Same
--     no-double-counting rule as football: a computed season is
--     final; stored rows cover only seasons without performances.
--     Best bowling FIGURES (e.g. 4/23) are per-match values, so they
--     are derived by the application from match history, and stored
--     manually for historical seasons (best_bowling text).
--  5. Cricket RLS tightened exactly like football: the 0001 policy
--     "cricket stats: public read" was `using (true)` — replaced so
--     only publicly visible players' stats can be read by the public.
--  6. Cricket team settings in the existing `site_settings` row
--     (cricket_* columns). No owner-provided cricket team name or
--     season exists yet, so both start NULL: the site shows a
--     generic label until an Admin sets the real values — nothing is
--     invented.
--
-- Publishing workflow, approval trigger and the players policy split
-- from 0004 already cover cricket players (they are sport-agnostic).
-- Like 0001–0004 this is a reviewed draft — run it AFTER 0001–0004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Playing styles on players
-- ---------------------------------------------------------------------
alter table public.players
  add column batting_style text,
  add column bowling_style text;

-- ---------------------------------------------------------------------
-- 2. Season-wise cricket stats with the full supported field set
-- ---------------------------------------------------------------------
alter table public.cricket_player_stats
  drop constraint cricket_player_stats_pkey,
  add primary key (player_id, season),
  add column innings int not null default 0,
  add column balls_faced int not null default 0,
  add column highest_score int not null default 0,
  add column not_outs int not null default 0,
  add column fours int not null default 0,
  add column sixes int not null default 0,
  add column balls_bowled int not null default 0,
  add column runs_conceded int not null default 0,
  add column maidens int not null default 0,
  add column best_bowling text,
  add column stumpings int not null default 0,
  add column run_outs int not null default 0;

-- Public may read stats only of publicly visible players (as football).
drop policy "cricket stats: public read" on public.cricket_player_stats;
create policy "cricket stats: public read"
  on public.cricket_player_stats for select
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
-- 3. Per-match cricket performance fields
-- ---------------------------------------------------------------------
alter table public.match_performances
  add column balls_faced int not null default 0,
  add column fours int not null default 0,
  add column sixes int not null default 0,
  add column not_out boolean not null default false,
  add column balls_bowled int not null default 0,
  add column runs_conceded int not null default 0,
  add column maidens int not null default 0,
  add column stumpings int not null default 0,
  add column run_outs int not null default 0;

-- ---------------------------------------------------------------------
-- 4. Computed season stats view (RLS of the caller applies)
-- ---------------------------------------------------------------------
create or replace view public.cricket_season_stats
  with (security_invoker = true) as
select
  mp.player_id,
  coalesce(t.season, extract(year from m.match_date)::text, 'undated') as season,
  count(*)::int as matches,
  count(*)::int as innings,
  coalesce(sum(mp.runs), 0)::int as runs,
  coalesce(max(mp.runs), 0)::int as highest_score,
  count(*) filter (where mp.not_out)::int as not_outs,
  coalesce(sum(mp.balls_faced), 0)::int as balls_faced,
  coalesce(sum(mp.fours), 0)::int as fours,
  coalesce(sum(mp.sixes), 0)::int as sixes,
  count(*) filter (where mp.runs >= 50 and mp.runs < 100)::int as fifties,
  count(*) filter (where mp.runs >= 100)::int as hundreds,
  coalesce(sum(mp.wickets), 0)::int as wickets,
  coalesce(sum(mp.balls_bowled), 0)::int as balls_bowled,
  coalesce(sum(mp.runs_conceded), 0)::int as runs_conceded,
  coalesce(sum(mp.maidens), 0)::int as maidens,
  coalesce(sum(mp.catches), 0)::int as catches,
  coalesce(sum(mp.stumpings), 0)::int as stumpings,
  coalesce(sum(mp.run_outs), 0)::int as run_outs
from public.match_performances mp
join public.matches m on m.id = mp.match_id
left join public.tournaments t on t.id = m.tournament_id
where m.sport = 'cricket' and m.is_published
-- GROUP BY the full expression, not the alias "season" (same 42803 fix
-- as 0004 — the bare alias resolves to tournaments.season and leaves
-- m.match_date ungrouped; found on the first live run, 2026-10-23).
group by mp.player_id,
  coalesce(t.season, extract(year from m.match_date)::text, 'undated');

comment on view public.cricket_season_stats is
  'Cricket season stats computed from published match performances. A season present here is final — do not also store it in cricket_player_stats (no double counting). Averages/rates are derived by the application from these raw numbers.';

-- ---------------------------------------------------------------------
-- 5. Cricket team settings (existing site_settings row)
-- ---------------------------------------------------------------------
alter table public.site_settings
  add column cricket_team_name text,
  add column cricket_current_season text,
  add column cricket_layout text not null default 'grid',
  add column cricket_sorting text not null default 'custom',
  add column cricket_card_stats jsonb not null
    default '["matches","runs","wickets","catches"]'::jsonb;

-- =====================================================================
-- VERIFY AFTER RUNNING (Supabase SQL Editor):
--  1. As anon, select from cricket_player_stats and from
--     cricket_season_stats — rows may appear ONLY for published +
--     active + unarchived cricket players.
--  2. Two seasons of stored stats for one cricket player coexist
--     (primary key player_id + season).
--  3. A published cricket match with performances produces exactly
--     one computed row per player/season; an unpublished match
--     produces none.
--  4. Editor still cannot publish or delete players (0004 rules);
--     cricket players follow the same workflow.
-- =====================================================================
