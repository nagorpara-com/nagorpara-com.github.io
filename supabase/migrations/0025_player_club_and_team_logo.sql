-- =====================================================================
-- Migration 0025 — Football Team View: player club + team logo.
-- STATUS: APPLIED LIVE on 2026-10-26, at the owner's explicit
-- approval, via the Supabase Dashboard SQL Editor ("Success.
-- No rows returned", run once); post-apply probes passed —
-- both columns live (HTTP 200), all existing rows intact with
-- NULL values, anonymous writes still denied — see
-- docs/FOOTBALL_0025_LIVE_APPLY_REPORT_2026-10-26.md.
-- The SQL below is byte-identical to the applied version
-- (applied-version file SHA-256
-- 4931262ed4e91caa4ee8872736dcaa4d186e27323a3efc4052372c6dc36b0c1d);
-- only this status comment was updated afterwards.
-- Prepared 2026-10-26 at the owner's instruction
-- (Football: team-first public view, player biodata incl. club,
-- international-standard card/logo sizes). NOT applied live.
-- Applying this file to the live database needs the owner's
-- separate approval (the same draft -> scratch -> review ->
-- approve -> apply sequence as migrations 0022/0023/0024).
--
-- What it does (and nothing else):
--   1. players.club (text, nullable): the club a player plays
--      for, shown in his biodata on the player card and profile
--      page. NULL = not recorded; the site shows nothing for it
--      (never an invented club). Applies to both sports (the
--      players table is shared); the Football work uses it first.
--   2. site_settings.football_team_logo_url (text, nullable):
--      the football team's own logo image, managed from the
--      Admin Panel (upload or Website Gallery — no URL typing,
--      per the owner's No-URL Admin rule). NULL (the default,
--      and the state of the existing row) keeps today's
--      behaviour — the team view falls back to the organization
--      logo.
--
-- What it does NOT do:
--   * No new table, no new policy, no GRANT change: both are
--     plain columns on existing tables, so the existing RLS
--     policies and the migration-0010 grant matrix already
--     cover them (anon/authenticated read access to players and
--     site_settings is unchanged; writes stay role-gated).
--   * No data is written or altered: existing rows keep NULL
--     until the owner adds real values from the Admin Panel.
--   * No default/fake club or logo is seeded.
-- =====================================================================

alter table public.players
  add column club text;

comment on column public.players.club is
  'The club this player plays for (biodata). NULL = not recorded. Added by migration 0025.';

alter table public.site_settings
  add column football_team_logo_url text;

comment on column public.site_settings.football_team_logo_url is
  'Football team logo image URL (Admin upload/gallery only). NULL = fall back to the organization logo. Added by migration 0025.';
