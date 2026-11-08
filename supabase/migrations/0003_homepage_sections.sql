-- =====================================================================
-- Homepage sections control (Phase 4 DRAFT — not applied anywhere yet)
-- =====================================================================
-- WHY THIS TABLE IS NEEDED (the Phase 2 schema has a real gap here):
-- `site_settings` holds organization identity/contact only. Nothing in
-- 0001 can store: the hero title/subtitle/image/CTAs, which homepage
-- sections are visible, or their order. The Phase 4 brief requires all
-- of that to be Admin-manageable, so one small table is added instead of
-- hard-coding section visibility/order in the frontend.
--
-- The frontend ships the same defaults in `src/config/homepage.ts`;
-- when Supabase is connected, rows here override them at runtime.
-- =====================================================================

create table public.home_sections (
  key text primary key, -- hero | about | village | football | cricket |
                        -- matches | news | gallery | finance | members | contact
  title text not null,
  is_enabled boolean not null default true,
  display_order int not null default 0,
  config jsonb not null default '{}'::jsonb, -- e.g. hero texts / image url
  updated_at timestamptz not null default now()
);
alter table public.home_sections enable row level security;

-- Section config is public website content (no sensitive data).
create policy "home_sections: public read"
  on public.home_sections for select using (true);
create policy "home_sections: admin writes"
  on public.home_sections for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.home_sections (key, title, display_order, config) values
  ('hero',    'Hero',               1,  '{"title": "একতা, খেলা ও উন্নয়নের পথে", "subtitle": "গ্রামের যুবসমাজের শক্তি, খেলাধুলা ও সামাজিক উন্নয়নের অঙ্গীকার!", "image_url": null}'::jsonb),
  ('about',   'সংগঠন পরিচিতি',      2,  '{}'::jsonb),
  ('village', 'গ্রাম পরিচিতি',       3,  '{}'::jsonb),
  ('football','ফুটবল দল',           4,  '{}'::jsonb),
  ('cricket', 'ক্রিকেট দল',          5,  '{}'::jsonb),
  ('matches', 'ম্যাচ',               6,  '{}'::jsonb),
  ('news',    'সংবাদ ও কার্যক্রম',   7,  '{}'::jsonb),
  ('gallery', 'গ্যালারি',            8,  '{}'::jsonb),
  ('finance', 'আর্থিক সারসংক্ষেপ',   9,  '{}'::jsonb),
  ('members', 'সদস্য ও কমিটি',       10, '{}'::jsonb),
  ('contact', 'যোগাযোগ',            11, '{}'::jsonb)
on conflict (key) do nothing;
