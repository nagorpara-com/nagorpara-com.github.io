-- 0026_welcome_settings_and_delivery_log.sql
-- Prompt 1 · Step 1 (owner, 2026-10-27): KEEP the existing
-- subscriber / notice system exactly as it is; add only what is
-- new.
--
--   1. welcome_email_settings — a SINGLE-row, admin-only table
--      holding the welcome email's headline + body + on/off
--      switch. Until now the welcome text was fixed in the
--      verify-subscription function's code; from this migration
--      the function reads it from here, and sends NOTHING while
--      is_active is false. The seed row carries today's exact
--      fixed texts, with is_active = false (the owner's default):
--      after the function is redeployed, welcome mail stays off
--      until the owner turns it on.
--
--   2. notice_deliveries becomes the one email log (no separate
--      email_logs table): it gains `kind` ('notification' |
--      'welcome') and a UNIQUE `idempotency_key`, and post_id
--      becomes nullable so a WELCOME send (which belongs to no
--      notice) can be logged in the same table. attempts and the
--      failure reason (`error`) already exist since 0015.
--      Existing rows are backfilled: kind 'notification' and
--      key 'notice:<post_id>:<recipient_email>' — the same
--      identity the 0015 unique triple already enforces.
--
--   3. Two indexes from the owner's step-1 list that do not
--      exist yet (subscribers.email is already covered by its
--      UNIQUE constraint in 0014): notice_deliveries(status)
--      and news_posts(published_at).
--
-- Nothing existing is renamed, dropped or re-purposed: profiles
-- roles, admin routes, news_posts and email_subscribers are
-- untouched.

-- ----------------------------------------------------------------
-- 1. welcome_email_settings (singleton, admin-only)
-- ----------------------------------------------------------------

create table public.welcome_email_settings (
  id smallint primary key default 1,
  headline text not null,
  body text not null,
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  -- Exactly one row can ever exist: the id is pinned to 1.
  constraint welcome_email_settings_singleton check (id = 1),
  constraint welcome_email_settings_headline_len
    check (char_length(headline) between 1 and 200),
  constraint welcome_email_settings_body_len
    check (char_length(body) between 1 and 5000)
);

alter table public.welcome_email_settings enable row level security;

-- Admin only, every operation. No policy for anyone else means
-- no access for anyone else (RLS default-deny).
create policy welcome_email_settings_admin_select
  on public.welcome_email_settings for select
  to authenticated
  using (public.is_admin());
create policy welcome_email_settings_admin_insert
  on public.welcome_email_settings for insert
  to authenticated
  with check (public.is_admin());
create policy welcome_email_settings_admin_update
  on public.welcome_email_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy welcome_email_settings_admin_delete
  on public.welcome_email_settings for delete
  to authenticated
  using (public.is_admin());

-- Least-privilege grants (house rule from 0010/0024): anon gets
-- nothing at all; authenticated reaches the table only through
-- the admin policies above; service_role may READ (the
-- verify-subscription function loads the settings server-side)
-- but never write.
revoke all on table public.welcome_email_settings from anon;
revoke all on table public.welcome_email_settings from authenticated;
grant select, insert, update, delete
  on table public.welcome_email_settings to authenticated;
grant select on table public.welcome_email_settings to service_role;

-- The single row, seeded with the welcome texts exactly as the
-- code sends them today. is_active = false (the owner's
-- specified default): the switch is the owner's to turn on.
insert into public.welcome_email_settings (id, headline, body, is_active)
values (
  1,
  'স্বাগতম! আপনার সাবস্ক্রিপশন নিশ্চিত হয়েছে — নগর পাড়া অগ্রগামী যুব সংঘ',
  'আসসালামু আলাইকুম,

আপনার ইমেইল সফলভাবে যাচাই হয়েছে — নগর পাড়া অগ্রগামী যুব সংঘ-এর নোটিশ ও ঘোষণার সাবস্ক্রিপশন এখন সক্রিয়। এখন থেকে সংগঠনের নতুন নোটিশ প্রকাশিত হলেই আপনি এই ইমেইলে তা পেয়ে যাবেন।',
  false
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 2. notice_deliveries — kind + idempotency_key + welcome rows
-- ----------------------------------------------------------------

alter table public.notice_deliveries
  add column kind text not null default 'notification';

alter table public.notice_deliveries
  add constraint notice_deliveries_kind_check
  check (kind in ('welcome', 'notification'));

alter table public.notice_deliveries
  add column idempotency_key text;

-- One logical send = one log row, across BOTH kinds. NULL keys
-- (any row written by older code) stay exempt until backfilled
-- below / written by the current functions.
create unique index notice_deliveries_idempotency_uidx
  on public.notice_deliveries (idempotency_key)
  where idempotency_key is not null;

-- A welcome send belongs to no notice: post_id may be null, but
-- ONLY for welcome rows (shape enforced by the CHECK below).
alter table public.notice_deliveries
  alter column post_id drop not null;

alter table public.notice_deliveries
  add constraint notice_deliveries_kind_post_shape
  check (
    (kind = 'notification' and post_id is not null)
    or (kind = 'welcome' and post_id is null)
  );

-- Backfill the key for every existing (notification) row.
update public.notice_deliveries
set idempotency_key = 'notice:' || post_id::text || ':' || recipient_email
where idempotency_key is null and post_id is not null;

-- ----------------------------------------------------------------
-- 3. Missing indexes from the owner's step-1 list
-- ----------------------------------------------------------------

create index notice_deliveries_status_idx
  on public.notice_deliveries (status);

create index news_posts_published_at_idx
  on public.news_posts (published_at);
