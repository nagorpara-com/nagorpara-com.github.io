-- =====================================================================
-- নগর পাড়া অগ্রগামী যুব সংঘ — Initial schema (Phase 2 DRAFT)
-- =====================================================================
-- STATUS: Prepared in Phase 2, NOT applied anywhere yet.
-- It will be run in the SQL Editor of the organization's own Supabase
-- project in the Supabase setup step, after review.
--
-- Security model:
--   * RLS is enabled on EVERY table in the same migration that creates it.
--   * The public (anon) can only read rows flagged published/public.
--   * Writes require a logged-in user whose profiles.role allows it.
--   * The frontend only ever holds the anon key — RLS is the protection.
-- =====================================================================

create type public.user_role as enum
  ('super_admin', 'admin', 'finance_manager', 'editor', 'viewer');
create type public.sport_type as enum ('football', 'cricket');
create type public.finance_txn_type as enum
  ('income', 'subscription', 'donation', 'expense', 'withdrawal', 'transfer');

-- ---------------------------------------------------------------------
-- Profiles (1 row per Supabase Auth user; role lives here, never in code)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  role public.user_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Helper functions (security definer avoids RLS recursion).
-- ORDER MATTERS: these are SQL-language functions, whose bodies are
-- validated at creation time — current_user_role() selects from
-- public.profiles, so the helpers MUST be defined after the profiles
-- table exists. (Found on the first live run, 2026-10-23: defining them
-- before the table fails with 42P01 "relation public.profiles does not
-- exist". Approved fix: move this block here, nothing else changed.)
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_user_role() in ('super_admin', 'admin') $$;

create or replace function public.can_edit_content()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_user_role() in ('super_admin', 'admin', 'editor') $$;

create or replace function public.can_manage_finance()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_user_role() in ('super_admin', 'admin', 'finance_manager') $$;

create policy "profiles: own row or admin reads"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "profiles: only super_admin writes"
  on public.profiles for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Site settings (single row, id = 1; managed from Admin > Settings)
-- ---------------------------------------------------------------------
create table public.site_settings (
  id int primary key check (id = 1),
  org_name_bn text not null,
  org_name_en text,
  tagline text,
  logo_url text,
  established_year int,
  address text,
  phone text,
  email text,
  facebook_url text,
  youtube_url text,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;

create policy "site_settings: public read"
  on public.site_settings for select using (true);
create policy "site_settings: admin writes"
  on public.site_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Village profile & history sections
-- ---------------------------------------------------------------------
create table public.village_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  image_url text,
  display_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.village_sections enable row level security;

create policy "village_sections: public reads published"
  on public.village_sections for select using (is_published);
create policy "village_sections: editors write"
  on public.village_sections for all
  using (public.can_edit_content()) with check (public.can_edit_content());

-- ---------------------------------------------------------------------
-- Players + per-sport stats
-- ---------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  sport public.sport_type not null,
  name text not null,
  photo_url text,
  jersey_no int,
  position text not null,
  bio text,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.players enable row level security;

create policy "players: public reads active"
  on public.players for select using (is_active);
create policy "players: editors write"
  on public.players for all
  using (public.can_edit_content()) with check (public.can_edit_content());

create table public.football_player_stats (
  player_id uuid primary key references public.players (id) on delete cascade,
  season text not null default 'all',
  matches int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  yellow_cards int not null default 0,
  red_cards int not null default 0
);
alter table public.football_player_stats enable row level security;

create policy "football stats: public read"
  on public.football_player_stats for select using (true);
create policy "football stats: editors write"
  on public.football_player_stats for all
  using (public.can_edit_content()) with check (public.can_edit_content());

create table public.cricket_player_stats (
  player_id uuid primary key references public.players (id) on delete cascade,
  season text not null default 'all',
  matches int not null default 0,
  runs int not null default 0,
  wickets int not null default 0,
  catches int not null default 0,
  fifties int not null default 0,
  hundreds int not null default 0
);
alter table public.cricket_player_stats enable row level security;

create policy "cricket stats: public read"
  on public.cricket_player_stats for select using (true);
create policy "cricket stats: editors write"
  on public.cricket_player_stats for all
  using (public.can_edit_content()) with check (public.can_edit_content());

-- ---------------------------------------------------------------------
-- Tournaments, matches, per-match player performances
-- ---------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport public.sport_type not null,
  season text,
  status text not null default 'upcoming', -- upcoming | ongoing | completed
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.tournaments enable row level security;

create policy "tournaments: public reads published"
  on public.tournaments for select using (is_published);
create policy "tournaments: editors write"
  on public.tournaments for all
  using (public.can_edit_content()) with check (public.can_edit_content());

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  sport public.sport_type not null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  opponent text not null,
  match_date timestamptz,
  venue text,
  our_score text,
  opponent_score text,
  result text,
  status text not null default 'upcoming', -- upcoming | completed
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.matches enable row level security;

create policy "matches: public reads published"
  on public.matches for select using (is_published);
create policy "matches: editors write"
  on public.matches for all
  using (public.can_edit_content()) with check (public.can_edit_content());

create table public.match_performances (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  goals int not null default 0,
  assists int not null default 0,
  runs int not null default 0,
  wickets int not null default 0,
  catches int not null default 0,
  note text,
  unique (match_id, player_id)
);
alter table public.match_performances enable row level security;

create policy "performances: public read"
  on public.match_performances for select using (true);
create policy "performances: editors write"
  on public.match_performances for all
  using (public.can_edit_content()) with check (public.can_edit_content());

-- ---------------------------------------------------------------------
-- News / activities / notices
-- ---------------------------------------------------------------------
create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'news', -- news | activity | notice
  title text not null,
  slug text not null unique,
  content text,
  cover_image_url text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.news_posts enable row level security;

create policy "news: public reads published"
  on public.news_posts for select using (is_published);
create policy "news: editors write"
  on public.news_posts for all
  using (public.can_edit_content()) with check (public.can_edit_content());

-- ---------------------------------------------------------------------
-- Gallery
-- ---------------------------------------------------------------------
create table public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_image_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.gallery_albums enable row level security;

create policy "albums: public reads published"
  on public.gallery_albums for select using (is_published);
create policy "albums: editors write"
  on public.gallery_albums for all
  using (public.can_edit_content()) with check (public.can_edit_content());

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references public.gallery_albums (id) on delete cascade,
  type text not null default 'photo', -- photo | video
  file_url text,
  youtube_url text,
  caption text,
  display_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.gallery_items enable row level security;

create policy "gallery items: public reads published"
  on public.gallery_items for select using (is_published);
create policy "gallery items: editors write"
  on public.gallery_items for all
  using (public.can_edit_content()) with check (public.can_edit_content());

-- ---------------------------------------------------------------------
-- Members & committee
-- ---------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  phone text, -- shown publicly ONLY if is_phone_public is true
  is_phone_public boolean not null default false,
  address text,
  joined_date date,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;

create policy "members: public reads active"
  on public.members for select using (is_active);
create policy "members: admin writes"
  on public.members for all
  using (public.is_admin()) with check (public.is_admin());

create table public.committee_terms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.committee_terms enable row level security;

create policy "committee terms: public read"
  on public.committee_terms for select using (true);
create policy "committee terms: admin writes"
  on public.committee_terms for all
  using (public.is_admin()) with check (public.is_admin());

create table public.committee_members (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.committee_terms (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  name text not null,
  role_title text not null,
  photo_url text,
  display_order int not null default 0
);
alter table public.committee_members enable row level security;

create policy "committee members: public read"
  on public.committee_members for select using (true);
create policy "committee members: admin writes"
  on public.committee_members for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Finance — the double-counting rule is enforced by DESIGN:
--   * 'withdrawal' = cash moved out of the fund to a person's hand.
--     It is NOT an expense and never reduces the balance by itself.
--   * 'transfer'   = money moved between the fund's own accounts.
--     Net effect on the total balance is ZERO.
--   * Only real spending is type 'expense'.
--   Balance = (income + subscription + donation) - expense
-- The view below is the single source of truth for balances/reports.
-- ---------------------------------------------------------------------
create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  type public.finance_txn_type not null,
  category text,
  amount numeric(12, 2) not null check (amount >= 0),
  txn_date date not null default current_date,
  member_id uuid references public.members (id) on delete set null,
  donor_name text,
  description text,
  receipt_url text, -- file lives in the PRIVATE 'receipts' bucket
  is_public boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.finance_transactions enable row level security;

create policy "finance: public reads public summary rows only"
  on public.finance_transactions for select using (is_public);
create policy "finance: finance roles read all"
  on public.finance_transactions for select
  using (public.can_manage_finance());
create policy "finance: finance roles write"
  on public.finance_transactions for all
  using (public.can_manage_finance())
  with check (public.can_manage_finance());

create or replace view public.finance_summary as
select
  coalesce(sum(amount) filter (
    where type in ('income', 'subscription', 'donation')), 0) as total_income,
  coalesce(sum(amount) filter (
    where type = 'expense'), 0) as total_expense,
  coalesce(sum(amount) filter (
    where type = 'withdrawal'), 0) as total_withdrawn,
  coalesce(sum(amount) filter (
    where type = 'transfer'), 0) as total_transferred,
  coalesce(sum(amount) filter (
    where type in ('income', 'subscription', 'donation')), 0)
    - coalesce(sum(amount) filter (
    where type = 'expense'), 0) as current_balance
from public.finance_transactions;

-- Audit log for important finance changes (insert via trigger below).
create table public.finance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid,
  action text not null, -- INSERT | UPDATE | DELETE
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.finance_audit_logs enable row level security;

create policy "finance audit: finance roles read"
  on public.finance_audit_logs for select
  using (public.can_manage_finance());
-- No insert/update/delete policy on purpose: only the trigger
-- (security definer) writes here; nobody can forge or edit the log.

create or replace function public.log_finance_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.finance_audit_logs (transaction_id, action, new_data, changed_by)
    values (new.id, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.finance_audit_logs (transaction_id, action, old_data, new_data, changed_by)
    values (new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else
    insert into public.finance_audit_logs (transaction_id, action, old_data, changed_by)
    values (old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
end;
$$;

create trigger trg_finance_audit
  after insert or update or delete on public.finance_transactions
  for each row execute function public.log_finance_change();

-- ---------------------------------------------------------------------
-- Contact messages (public can send; only admins can read)
-- ---------------------------------------------------------------------
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

create policy "contact: anyone can send"
  on public.contact_messages for insert with check (true);
create policy "contact: admin reads and manages"
  on public.contact_messages for select
  using (public.is_admin());
create policy "contact: admin updates"
  on public.contact_messages for update
  using (public.is_admin()) with check (public.is_admin());
create policy "contact: admin deletes"
  on public.contact_messages for delete
  using (public.is_admin());
