-- =====================================================================
-- Migration 0057 — Village Profile page banners: a small table
-- holding up to THREE banner photos for the public Village
-- Profile page, managed from Admin গ্রামের পরিচিতি (the banner
-- card on /admin/village), exactly mirroring the Members &
-- Committee page banners of migration 0032 (owner's order,
-- 2026-11-05: "হ্যাঁ, ৩টা ব্যানারের স্লাইডার করো" — modelled on
-- the Members page). The public page rotates through the
-- PUBLISHED banners as a crossfade slider; unpublished ones stay
-- hidden, and any banner can be deleted from the panel.
--
-- STATUS: APPLIED LIVE 2026-11-05 (owner's tap; Supabase
-- Dashboard SQL Editor, run exactly once, "Success"). Before:
-- table absent; site_settings.village_banner_url held the
-- photo_6 tree-planting photo. After (Dashboard checks + an
-- independent anon REST read): exactly 1 row — that same photo
-- as display_order 1, published; RLS on; both policies present.
-- (This header edit is comment-only, made after the live run.)
--
-- What it does (and nothing else):
--   1. Creates public.village_page_banners with the same shape
--      as members_page_banners (id, image_url, display_order,
--      is_published, created_at, updated_at). image_url is the
--      URL produced by the existing device-upload flow
--      (site-assets bucket) — only the URL is stored.
--   2. RLS: the public (anon + authenticated) may read PUBLISHED
--      rows only; content editors (can_edit_content()) may read
--      and write every row from the Admin Panel. No one else can
--      write. The "maximum 3 banners" limit is enforced by the
--      Admin Panel (the only write path), not by a DB constraint.
--   3. SEED: when site_settings.village_banner_url currently
--      holds a photo, it becomes the first banner row
--      (display_order 1, published) so the photo the owner
--      already set keeps showing as slide 1. The seed is guarded
--      by NOT EXISTS, so re-running this file can never duplicate
--      it. The settings column itself is NOT touched — it stays
--      as the public page's fallback when no slider row is
--      published.
--   4. Explicit GRANTs for anon / authenticated. No Edge Function
--      touches this table, so no service_role grant is needed.
--
-- Rollback (if ever needed): DROP TABLE public.village_page_banners;
-- The app then falls back to the single Settings banner photo,
-- unchanged. (Do NOT drop site_settings.village_banner_url —
-- it predates this migration and is the fallback.)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.village_page_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL CHECK (char_length(image_url) <= 1000),
  display_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS village_page_banners_public_order_idx
  ON public.village_page_banners (is_published, display_order, created_at);

ALTER TABLE public.village_page_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "village_page_banners: public read published" ON public.village_page_banners;
CREATE POLICY "village_page_banners: public read published"
  ON public.village_page_banners FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "village_page_banners: editors manage" ON public.village_page_banners;
CREATE POLICY "village_page_banners: editors manage"
  ON public.village_page_banners FOR ALL
  TO authenticated
  USING (public.can_edit_content())
  WITH CHECK (public.can_edit_content());

GRANT SELECT ON public.village_page_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.village_page_banners TO authenticated;

-- Seed: the owner's current single banner photo (if any) becomes
-- the first slide, so applying this migration changes nothing a
-- visitor sees. Guarded so a re-run inserts nothing twice.
INSERT INTO public.village_page_banners (image_url, display_order, is_published)
SELECT s.village_banner_url, 1, true
FROM public.site_settings s
WHERE s.village_banner_url IS NOT NULL
  AND btrim(s.village_banner_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.village_page_banners);
