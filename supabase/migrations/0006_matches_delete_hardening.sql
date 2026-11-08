-- =====================================================================
-- Nagar Para Agragami Youth Sangha — §6 Security Fix (owner-approved)
-- Migration 0006: matches / tournaments / match_performances —
-- DELETE becomes admin-only.
--
-- Why: migrations 0001 defined the write policies for these three
-- tables as FOR ALL with can_edit_content(), which silently includes
-- DELETE for editors. The owner's Final Security Review of §6
-- requires Performance Delete (and, by the same reasoning, Match and
-- Tournament Delete) to belong to super_admin / admin ONLY — in the
-- UI and in the database alike. This mirrors the players fix in
-- migration 0004 ("players: admins delete").
--
-- What changes:
--   * matches:         "editors write" (FOR ALL) -> editors read all
--                      + editors insert + editors update
--                      + "matches: admins delete" (is_admin).
--   * tournaments:     same split.
--   * match_performances: "editors write" (FOR ALL) -> editors insert
--                      + editors update + "performances: admins
--                      delete" (is_admin). No separate read policy is
--                      needed: the public-read policy (replaced in
--                      0004) already lets content roles read all rows.
-- Create / update / publish / unpublish rights for content roles are
-- UNCHANGED. Public read policies are UNCHANGED.
--
-- Apply AFTER 0001–0005, in order, exactly once (run-once draft,
-- like the others). NOT applied anywhere yet — no Supabase project
-- exists as of 2026-10-23.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------
drop policy "matches: editors write" on public.matches;
create policy "matches: editors read all"
  on public.matches for select
  using (public.can_edit_content());
create policy "matches: editors insert"
  on public.matches for insert
  with check (public.can_edit_content());
create policy "matches: editors update"
  on public.matches for update
  using (public.can_edit_content()) with check (public.can_edit_content());
create policy "matches: admins delete"
  on public.matches for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------
drop policy "tournaments: editors write" on public.tournaments;
create policy "tournaments: editors read all"
  on public.tournaments for select
  using (public.can_edit_content());
create policy "tournaments: editors insert"
  on public.tournaments for insert
  with check (public.can_edit_content());
create policy "tournaments: editors update"
  on public.tournaments for update
  using (public.can_edit_content()) with check (public.can_edit_content());
create policy "tournaments: admins delete"
  on public.tournaments for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Match performances
-- ---------------------------------------------------------------------
drop policy "performances: editors write" on public.match_performances;
create policy "performances: editors insert"
  on public.match_performances for insert
  with check (public.can_edit_content());
create policy "performances: editors update"
  on public.match_performances for update
  using (public.can_edit_content()) with check (public.can_edit_content());
create policy "performances: admins delete"
  on public.match_performances for delete
  using (public.is_admin());

-- =====================================================================
-- VERIFY AFTER RUNNING (Supabase SQL Editor / API, per role):
--  1. As an EDITOR: insert + update a match, a tournament and a
--     performance — all MUST succeed.
--  2. As an EDITOR: delete a match, a tournament and a performance —
--     all MUST fail / affect 0 rows.
--  3. As an ADMIN: delete a performance — MUST succeed, and the
--     player's season statistics (football_season_stats /
--     cricket_season_stats) MUST drop accordingly.
--  4. As ANON: select matches / tournaments — only published rows;
--     select match_performances — only rows of published players in
--     published matches (unchanged from 0004).
--  5. As FINANCE_MANAGER or VIEWER: writes to all three tables MUST
--     fail; reads behave like the public (unchanged).
-- =====================================================================
