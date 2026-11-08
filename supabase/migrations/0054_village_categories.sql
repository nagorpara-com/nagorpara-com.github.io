-- =====================================================================
-- Migration 0054 — village_categories: the Village Profile page's
-- categories (chip label + section heading + kind + order +
-- published flag) become Admin-managed data instead of a
-- hardcoded list in the page code (owner's order, 2026-11-03:
-- whatever a visitor can open on the village page must be
-- manageable from the Admin Panel, categories included).
--
-- STATUS: APPLIED LIVE 2026-11-03 (owner tap) — this file was applied to the
-- live database with the owner.*separate approval, as with
-- every migration. Until it is live the application code falls
-- back to the built-in category list, so nothing changes for
-- visitors or admins.
--
-- What it does (and nothing else):
--   1. NEW table `village_categories`: one row per category of
--      the public Village Profile page.
--      * key — the page anchor id and the village_sections.area
--        value that routes content into the category; a short
--        English slug, set once at creation and never edited.
--      * label — the chip text under the banner.
--      * title — the section heading on the page.
--      * kind — which block renders the category:
--          text     = village_sections articles (title / text /
--                     photo / video) with an honest empty state
--          location = the অবস্থান ও ঠিকানা tiles block
--                     (site_settings driven, migration 0034)
--          places   = গুরুত্বপূর্ণ স্থান articles (also
--                     village_sections rows, managed on their
--                     own Admin page)
--          photos   = the গ্রামের ছবি gallery album block
--        Only 'text' categories can be created or deleted from
--        the Admin Panel; the three special kinds are seeded
--        here and can only be renamed / reordered / hidden.
--      * display_order + is_published drive the page order and
--        visibility, like every other content table.
--   2. RLS: the public reads PUBLISHED categories only; content
--      editors (can_edit_content()) insert and update; DELETE
--      is Admin-only (is_admin()), the stricter rule the
--      matches tables use (migration 0006). Explicit grants,
--      per the project rule that every migration creating a
--      table ends with its own grant section.
--   3. SEED: the eight categories the page shows today, in
--      today's order, with today's chip labels and section
--      headings — so applying this migration changes nothing a
--      visitor sees. ON CONFLICT (key) DO NOTHING keeps a
--      re-run from duplicating or overwriting Admin edits.
--   4. village_sections.area: the value-list CHECK from
--      migrations 0022/0035 (constraint
--      village_sections_area_check) is replaced by a FORMAT
--      check (same slug shape as village_categories.key), so a
--      section can be routed into an Admin-created category.
--      Every value valid today stays valid; no row is touched.
-- =====================================================================

create table if not exists public.village_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
    check (key ~ '^[a-z][a-z0-9_]*$' and char_length(key) <= 40),
  label text not null
    check (char_length(label) <= 80),
  title text not null
    check (char_length(title) <= 200),
  kind text not null
    check (kind in ('text', 'location', 'places', 'photos')),
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.village_categories is
  'Categories of the public Village Profile page (migration 0054): chip label, section heading, block kind, order, published flag. Managed from Admin ক্যাটাগরি পরিচালনা.';
comment on column public.village_categories.key is
  'Anchor id of the category and the village_sections.area value that routes content into it. A short English slug, fixed at creation.';
comment on column public.village_categories.kind is
  'Which block renders the category: text (village_sections articles), location (অবস্থান tiles), places (গুরুত্বপূর্ণ স্থান), photos (গ্রামের ছবি album). Only text categories can be created or deleted from Admin.';

alter table public.village_categories enable row level security;

-- (drop-if-exists guards keep this draft safe to re-run in the
-- Dashboard SQL editor.)
drop policy if exists "village categories: public reads published" on public.village_categories;
create policy "village categories: public reads published"
  on public.village_categories for select
  using (is_published);

drop policy if exists "village categories: editors insert" on public.village_categories;
create policy "village categories: editors insert"
  on public.village_categories for insert
  with check (public.can_edit_content());

drop policy if exists "village categories: editors update" on public.village_categories;
create policy "village categories: editors update"
  on public.village_categories for update
  using (public.can_edit_content())
  with check (public.can_edit_content());

drop policy if exists "village categories: admins delete" on public.village_categories;
create policy "village categories: admins delete"
  on public.village_categories for delete
  using (public.is_admin());

-- Grants (project rule: a migration that creates a table ends
-- with its own explicit grant section).
grant select on table public.village_categories to anon;
grant select, insert, update, delete on table public.village_categories to authenticated;
grant select, insert, update, delete on table public.village_categories to service_role;

-- Seed: the eight categories exactly as the page renders them
-- today (chip label / section heading / block kind / order).
insert into public.village_categories (key, label, title, kind, display_order) values
  ('porichiti', 'গ্রামের পরিচিতি', 'গ্রামের পরিচিতি', 'text', 1),
  ('obosthan', 'অবস্থান ও ঠিকানা', 'অবস্থান ও ঠিকানা', 'location', 2),
  ('itihash', 'ইতিহাস', 'গ্রামের ইতিহাস', 'text', 3),
  ('sthan', 'গুরুত্বপূর্ণ স্থান', 'গুরুত্বপূর্ণ স্থান ও স্থাপনা', 'places', 4),
  ('chobi', 'গ্রামের ছবি', 'গ্রামের ছবি', 'photos', 5),
  ('prokriti', 'প্রকৃতি ও পরিবেশ', 'প্রকৃতি ও পরিবেশ', 'text', 6),
  ('karjokrom', 'কার্যক্রম', 'সামাজিক, সাংস্কৃতিক ও ক্রীড়া কার্যক্রম', 'text', 7),
  ('songothon', 'সংগঠন পরিচিতি', 'নগর পাড়া অগ্রগামী যুব সংঘ — পরিচিতি ও উদ্দেশ্য', 'text', 8)
on conflict (key) do nothing;

-- village_sections.area: value list becomes a format check, so
-- sections can be routed into Admin-created categories. The
-- constraint keeps its name (village_sections_area_check, from
-- migrations 0022/0035) so rollback references stay valid.
alter table public.village_sections
  drop constraint if exists village_sections_area_check;

alter table public.village_sections
  add constraint village_sections_area_check
  check (area ~ '^[a-z][a-z0-9_]*$' and char_length(area) <= 40);
