-- =====================================================================
-- Migration 0024 — service_role grants for the email Edge Functions.
-- STATUS: APPLIED LIVE on 2026-10-25 (Email Activation), at the
-- owner's explicit approval, via the Supabase Dashboard SQL
-- Editor; post-apply probes passed (grant grid exact; SET ROLE
-- service_role reads all four tables) and the full
-- subscribe -> verify -> welcome -> unsubscribe chain then
-- passed live — see docs/EMAIL_ACTIVATION_REPORT_2026-10-25.md.
-- The SQL below is byte-identical to the applied version (file
-- SHA-256 70820d687254b4582aab85aa355f717134b67818288bb4ee7cf20097f27a69b9);
-- only this status comment was updated afterwards.
-- Prepared 2026-10-25 during the Email Activation,
-- after the live root-cause diagnosis below. Applying this file
-- to the live database needs the owner's separate approval.
--
-- WHY THIS EXISTS (live-proven 2026-10-25):
--   All seven email Edge Functions deployed successfully, and
--   send-email (no database access) works end-to-end. But every
--   function that reads/writes tables through the service-role
--   client (subscribe, resend-verification, verify-subscription,
--   unsubscribe, admin-subscribers, send-announcement) failed
--   with HTTP 500. Diagnosis in the live database showed:
--     * information_schema.role_table_grants: on
--       email_subscribers, notice_deliveries and profiles,
--       service_role holds ONLY references, trigger, truncate —
--       no select / insert / update at all.
--     * SET ROLE service_role; SELECT on email_subscribers ->
--       ERROR 42501 permission denied (the database's own hint
--       names the missing GRANT).
--     * service_role DOES have rolbypassrls = true, so RLS is
--       not the blocker — the table-level GRANTs are missing.
--   Root cause: migration 0010's privilege sweep treated
--   service_role as "platform-managed" and migrations 0014/0015
--   granted only anon/authenticated, so on THIS project no DML
--   privilege for service_role was ever (re-)granted. (The
--   functions' key and code were verified working — Auth checks
--   and the HMAC paths respond correctly.)
--
-- What it does (and nothing else) — grants to service_role ONLY:
--   * email_subscribers: select, insert, update
--       (subscriber store: find/insert/update; never deletes —
--       subscribers leave by status, keeping consent history)
--   * notice_deliveries: select, insert, update
--       (announcement store: seed via upsert, claim, record)
--   * profiles: select
--       (admin checker reads role + is_active for authorizeAdmin)
--   * news_posts: select
--       (announcement store reads the notice being sent)
--
-- What it does NOT do:
--   - No change for anon or authenticated: their grants and all
--     RLS policies stay exactly as they are; the public API
--     surface does not widen by one row.
--   - No DELETE grant anywhere: no function deletes from these
--     tables, so none is given.
--   - No table, column, policy, or data change of any kind.
--   service_role is a server-only role: its key exists only in
--   the Edge Functions' environment and the owner's Dashboard —
--   never in the frontend, the repo, or any browser.
--
-- Rollback (if ever needed):
--   revoke select, insert, update on public.email_subscribers from service_role;
--   revoke select, insert, update on public.notice_deliveries from service_role;
--   revoke select on public.profiles from service_role;
--   revoke select on public.news_posts from service_role;
-- =====================================================================

begin;

grant select, insert, update on public.email_subscribers to service_role;
grant select, insert, update on public.notice_deliveries to service_role;
grant select on public.profiles to service_role;
grant select on public.news_posts to service_role;

commit;
