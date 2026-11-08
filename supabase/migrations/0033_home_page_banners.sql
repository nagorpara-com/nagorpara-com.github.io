-- =====================================================================
-- Migration 0033 — Homepage banners: a small table holding up to
-- THREE banner photos for the public homepage hero, managed from
-- Admin ওয়েবসাইট কনটেন্ট হোমপেজ ব্যানার (owner's order,
-- 2026-10-29 — the same arrangement he approved for the Members &
-- Committee page in 0032). The homepage rotates through the
-- PUBLISHED banners as a slider behind the hero headline; the
-- headline, subtitle and buttons stay the same over every slide.
-- Unpublished banners stay hidden; any banner can be deleted.
--
-- STATUS: APPLIED LIVE 2026-10-29 (owner's approval in chat;
-- run once via the Supabase Dashboard SQL Editor; verified over
-- REST — anon read returns the published rows). Three banner
-- rows were seeded the same day at the owner's order (the three
-- built-in crops of his photo, display_order 1–3, all published
-- — the same three photos as the Members & Committee banners).
-- The application code stays tolerant of a missing table: reads
-- treat it as "no banners" and the homepage hero falls back to
-- the single Hero background photo (Admin হোমপেজ পরিচালনা) /
-- plain brand green, unchanged.
--
-- What it does (and nothing else):
--   1. Creates public.home_page_banners (id, image_url,
--      display_order, is_published, created_at, updated_at).
--      image_url is the URL produced by the existing device-upload
--      flow (site-assets bucket) or a Website Gallery item — only
--      the URL is stored.
--   2. RLS: the public (anon + authenticated) may read PUBLISHED
--      rows only; content editors (can_edit_content()) may read
--      and write every row from the Admin Panel. No one else can
--      write. The "maximum 3 banners" limit is enforced by the
--      Admin Panel (the only write path), not by a DB constraint.
--   3. Explicit GRANTs for anon / authenticated. No Edge Function
--      touches this table, so no service_role grant is needed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.home_page_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL CHECK (char_length(image_url) <= 1000),
  display_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_page_banners_public_order_idx
  ON public.home_page_banners (is_published, display_order, created_at);

ALTER TABLE public.home_page_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_page_banners: public read published" ON public.home_page_banners;
CREATE POLICY "home_page_banners: public read published"
  ON public.home_page_banners FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "home_page_banners: editors manage" ON public.home_page_banners;
CREATE POLICY "home_page_banners: editors manage"
  ON public.home_page_banners FOR ALL
  TO authenticated
  USING (public.can_edit_content())
  WITH CHECK (public.can_edit_content());

GRANT SELECT ON public.home_page_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_page_banners TO authenticated;
