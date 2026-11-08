-- ============================================================================
-- Migration 0031 (APPLIED LIVE 2026-11-02 (owner's approval; Dashboard SQL Editor, before/after verified; committee_public reconciled with live 0036 first — is_current join confirmed present after apply))
-- Homepage "সর্বশেষ অ্যাড করা" order (owner's request 2026-10-29):
-- the homepage preview must show the most recently ADDED 4 members
-- and 4 committee profiles. That order needs each row's creation
-- time in the public views:
--   * members.created_at exists (0001) but members_public does
--     not project it;
--   * committee_members has NO created_at column at all.
-- Applying needs the owner's separate permission, as with
-- 0022–0030. MUST be applied AFTER 0030: the members_public
-- recreation below builds on 0030's column list (facebook_url).
--
-- WHAT THIS DOES
--   1. committee_members gains:
--        created_at timestamptz NOT NULL DEFAULT now()
--      Existing rows all receive the apply timestamp — their
--      true add order is unknowable, so the homepage query
--      breaks ties by display_order; every row added AFTER this
--      migration gets a real timestamp and orders exactly.
--   2. members_public is recreated with created_at APPENDED as
--      the LAST column (CREATE OR REPLACE VIEW requires the
--      existing columns to keep their names, order and types).
--   3. committee_public is recreated the same way.
--
-- WHAT THIS DOES NOT CHANGE
--   - No RLS policy changes; no new tables, so no new GRANTs
--     are needed (CREATE OR REPLACE VIEW preserves grants; the
--     new table column rides on existing table grants).
--   - created_at is not private data: it only orders the
--     already-public rows on the homepage.
--   - Idempotent: this file may safely be run more than once.
-- ============================================================================

alter table public.committee_members
  add column if not exists created_at timestamptz not null default now();

create or replace view public.members_public as
select
  id,
  name,
  photo_url,
  case when is_phone_public then phone end as phone,
  joined_date,
  display_order,
  facebook_url,
  created_at
from public.members
where is_active;

alter view public.members_public reset (security_invoker);

comment on view public.members_public is
  'Public-safe member list (DEFINER view — migrations 0011 + 0030 + 0031): only active members (WHERE is_active is in the definition because the owner bypasses RLS); phone appears only when is_phone_public is true; facebook_url is the admin-entered public message link (0030); created_at orders the homepage latest-added preview (0031); address is never projected. Treat any change to this definition as a security-policy change.';

-- RECONCILED 2026-11-02 (before live apply): migration 0036
-- (APPLIED LIVE 2026-10-29) had already recreated this view
-- with the current-term JOIN. The original 0031 text selected
-- from committee_members alone and would have UNDONE 0036's
-- fix (old terms leaking onto the homepage). The definition
-- below keeps 0036's join and restriction exactly, with
-- created_at appended as the last column.
create or replace view public.committee_public as
  select
    cm.id,
    cm.term_id,
    cm.member_id,
    cm.name,
    cm.role_title,
    cm.photo_url,
    cm.phone,
    cm.facebook_url,
    cm.display_order,
    cm.created_at
  from public.committee_members cm
  join public.committee_terms ct on ct.id = cm.term_id
  where cm.is_active = true
    and ct.is_current = true;

comment on view public.committee_public is
  'Public-safe committee list (migrations 0016 + 0036 + 0031): active rows of the CURRENT term only (0036 join); created_at orders the homepage latest-added preview (0031).';
