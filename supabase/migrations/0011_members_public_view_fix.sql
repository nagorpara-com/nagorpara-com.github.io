-- =====================================================================
-- Nagar Para Agragami Youth Sangha — Migration 0011 (DRAFT)
-- members_public: switch from security_invoker to a definer view
-- whose definition carries the public-read filter itself.
--
-- STATUS: DRAFT — prepared 2026-10-23 after the 0010 verification.
-- NOT APPLIED. Executing it needs the owner's separate permission.
-- It modifies NO existing migration (0010 stays as applied) and
-- changes exactly ONE object: the members_public view from 0010.
--
-- THE PROBLEM (proven live, 2026-10-23):
-- Migration 0010 created members_public WITH (security_invoker =
-- true) and deliberately granted anon NO privilege on the members
-- table (phone privacy). But an invoker view executes with the
-- CALLER's privileges, so PostgreSQL demands the caller hold SELECT
-- on the BASE table too. Verified live: GET /rest/v1/members_public
-- as anon -> 42501 "permission denied for table members", hint
-- "GRANT SELECT ON public.members TO anon". Granting that would
-- reopen the table (and its phone column) to the API — the exact
-- exposure 0010 v2 was written to prevent. The other invoker views
-- work only because anon holds grants on their base tables.
--
-- LIVE STATE BEFORE THIS FIX (catalog-verified 2026-10-23):
--   * View definition: SELECT id, name, photo_url,
--     CASE WHEN is_phone_public THEN phone ELSE NULL END AS phone,
--     joined_date, display_order FROM members  (no WHERE clause —
--     it relied on RLS, which is what fails without privileges).
--   * Owner: postgres (the SQL Editor role — same as every object
--     in this project). reloptions: security_invoker=true.
--   * members policies: "public reads active" (SELECT, is_active)
--     and "admin writes" (ALL, is_admin()).
--   * Grants: anon — NONE on members, SELECT on members_public;
--     authenticated — SELECT/INSERT/UPDATE/DELETE on members,
--     SELECT on members_public.
--
-- THE FIX AND ITS SECURITY MODEL (read before approving):
--   * The view becomes a DEFINER view (the PostgreSQL default):
--     it executes with its OWNER's rights (postgres), so callers
--     need a privilege only on the view itself — which anon and
--     authenticated already have from 0010 (grants survive
--     CREATE OR REPLACE VIEW; this file grants nothing new).
--   * CONSEQUENCE, stated plainly: the owner bypasses RLS, so for
--     reads THROUGH THIS VIEW the members RLS policies no longer
--     apply. The view's own DEFINITION becomes the only barrier —
--     therefore the definition below replicates the public-read
--     policy exactly: `where is_active`, the same six safe columns,
--     phone only via the is_phone_public CASE, and `address` (and
--     every other members column) never projected.
--   * STANDING WARNING: from now on, this view's definition IS a
--     security policy. Any future change to it (adding a column,
--     weakening the WHERE) is a policy change and must go through
--     a reviewed migration like this one — never an ad-hoc edit.
--   * Direct access to the members TABLE is untouched: anon still
--     has no grant at all; authenticated access stays governed by
--     the existing RLS policies (active rows; admins all rows).
--   * No cross-table reach: the view reads `members` only — no
--     joins, no functions, no other table can be read through it.
--     Callers can only filter/sort the six output columns of
--     already-active members.
--   * Alternatives considered and rejected:
--       - Column-level grants on members for anon: an invoker
--         view's CASE must read `phone` AS THE CALLER, so anon
--         would need the phone column privilege — and then could
--         select phone directly. Dead end (same as v1's flaw).
--       - A security-definer FUNCTION returning rows: same trust
--         model as a definer view, but a poorer fit for PostgREST
--         and harder to audit than one visible view definition.
--
-- EXECUTION NOTES:
--   * Statement order matters: the definition is replaced FIRST
--     (adding the is_active filter), and only then is the invoker
--     option removed — at no point does an unfiltered definer
--     definition exist.
--   * The replacement query returns the same six columns with the
--     same names, order and types as the current view, as
--     CREATE OR REPLACE VIEW requires.
--   * Both statements are idempotent: this file may safely be run
--     more than once (unlike most migrations here).
-- =====================================================================

create or replace view public.members_public as
select
  id,
  name,
  photo_url,
  case when is_phone_public then phone end as phone,
  joined_date,
  display_order
from public.members
where is_active;

alter view public.members_public reset (security_invoker);

comment on view public.members_public is
  'Public-safe member list (DEFINER view — migration 0011): only active members (WHERE is_active is in the definition because the owner bypasses RLS); phone appears only when is_phone_public is true; address is never projected. Treat any change to this definition as a security-policy change.';

-- =====================================================================
-- VERIFY AFTER RUNNING:
--  SQL:  select reloptions from pg_class where relname =
--        'members_public';  -> NULL/empty (invoker removed).
--        select pg_get_viewdef('public.members_public'::regclass);
--        -> definition contains "where is_active" (shown as
--           WHERE is_active by pg_get_viewdef).
--  API (needs member test rows — creating test data is a separate
--  owner-approved step; see the 0011 test plan):
--   1. Active member, is_phone_public = false: appears in
--      GET /rest/v1/members_public with phone = null.
--   2. Active member, is_phone_public = true: phone visible.
--   3. Inactive member: absent from members_public entirely.
--   4. GET /rest/v1/members as anon -> still 401/42501 (denied).
--   5. No response from members_public ever contains an address
--      field (the column does not exist in the view).
--   6. Requests without an API key -> "No API key found" (401),
--      unchanged.
--   7. Regression: all other anon reads from the 0010 verification
--      (home_sections 200 with 11 rows, finance_summary 200,
--      contact POST 201 with read-back denied) still behave the
--      same — this file touches nothing else.
-- =====================================================================
