-- ============================================================================
-- Migration 0030 (APPLIED LIVE 2026-11-02 (owner's approval; Dashboard SQL Editor, before/after verified))
-- Member message link (owner's request 2026-10-28): the public
-- Members & Committee cards show কল and মেসেজ buttons, and a
-- committee member's মেসেজ already follows an admin-entered
-- Facebook profile link (0016) — but general members had NO such
-- field anywhere: no column, no admin input, no view projection,
-- so a member's মেসেজ could only ever be an SMS (and vanished
-- entirely when the member had no public phone). This migration
-- gives members the same arrangement as the committee.
-- Applying needs the owner's separate permission, as with
-- 0022–0029.
--
-- WHAT THIS DOES
--   1. members gains:
--        facebook_url text     (nullable)
--      The admin-entered Facebook profile link that the public
--      card's মেসেজ button opens (falling back to SMS when
--      empty — same rule as committee cards).
--   2. members_public is recreated with facebook_url APPENDED
--      as the LAST column (CREATE OR REPLACE VIEW requires the
--      existing columns to keep their names, order and types).
--      The link is projected for every active member: it is a
--      deliberately public contact link the admin enters for
--      exactly this purpose — the same treatment committee
--      links get in committee_public (0016). Phone stays behind
--      is_phone_public; address is still never projected.
--
-- WHAT THIS DOES NOT CHANGE
--   - members RLS policies (0001/0010) — unchanged.
--   - committee tables/views — unchanged.
--   - No new table, so no new GRANTs are needed: CREATE OR
--     REPLACE VIEW preserves the view's existing grants, and the
--     new table column rides on the table's existing grants.
--   - Both statements are idempotent: this file may safely be
--     run more than once.
-- ============================================================================

alter table public.members
  add column if not exists facebook_url text;

create or replace view public.members_public as
select
  id,
  name,
  photo_url,
  case when is_phone_public then phone end as phone,
  joined_date,
  display_order,
  facebook_url
from public.members
where is_active;

alter view public.members_public reset (security_invoker);

comment on view public.members_public is
  'Public-safe member list (DEFINER view — migrations 0011 + 0030): only active members (WHERE is_active is in the definition because the owner bypasses RLS); phone appears only when is_phone_public is true; facebook_url is the admin-entered public message link (0030); address is never projected. Treat any change to this definition as a security-policy change.';
