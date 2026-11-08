-- =====================================================================
-- Migration 0032 — Members & Committee page banners: a small table
-- holding up to THREE banner photos for the public Members &
-- Committee page, managed from Admin সদস্য ও কমিটি ব্যানার
-- (owner's order, 2026-10-29). The public page rotates through the
-- PUBLISHED banners as a slider; unpublished ones stay hidden, and
-- any banner can be deleted from the panel.
--
-- STATUS: APPLIED LIVE 2026-10-29 (owner's approval in chat;
-- run once via the Supabase Dashboard SQL Editor; verified over
-- REST — anon read returns the published rows). Three banner
-- rows were seeded the same day at the owner's order (the three
-- built-in crops of his photo, display_order 1–3, all published).
-- The application code stays tolerant of a missing table: reads
-- treat it as "no banners" and the public page falls back to the
-- Settings banner photo / built-in default, unchanged.
--
-- What it does (and nothing else):
--   1. Creates public.members_page_banners (id, image_url,
--      display_order, is_published, created_at, updated_at).
--      image_url is the URL produced by the existing device-upload
--      flow (site-assets bucket) — only the URL is stored.
--   2. RLS: the public (anon + authenticated) may read PUBLISHED
--      rows only; content editors (can_edit_content()) may read
--      and write every row from the Admin Panel. No one else can
--      write. The "maximum 3 banners" limit is enforced by the
--      Admin Panel (the only write path), not by a DB constraint.
--   3. Explicit GRANTs for anon / authenticated. No Edge Function
--      touches this table, so no service_role grant is needed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.members_page_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL CHECK (char_length(image_url) <= 1000),
  display_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_page_banners_public_order_idx
  ON public.members_page_banners (is_published, display_order, created_at);

ALTER TABLE public.members_page_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_page_banners: public read published" ON public.members_page_banners;
CREATE POLICY "members_page_banners: public read published"
  ON public.members_page_banners FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "members_page_banners: editors manage" ON public.members_page_banners;
CREATE POLICY "members_page_banners: editors manage"
  ON public.members_page_banners FOR ALL
  TO authenticated
  USING (public.can_edit_content())
  WITH CHECK (public.can_edit_content());

GRANT SELECT ON public.members_page_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members_page_banners TO authenticated;
