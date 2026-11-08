-- =====================================================================
-- Migration 0058 — Village Profile banner TEXT: each row of
-- `village_page_banners` (migration 0057) gains its OWN optional
-- text content — a heading, a description, an optional CTA button
-- (text + link) and a visibility switch — managed per banner from
-- Admin গ্রামের পরিচিতি (the banner card on /admin/village) and
-- shown LEFT-ALIGNED over that banner's slide on the public
-- Village Profile page (owner's "Village Profile Section –
-- Complete Banner & Media Enhancement" spec, 2026-11-05).
-- Village Profile ONLY — no other section's banner or text is
-- touched; the Home hero text stays exactly as it is.
--
-- STATUS: APPLIED LIVE 2026-11-05 (owner's tap; Supabase
-- Dashboard SQL Editor, run exactly once, "Success"). Before:
-- the 0057 column set only, 1 banner row. After (Dashboard
-- checks + an independent anon REST read): all five columns
-- present with the intended types/defaults; the existing row
-- intact, text columns NULL, show_text true.
-- (This header edit is comment-only, made after the live run.)
--
-- What it does (and nothing else):
--   1. Adds five columns to public.village_page_banners:
--        heading     text, at most 120 characters
--        description text, at most 300 characters
--        cta_text    text, at most 40 characters
--        cta_link    text, at most 500 characters
--        show_text   boolean NOT NULL DEFAULT true
--      All four text columns are nullable: a banner with no text
--      simply carries NULLs and the public page falls back to the
--      static heading block for that slide. Clearing a banner's
--      text (Admin "লেখা মুছুন") sets only these four columns
--      back to NULL — the image row itself is never touched.
--   2. No policy, grant or index changes: the columns ride on
--      the existing table, so migration 0057's RLS (public reads
--      PUBLISHED rows only; can_edit_content() manages) already
--      covers them. Note the public therefore reads a published
--      banner's text together with its image — that is the point
--      of the feature; unpublished rows stay invisible as before.
--
-- Rollback (if ever needed):
--   ALTER TABLE public.village_page_banners
--     DROP COLUMN IF EXISTS heading,
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS cta_text,
--     DROP COLUMN IF EXISTS cta_link,
--     DROP COLUMN IF EXISTS show_text;
-- The app then steps back down to the 0057 column set on its own.
-- =====================================================================

ALTER TABLE public.village_page_banners
  ADD COLUMN IF NOT EXISTS heading text CHECK (char_length(heading) <= 120),
  ADD COLUMN IF NOT EXISTS description text CHECK (char_length(description) <= 300),
  ADD COLUMN IF NOT EXISTS cta_text text CHECK (char_length(cta_text) <= 40),
  ADD COLUMN IF NOT EXISTS cta_link text CHECK (char_length(cta_link) <= 500),
  ADD COLUMN IF NOT EXISTS show_text boolean NOT NULL DEFAULT true;
