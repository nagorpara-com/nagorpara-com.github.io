-- 0046_player_team.sql
-- Link a player to one of the registered teams (owner's order,
-- 2026-11-02: the Add Player form must offer a টিম dropdown of
-- every team created in the Teams list, however many there are,
-- and the chosen team is saved with the player).
--
-- DRAFT — not applied live. Applying needs the owner's separate
-- approval, like every live migration. (Number 0045 stays
-- reserved for the postponed group-stage Phase B.)
--
-- Shape: one nullable column, nothing else. players.team_id
-- references teams(id) ON DELETE SET NULL — deleting a team
-- never deletes or rewrites a player; the player simply becomes
-- team-less. No RLS or grant change: the column rides on the
-- existing players table, whose table-level grants and policies
-- already cover it. The admin form probes for this column (the
-- same pattern as club / migration 0025): until this migration
-- is live, the টিম field shows an honest note and saves omit it.

alter table public.players
  add column if not exists team_id uuid
  references public.teams(id) on delete set null;

create index if not exists players_team_id_idx
  on public.players (team_id);

comment on column public.players.team_id is
  'The registered team (public.teams) this player belongs to; chosen from the Add Player form dropdown. NULL means no team assigned yet.';
