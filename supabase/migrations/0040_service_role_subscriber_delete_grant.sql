-- =====================================================================
-- Migration 0040 — service_role DELETE grant on email_subscribers.
-- STATUS: APPLIED LIVE on 2026-11-01 (~22:12 +06), at the owner's
-- explicit approval, via the Supabase Dashboard SQL Editor;
-- Dashboard answered "Success. No rows returned" and a read-only
-- post-check showed service_role — DELETE now present on
-- email_subscribers. Prepared 2026-11-01 after the live diagnosis
-- below.
--
-- WHY THIS EXISTS (live-proven 2026-11-01):
--   The Admin Panel's subscriber DELETE (owner's Prompt 1 rule,
--   2026-10-27: a subscriber leaves ONLY by being deleted) failed
--   every time with the panel message "কাজটি করা যায়নি". The
--   admin-subscribers Edge Function logged POST 500
--   (admin_subscribers_unexpected_error) for each attempt at
--   22:02–22:03 +06 on 2026-11-01, while list/subscribe/update
--   all worked — because migration 0024 (2026-10-25) granted the
--   service_role only select/insert/update on email_subscribers:
--   at that time the design said "subscribers leave by status,
--   never deletes", so DELETE was deliberately not granted. The
--   2026-10-27 delete-only rule changed the function code but
--   nobody extended the grant. Live check 2026-11-01 (read-only,
--   information_schema.role_table_grants): service_role holds
--   INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE on
--   email_subscribers — DELETE is absent.
--
-- What it does (and nothing else):
--   * grant delete on public.email_subscribers to service_role.
--
-- What it does NOT do:
--   - No change for anon or authenticated; their grants and all
--     RLS policies stay exactly as they are.
--   - No DELETE grant on any other table.
--   - No table, column, policy, or data change of any kind.
--   service_role is a server-only role: its key exists only in
--   the Edge Functions' environment and the owner's Dashboard.
--
-- Rollback (if ever needed):
--   revoke delete on public.email_subscribers from service_role;
-- =====================================================================

begin;

grant delete on public.email_subscribers to service_role;

commit;
