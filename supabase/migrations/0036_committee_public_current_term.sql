-- =====================================================================
-- Migration 0036 — committee_public: show ONLY the current term.
--
-- STATUS: APPLIED LIVE 2026-10-29 (owner's confirmed order in
-- chat, as part of the full content wipe — run once via the
-- Supabase Dashboard SQL Editor inside
-- docs/CONTENT_WIPE_2026-10-29.sql; "Success. No rows
-- returned"; committee_public read back empty over REST along
-- with every other wiped table).
--
-- The bug (found in the owner's full-site scan, 2026-10-29):
-- migration 0016's view filters only `is_active = true`, with NO
-- term restriction. The /members page filters to the current
-- term in the browser, but the HOMEPAGE preview reads the view
-- directly — so active members of OLD/test terms leaked onto
-- the homepage even after the owner unpublished everyone in the
-- current term (he saw 2 test entries from two non-current
-- terms on the live homepage).
--
-- The fix (and nothing else): the same columns in the same
-- order, joined to committee_terms, restricted to
-- `ct.is_current = true`, keeping `cm.is_active = true`.
-- Every consumer of the view (homepage preview, /members page)
-- is fixed at once. No data is touched; no GRANT change (the
-- view keeps its existing grants through CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE VIEW public.committee_public AS
  SELECT
    cm.id,
    cm.term_id,
    cm.member_id,
    cm.name,
    cm.role_title,
    cm.photo_url,
    cm.phone,
    cm.facebook_url,
    cm.display_order
  FROM public.committee_members cm
  JOIN public.committee_terms ct ON ct.id = cm.term_id
  WHERE cm.is_active = true
    AND ct.is_current = true;
