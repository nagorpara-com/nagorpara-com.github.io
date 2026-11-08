-- =====================================================================
-- Migration 0021 — Close the committee_members anon bypass (Section 04, Item 1)
-- STATUS: APPLIED LIVE 2026-11-02 (owner picked audit fix #1; Dashboard SQL Editor, before anon_can_select=true -> after false; committee_public verified working; independent REST re-check: base table now refuses anon, view still 200).
-- Prepared 2026-10-25 at the owner's Item 1 approval: migration FILE
-- + scratch verification only. Applying this file to the live
-- database needs the owner's separate approval.
--
-- Problem (found in the Section 04 audit, proven with a live
-- read-only anon probe on 2026-10-25):
--   Migration 0010 granted SELECT on the BASE table
--   public.committee_members to the anon role, and the base SELECT
--   policy is "using (true)" — so anyone can read EVERY committee
--   row directly, including rows the admin deliberately deactivated
--   (is_active = false) and their phone / facebook_url. Migration
--   0016 added the privacy-safe path (the `committee_public` view,
--   active rows only) but never revoked the old base-table grant,
--   so the view's protection can be bypassed.
--   At discovery time all live rows were active with no phone set,
--   so nothing private was exposed yet — this closes the door
--   before the first deactivation makes it a real leak.
--
-- Why this is safe for the public website:
--   * The public site reads the committee ONLY from
--     `committee_public` (src/hooks/usePublicMembers.ts) plus
--     `committee_terms` (titles/dates). It never reads the base
--     table.
--   * `committee_public` is a DEFINER-mode view (0016 created it
--     without security_invoker, the PostgreSQL default), so anon
--     access to the VIEW does not depend on any base-table grant.
--   * Admin access is through the `authenticated` role (0010 grants
--     it SELECT on all tables; writes are gated by the
--     "committee members: admin writes" policy) — untouched here.
--
-- Permissions before -> after:
--   anon          SELECT committee_members  GRANTED -> REVOKED
--   anon          SELECT committee_public   unchanged (granted, 0016)
--   anon          SELECT committee_terms    unchanged (granted, 0010)
--   authenticated SELECT/WRITE              unchanged
--   Data rows                               unchanged (no DML at all)
--
-- Idempotent: REVOKE of a privilege that is not held is a no-op, so
-- re-running this file is safe. Rollback (if ever needed) is the
-- single line: grant select on public.committee_members to anon;
-- =====================================================================

begin;

revoke select on table public.committee_members from anon;

commit;
