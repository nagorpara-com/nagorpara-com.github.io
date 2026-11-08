-- =====================================================================
-- Nagar Para Agragami Youth Sangha — Migration 0012 (DRAFT)
-- Remove the "super_admin" role: ONE top role remains — "admin",
-- the single main Admin of the organization.
--
-- STATUS: DRAFT — prepared 2026-10-23 on the owner's decision
-- ("Super Admin বলে কোন কিছু থাকবে না — শুধু Admin, Main Admin
-- একজনই সর্বোচ্চ"). NOT APPLIED. Executing it needs the owner's
-- separate permission, and it must run BEFORE the companion app
-- update (which removes super_admin from the codebase) is used —
-- until this runs, the current app build keeps working unchanged.
--
-- WHAT THIS DOES:
--   1. Any profile with role 'super_admin' becomes 'admin'.
--      (Today that is exactly one row: the owner's bootstrap
--      account, nagorpara@gmail.com / MD Sohel Rana.)
--   2. The three role-helper functions are recreated WITHOUT
--      'super_admin' in their lists — same names, signatures and
--      security settings as live (0001 definitions; the 0007
--      is_active behaviour lives in current_user_role(), which
--      this migration does NOT touch):
--        is_admin()          -> role = 'admin'
--        can_edit_content()  -> role in ('admin', 'editor')
--        can_manage_finance()-> role in ('admin', 'finance_manager')
--      Every RLS policy that calls these helpers follows
--      automatically — no policy besides #3 is touched.
--   3. The one policy that names the role directly is replaced:
--      "profiles: only super_admin writes" -> "profiles: only
--      admin writes" (same FOR ALL shape, role = 'admin'). This is
--      the profile/user-management gate: from now on the single
--      Admin manages user accounts.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   The user_role ENUM keeps 'super_admin' as a stored value.
--   PostgreSQL has no "drop enum value" operation; removing it
--   would require dropping and recreating current_user_role()
--   AND every RLS policy whose expression references it (~50
--   policies) — a high-risk rewrite for zero observable gain.
--   After this migration the value is referenced by NOTHING: no
--   profile row holds it, no function tests it, no policy names
--   it, and the companion app update removes it from the code,
--   the role labels and every role list. If the owner later wants
--   the enum itself rebuilt, that is a separate, separately
--   reviewed migration.
--
-- SAFETY / LOCKOUT NOTE (updated guidance):
--   With a single top role, the old "keep two super_admins" rule
--   becomes: protect the one Admin account — its email inbox IS
--   the password-recovery path. A second 'admin' account can be
--   added later through the Users panel if the owner ever wants
--   a backup; recovery from total lockout remains possible via
--   the owner's Supabase SQL Editor (service role bypasses RLS):
--     update public.profiles set role = 'admin', is_active = true
--     where id = '<the admin user uuid>';
--
-- Both CREATE OR REPLACE FUNCTIONs and the UPDATE are idempotent;
-- the DROP POLICY makes the file safest run exactly once (a second
-- run would fail at the DROP because the old policy is gone —
-- that failure is harmless and changes nothing).
-- =====================================================================

-- 1) Move the top account(s) to the single Admin role.
update public.profiles
set role = 'admin'
where role = 'super_admin';

-- 2) Recreate the role helpers without 'super_admin'.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_user_role() = 'admin' $$;

create or replace function public.can_edit_content()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_user_role() in ('admin', 'editor') $$;

create or replace function public.can_manage_finance()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_user_role() in ('admin', 'finance_manager') $$;

-- 3) The profiles write policy now names 'admin'.
drop policy "profiles: only super_admin writes" on public.profiles;
create policy "profiles: only admin writes"
  on public.profiles for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- =====================================================================
-- VERIFY AFTER RUNNING:
--  SQL:  select role, count(*) from public.profiles group by role;
--        -> no 'super_admin' row; the owner shows as 'admin'.
--        select policyname from pg_policies where tablename =
--        'profiles'; -> "only admin writes" present, the old
--        super_admin policy gone. Policy total stays 61.
--        select proname, pg_get_functiondef(oid) from pg_proc
--        where proname in ('is_admin','can_edit_content',
--        'can_manage_finance'); -> no 'super_admin' in any body.
--  APP (after the companion code update is deployed):
--   * Owner logs in -> header badge reads "Admin".
--   * Dashboard finance section, Players delete, Matches delete,
--     Settings save all work for the Admin exactly as before.
--   * Regression: public site unchanged; anon reads still 200;
--     contact POST still 201 with read-back denied.
-- =====================================================================
