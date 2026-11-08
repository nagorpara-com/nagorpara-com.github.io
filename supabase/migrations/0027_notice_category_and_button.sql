-- Migration 0027 — Notice category + optional button
-- (Prompt 4 · Step 4, owner, 2026-10-27).
--
-- Adds to news_posts (additive only — no existing column,
-- row or policy is touched):
--   notice_category  the notice's kind: 'info' | 'offer' |
--                    'update'. Existing rows default to 'info'.
--   button_text /    an OPTIONAL call-to-action shown with the
--   button_url       notice (Admin form, website, popup and the
--                    announcement email). Both or neither; the
--                    URL must be http(s) — no javascript:/data:
--                    can ever be stored, let alone rendered.
--
-- Idempotent (IF NOT EXISTS / constraint-existence guards) so
-- a re-run is a no-op. Grants are table-level and already in
-- place; new columns inherit them.

alter table public.news_posts
  add column if not exists notice_category text not null default 'info';
alter table public.news_posts
  add column if not exists button_text text;
alter table public.news_posts
  add column if not exists button_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'news_posts_notice_category_check'
  ) then
    alter table public.news_posts
      add constraint news_posts_notice_category_check
      check (notice_category in ('info', 'offer', 'update'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'news_posts_button_text_check'
  ) then
    alter table public.news_posts
      add constraint news_posts_button_text_check
      check (button_text is null or char_length(button_text) between 1 and 60);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'news_posts_button_url_check'
  ) then
    alter table public.news_posts
      add constraint news_posts_button_url_check
      check (
        button_url is null
        or (char_length(button_url) <= 500 and button_url ~ '^https?://')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'news_posts_button_pair_check'
  ) then
    alter table public.news_posts
      add constraint news_posts_button_pair_check
      check ((button_text is null) = (button_url is null));
  end if;
end $$;
