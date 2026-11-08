-- =====================================================================
-- Nagar Para Agragami Youth Sangha — 0044: Tournament management
-- (owner's Additional Rules for Tournament, Team, Match and Result
-- Management, 2026-11-02)
--
-- WHAT THIS ADDS (existing tables are extended — no content table is
-- replaced, no existing column or row is touched):
--  1. `tournaments` gains the creation fields the owner specified:
--     banner, organizer, director, venue, description, format
--     ('league' or 'knockout'), planned team count, the league
--     points the Admin sets (win / draw / loss) and the champion
--     team link (set from the final result).
--  2. NEW `tournament_teams`: which teams are registered in which
--     tournament, with a seed (entry order). One row per team per
--     tournament. Deleting a tournament or a team removes its
--     entries (cascade) — the other side is never harmed.
--  3. `matches` gains the two participating teams as real links
--     (team_a_id / team_b_id), the match number, the round/stage,
--     the structured winner (winner_team_id) and draw flag
--     (is_draw), plus a tiebreaker note for knockout draws.
--     Score semantics when both teams are linked: `our_score`
--     holds team A's score and `opponent_score` holds team B's
--     score (the columns stay free text — cricket scores such as
--     "245/8 (50 ov)" are not numbers). Legacy matches without
--     team links keep working exactly as before.
--  4. Audit history for results: the generic audit trigger from
--     migration 0020 is attached to `matches` and `tournaments`,
--     so every create / edit / delete of a match or tournament —
--     including a published result correction — is recorded in
--     audit_logs with before/after values and can never be edited
--     from the panel.
--  5. Phase A additions (owner approval, 2026-11-02 — Match Number
--     and Tournament Round Management): a per-tournament match
--     number must be unique, and a match may carry an optional
--     banner image. The uniqueness rule is a PARTIAL unique index
--     covering only rows that have BOTH a tournament and a number:
--     `match_no` is a brand-new column, so every existing row is
--     NULL and is skipped by the index — it cannot conflict with
--     any existing data, and matches outside a tournament stay
--     unrestricted, exactly as the owner specified.
--  6. Step C revision (owner's sports correction plan, 2026-11-03):
--     tournaments gain start/end dates, the director's phone, the
--     'group_knockout' format, playing-condition rules (squad
--     size, football match minutes, cricket overs, ball type) and
--     the runner-up team link. Matches gain the referee/umpire
--     name, the cricket toss (winner team + decision), per-side
--     balls and wickets (the inputs Net Run Rate is computed
--     from), penalty-shootout scores and the player of the match.
--     match_performances gains the football appearance / own
--     goals / penalty / goalkeeper-save fields and the cricket
--     dismissal / batting-order / extras fields. The tournament
--     "total matches" figure is NOT a column — the app counts
--     the tournament's matches (owner's decision, 2026-11-03).
--  7. 0053 coexistence note (2026-11-03): migration 0053 adds
--     `tournaments.banner_url` on its own, ahead of this parked
--     file, with the owner's approval. The banner add in section
--     1 below therefore uses IF NOT EXISTS, so this file still
--     applies cleanly after 0053 and adds everything else as
--     written. (`matches.banner_url` in section 3 has no such
--     predecessor — no other migration adds it — so it keeps the
--     plain form.)
--
-- RLS: new columns inherit the tables' existing policies.
-- tournament_teams: the public may read entries only of PUBLISHED
-- tournaments; editors (can_edit_content()) manage entries.
-- STATUS: APPLIED LIVE 2026-11-04 on the owner's order (the
-- backup-first gate was waived by the owner; applied once inside
-- a transaction with before/after verification).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tournament creation fields + format + points + champion
-- ---------------------------------------------------------------------
alter table public.tournaments
  add column if not exists banner_url text,
  add column organizer text,
  add column director text,
  add column venue text,
  add column description text,
  add column format text,
  add column team_count int,
  add column points_win int not null default 3,
  add column points_draw int not null default 1,
  add column points_loss int not null default 0,
  add column champion_team_id uuid references public.teams (id) on delete set null;

alter table public.tournaments
  add constraint tournaments_format_check
    check (format is null or format in ('league', 'knockout', 'group_knockout')),
  add constraint tournaments_team_count_check
    check (team_count is null or (team_count >= 2 and team_count <= 64)),
  add constraint tournaments_points_check
    check (points_win >= 0 and points_draw >= 0 and points_loss >= 0);

comment on column public.tournaments.format is
  'league = points table from results; knockout = winners advance by rounds; group_knockout = group points table first, then knockout rounds; null = format not chosen yet';
comment on column public.tournaments.champion_team_id is
  'The winning team, set from the final match result; null until a champion is decided';

-- ---------------------------------------------------------------------
-- 2. Registered teams per tournament
-- ---------------------------------------------------------------------
create table public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  seed int not null default 0,
  created_at timestamptz not null default now(),
  unique (tournament_id, team_id)
);

create index tournament_teams_tournament_idx
  on public.tournament_teams (tournament_id);

alter table public.tournament_teams enable row level security;

create policy "tournament teams: public reads published tournaments"
  on public.tournament_teams for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.is_published
    )
  );

create policy "tournament teams: editors write"
  on public.tournament_teams for all
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- ---------------------------------------------------------------------
-- 3. Match: two linked teams, number, round, structured result
-- ---------------------------------------------------------------------
alter table public.matches
  add column team_a_id uuid references public.teams (id) on delete set null,
  add column team_b_id uuid references public.teams (id) on delete set null,
  add column match_no int,
  add column round text,
  add column winner_team_id uuid references public.teams (id) on delete set null,
  add column is_draw boolean not null default false,
  add column tiebreaker_note text,
  add column banner_url text;

comment on column public.matches.team_a_id is
  'First team of the fixture; when set, our_score is this team''s score';
comment on column public.matches.team_b_id is
  'Second team of the fixture; when set, opponent_score is this team''s score and opponent holds this team''s name for legacy displays';
comment on column public.matches.winner_team_id is
  'Structured winner (one of the two teams); null while undecided or when is_draw is true without a tiebreaker winner';
comment on column public.matches.is_draw is
  'True when the recorded result is a draw; league points and knockout handling read this flag, not the free-text result';
comment on column public.matches.match_no is
  'Match number inside its tournament; unique per tournament when both tournament and number are set (partial unique index below)';
comment on column public.matches.banner_url is
  'Optional match banner image (Storage path or URL); null shows no banner';

-- ---------------------------------------------------------------------
-- 4. One match number per tournament (Phase A addition)
-- ---------------------------------------------------------------------
create unique index matches_tournament_match_no_unique
  on public.matches (tournament_id, match_no)
  where tournament_id is not null and match_no is not null;

-- ---------------------------------------------------------------------
-- 5. Audit history for matches and tournaments (function from 0020)
-- ---------------------------------------------------------------------
create trigger trg_audit_matches
  after insert or update or delete on public.matches
  for each row execute function public.log_audit_change(
    'matches',
    'sport,tournament_id,opponent,match_date,venue,our_score,opponent_score,result,status,is_published,team_a_id,team_b_id,match_no,round,winner_team_id,is_draw,tiebreaker_note,banner_url',
    '',
    'opponent'
  );

create trigger trg_audit_tournaments
  after insert or update or delete on public.tournaments
  for each row execute function public.log_audit_change(
    'tournaments',
    'name,sport,season,status,is_published,banner_url,organizer,director,venue,description,format,team_count,points_win,points_draw,points_loss,champion_team_id',
    '',
    'name'
  );

-- ---------------------------------------------------------------------
-- 6. Step C additions (owner's sports correction plan, 2026-11-03)
-- ---------------------------------------------------------------------
alter table public.tournaments
  add column start_date date,
  add column end_date date,
  add column director_phone text,
  add column squad_size int,
  add column match_minutes int,
  add column cricket_overs int,
  add column ball_type text,
  add column runner_up_team_id uuid references public.teams (id) on delete set null;

alter table public.tournaments
  add constraint tournaments_director_phone_check
    check (director_phone is null or char_length(director_phone) <= 20),
  add constraint tournaments_squad_size_check
    check (squad_size is null or (squad_size >= 1 and squad_size <= 30)),
  add constraint tournaments_match_minutes_check
    check (match_minutes is null or (match_minutes >= 1 and match_minutes <= 300)),
  add constraint tournaments_cricket_overs_check
    check (cricket_overs is null or (cricket_overs >= 1 and cricket_overs <= 100)),
  add constraint tournaments_ball_type_check
    check (ball_type is null or char_length(ball_type) <= 60);

comment on column public.tournaments.runner_up_team_id is
  'The runner-up team of the tournament; null until decided';
comment on column public.tournaments.cricket_overs is
  'Overs per innings for cricket tournaments; Net Run Rate treats an all-out innings as this full allocation';

alter table public.matches
  add column referee_name text,
  add column toss_winner_team_id uuid references public.teams (id) on delete set null,
  add column toss_decision text,
  add column team_a_balls int,
  add column team_b_balls int,
  add column team_a_wickets int,
  add column team_b_wickets int,
  add column shootout_a int,
  add column shootout_b int,
  add column player_of_match_id uuid references public.players (id) on delete set null;

alter table public.matches
  add constraint matches_referee_name_check
    check (referee_name is null or char_length(referee_name) <= 120),
  add constraint matches_toss_decision_check
    check (toss_decision is null or toss_decision in ('bat', 'field')),
  add constraint matches_team_balls_check
    check ((team_a_balls is null or team_a_balls >= 0)
       and (team_b_balls is null or team_b_balls >= 0)),
  add constraint matches_team_wickets_check
    check ((team_a_wickets is null or (team_a_wickets >= 0 and team_a_wickets <= 10))
       and (team_b_wickets is null or (team_b_wickets >= 0 and team_b_wickets <= 10))),
  add constraint matches_shootout_check
    check ((shootout_a is null or shootout_a >= 0)
       and (shootout_b is null or shootout_b >= 0));

comment on column public.matches.team_a_balls is
  'Balls faced by team A in a cricket match (the Admin enters overs such as 19.4; stored as balls). Used for Net Run Rate';
comment on column public.matches.team_b_balls is
  'Balls faced by team B in a cricket match. Used for Net Run Rate';
comment on column public.matches.player_of_match_id is
  'The player of the match, chosen on the declaration page; null when not chosen';

alter table public.match_performances
  add column appearance text,
  add column own_goals int not null default 0,
  add column penalty_goals int not null default 0,
  add column penalty_missed int not null default 0,
  add column saves int not null default 0,
  add column dismissal_type text,
  add column dismissed_by_id uuid references public.players (id) on delete set null,
  add column batting_order int,
  add column wides int not null default 0,
  add column no_balls int not null default 0;

alter table public.match_performances
  add constraint match_performances_appearance_check
    check (appearance is null or appearance in ('starter', 'substitute', 'unused')),
  add constraint match_performances_dismissal_check
    check (dismissal_type is null or dismissal_type in
      ('bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired', 'not_out')),
  add constraint match_performances_batting_order_check
    check (batting_order is null or (batting_order >= 1 and batting_order <= 11));

comment on column public.match_performances.appearance is
  'Football appearance: starter (starting eleven), substitute (came on), unused (did not play); null when not recorded';
comment on column public.match_performances.dismissal_type is
  'How a cricketer was dismissed; not_out covers an unbeaten innings alongside the not_out flag';

-- ---------------------------------------------------------------------
-- Grants (project rule: explicit grants on every table)
-- ---------------------------------------------------------------------
grant select on table public.tournament_teams to anon;
grant select, insert, update, delete on table public.tournament_teams to authenticated;
grant select, insert, update, delete on table public.tournament_teams to service_role;
