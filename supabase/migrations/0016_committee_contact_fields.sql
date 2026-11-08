-- ============================================================================
-- Migration 0016 (DRAFT — NOT APPLIED)
-- Committee contact fields (R-07.5 — owner's request 2026-10-24):
-- each committee member gets an optional phone number, an
-- optional Facebook profile URL, and an active (published)
-- flag, managed from the existing Admin Committee page.
-- Applying needs the owner's separate permission, as with
-- 0013–0015.
--
-- WHAT THIS DOES
--   1. committee_members gains:
--        phone        text     (nullable)
--        facebook_url text     (nullable)
--        is_active    boolean  NOT NULL DEFAULT true
--      Existing rows (none live at draft time) become active.
--   2. New public view `committee_public`: ACTIVE committee
--      rows only — the same privacy-by-construction pattern as
--      `members_public` (0011). The public website reads the
--      committee from this view, so an unpublished committee
--      member (and their phone/Facebook) never reaches the
--      public payload. The view runs in definer mode (the
--      default); its column list is explicit and contains no
--      private field.
--   3. GRANTs for the view, per the project's migration rule
--      (every migration carries its own explicit GRANTs; no
--      default privileges are relied on).
--
-- WHAT THIS DOES NOT CHANGE
--   - committee_members RLS policies (public read of the base
--     table and is_admin() writes from 0003 stay as they are;
--     the website simply stops reading the base table).
--   - Terms (committee_terms) — unchanged.
--   - Members / members_public — unchanged.
-- ============================================================================

alter table public.committee_members
  add column if not exists phone text,
  add column if not exists facebook_url text,
  add column if not exists is_active boolean not null default true;

create or replace view public.committee_public as
  select
    id,
    term_id,
    member_id,
    name,
    role_title,
    photo_url,
    phone,
    facebook_url,
    display_order
  from public.committee_members
  where is_active = true;

-- Least-privilege grants (explicit, per the project rule).
grant select on public.committee_public to anon, authenticated;
