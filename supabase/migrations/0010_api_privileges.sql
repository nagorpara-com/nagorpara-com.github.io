-- =====================================================================
-- Nagar Para Agragami Youth Sangha — Migration 0010 (DRAFT, v2)
-- Data API privileges (GRANTs) for the anon / authenticated roles
-- + a privacy-safe public view for member phone numbers.
--
-- STATUS: DRAFT — prepared 2026-10-23 after the permission audit;
-- v2 revised the same day after the Final Security Review.
-- NOT APPLIED. Executing it needs the owner's separate permission.
-- It changes NO existing table, policy or earlier migration.
--
-- v2 CHANGES vs v1 (Final Security Review findings):
--   1. members.phone privacy: RLS is row-level and cannot express
--      "show phone only when is_phone_public". v1 granted anon a
--      table-level SELECT on members, which would expose the phone
--      column of every active member through the API regardless of
--      the flag. v2 grants anon NO direct access to the members
--      table; instead it creates ONE new view, public.members_public
--      (security_invoker), which projects safe columns only and
--      returns phone solely when is_phone_public is true.
--   2. Default privileges examined (see the note at the bottom):
--      deliberately NOT set — every future migration must carry its
--      own explicit GRANT section instead of inheriting access.
--
-- ROOT CAUSE (verified live, 2026-10-23, after 0001–0009 applied):
-- The schema itself is complete and correct — 20 tables, 3 views,
-- 61 RLS policies (56 public + 5 storage), RLS enabled everywhere,
-- all 3 views in security_invoker mode, and both API roles hold
-- USAGE on schema public. Yet every API read fails: HTTP 401 with
-- PostgreSQL code 42501 "permission denied for table ...". The
-- permission audit (information_schema.role_table_grants) shows
-- why: anon and authenticated hold only REFERENCES / TRIGGER /
-- TRUNCATE on the public relations — the working privileges SELECT,
-- INSERT, UPDATE and DELETE were never granted to either role.
-- Current Supabase projects no longer grant these automatically
-- for tables created in the SQL Editor, and migrations 0001–0009
-- contain no GRANT statements (drafted under the older default).
-- RLS policies decide WHICH ROWS a role may touch; GRANTs decide
-- WHETHER the role may use the table at all. Both layers are
-- required — this file supplies the missing layer, nothing more.
--
-- DESIGN (least privilege; RLS stays the real boundary):
--   * anon (public website visitor):
--       SELECT on the public-content tables and the views, so the
--       public site can read — RLS still limits every table to its
--       published / public rows only (finance: is_public only).
--       INSERT on contact_messages ONLY (the public contact form;
--       its RLS insert policy already exists — anon can submit but
--       can never read messages back: no SELECT is granted).
--       NO access to profiles, finance_audit_logs or the members
--       table itself (member data comes via members_public).
--   * authenticated (logged-in users):
--       SELECT on all tables and views — RLS gates the sensitive
--       ones (profiles: own row or admin; finance_audit_logs:
--       finance roles only; finance data: public rows or finance
--       roles; members: active rows, admins all rows).
--       INSERT / UPDATE / DELETE on every table EXCEPT
--       finance_audit_logs — the admin panel's writes live behind
--       RLS role policies (editor/admin/finance rules from
--       0001–0009), so a grant never widens what a role may do.
--       finance_audit_logs gets NO write grant for anyone: only
--       the audit trigger (security definer) writes there, exactly
--       as designed in 0001.
--   * Cleanup: Audit A found both API roles holding TRUNCATE,
--     REFERENCES and TRIGGER on every relation. None of these is
--     usable or needed through the Data API, and TRUNCATE would
--     bypass RLS entirely if it were ever reachable — they are
--     revoked below. (service_role is platform-managed and is NOT
--     touched by this file.)
--   * Storage is untouched: storage.objects privileges are managed
--     by Supabase and the 0002 policies already govern the buckets.
--   * No sequences exist in this schema (all keys are
--     gen_random_uuid() or set manually), so no sequence grants
--     are needed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Privacy-safe public view of members (v2).
-- security_invoker: the members table's RLS applies to the caller
-- (anon sees active members only, via the existing select policy).
-- The phone column is returned ONLY for members whose phone is
-- flagged public; the address column is never projected.
-- ---------------------------------------------------------------------
create view public.members_public
  with (security_invoker = true) as
select
  id,
  name,
  photo_url,
  case when is_phone_public then phone end as phone,
  joined_date,
  display_order
from public.members;

comment on view public.members_public is
  'Public-safe member list for the API: RLS of members applies (active only); phone appears only when is_phone_public is true; address is never exposed.';

-- ---------------------------------------------------------------------
-- anon — public reads (RLS limits rows) + contact form submission.
-- NOTE: public.members is deliberately NOT in this list (v2) —
-- member data is served through public.members_public instead.
-- ---------------------------------------------------------------------
grant select on
  public.site_settings,
  public.village_sections,
  public.home_sections,
  public.players,
  public.football_player_stats,
  public.cricket_player_stats,
  public.tournaments,
  public.matches,
  public.match_performances,
  public.news_posts,
  public.gallery_albums,
  public.gallery_items,
  public.committee_terms,
  public.committee_members,
  public.finance_transactions,
  public.player_profile_sections,
  public.finance_summary,
  public.football_season_stats,
  public.cricket_season_stats,
  public.members_public
to anon;

grant insert on public.contact_messages to anon;

-- ---------------------------------------------------------------------
-- authenticated — read all (RLS-gated); write all but the audit log
-- (ALL TABLES includes the views for SELECT; the write list below
-- names base tables explicitly and excludes finance_audit_logs).
-- ---------------------------------------------------------------------
grant select on all tables in schema public to authenticated;

grant insert, update, delete on
  public.profiles,
  public.site_settings,
  public.village_sections,
  public.home_sections,
  public.players,
  public.football_player_stats,
  public.cricket_player_stats,
  public.tournaments,
  public.matches,
  public.match_performances,
  public.news_posts,
  public.gallery_albums,
  public.gallery_items,
  public.members,
  public.committee_terms,
  public.committee_members,
  public.finance_transactions,
  public.contact_messages,
  public.player_profile_sections
to authenticated;

-- ---------------------------------------------------------------------
-- Least-privilege cleanup (see header): API roles do not need these,
-- and TRUNCATE ignores RLS. Safe to revoke: the Data API exposes
-- none of them, and neither role creates tables, keys or triggers.
-- ---------------------------------------------------------------------
revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- DEFAULT PRIVILEGES — examined, deliberately NOT set.
-- ALTER DEFAULT PRIVILEGES could auto-grant access on FUTURE tables,
-- but a blanket default (e.g. SELECT for anon on every new table)
-- would expose any future private table at the grant layer the day
-- it is created, leaving RLS as the only barrier. This project's
-- rule stays: every future migration that creates a table MUST end
-- with its own explicit GRANT statements for anon / authenticated,
-- reviewed like this file. (If the owner ever prefers defaults,
-- grant them to `authenticated` only, never to `anon`.)
-- ---------------------------------------------------------------------

-- =====================================================================
-- VERIFY AFTER RUNNING (REST API / app, per role):
--  1. ANON reads: GET /rest/v1/home_sections, /players, /matches,
--     /site_settings, /player_profile_sections -> 200 (no more
--     42501); rows limited by RLS (published/public only).
--     home_sections returns its 11 seeded rows.
--  2. MEMBER PHONE PRIVACY: with one active member whose
--     is_phone_public = false and one with true:
--     GET /rest/v1/members as anon -> still denied (no grant);
--     GET /rest/v1/members_public -> both members listed, phone
--     NULL for the unflagged member, visible for the flagged one;
--     the address never appears in any response.
--  3. ANON contact submission: POST /rest/v1/contact_messages with
--     {name, message} -> 201; GET /rest/v1/contact_messages as
--     anon -> still denied (no SELECT grant, admin-only policy).
--  4. ANON finance: GET /rest/v1/finance_transactions -> only
--     is_public rows; GET /rest/v1/finance_summary -> totals over
--     is_public rows ONLY (security_invoker, migration 0008);
--     GET /rest/v1/finance_audit_logs and /profiles -> denied.
--  5. AUTHENTICATED (after Super Admin bootstrap): admin login
--     works; profile row readable; content writes succeed exactly
--     as the RLS role policies allow (editor cannot delete
--     players/matches — 0004/0006; viewer/finance_manager content
--     writes fail); finance writes limited to finance roles;
--     finance_audit_logs writable by NOBODY through the API.
--  6. Player data: as anon, players / player_profile_sections /
--     season-stats views return ONLY published + active +
--     unarchived players and their visible sections.
-- =====================================================================
