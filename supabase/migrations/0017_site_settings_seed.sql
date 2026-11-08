-- =====================================================================
-- Migration 0017 — Seed the single site_settings row (id = 1)
-- Nagar Para Agragami Youth Sangha
-- ---------------------------------------------------------------------
-- WHY: Migration 0001 created `public.site_settings` but no migration
-- ever inserted its single row. Verified live 2026-10-24: the table is
-- EMPTY, so the Admin Settings page cannot load or save (it requires
-- the id = 1 row) and the public Header/Footer run entirely on the
-- code defaults in src/config/organization.ts. This seed follows the
-- project's own precedent: home_sections was seeded inside its
-- migration (0003).
--
-- VALUES: only owner-provided/confirmed organization information —
-- the same values the public site already displays from the code
-- defaults, so applying this changes nothing visually. Columns not
-- listed take their schema defaults (football_* / cricket_* from
-- 0004/0005). Deliberately NULL (never provided by the owner):
-- tagline, established_year, logo_url (public falls back to the real
-- logo at public/logo.png), youtube_url, cricket_team_name,
-- cricket_current_season.
--
-- Facebook: https://www.facebook.com/nagorpara — the organization's
-- Page, verified and explicitly confirmed by the owner on 2026-10-24.
--
-- Idempotent: safe to run once; a second run changes nothing.
-- =====================================================================

insert into public.site_settings (
  id, org_name_bn, org_name_en, address, phone, email, facebook_url
) values (
  1,
  'নগর পাড়া অগ্রগামী যুব সংঘ',
  'Nagar Para Agragami Youth Sangha',
  'নগর পাড়া, তাড়াশ, সিরাজগঞ্জ, বাংলাদেশ',
  '01956383607',
  'nagorpara.youth@gmail.com',
  'https://www.facebook.com/nagorpara'
)
on conflict (id) do nothing;

-- =====================================================================
-- VERIFY AFTER RUNNING (Supabase SQL Editor):
--   select id, org_name_bn, email, facebook_url
--     from public.site_settings;
--   exactly 1 row with the values above.
-- =====================================================================
