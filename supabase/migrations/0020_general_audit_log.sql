-- =====================================================================
-- Migration 0020 — General Audit Log (Section 03, Scope A)
-- STATUS: APPLIED LIVE 2026-11-01 (owner-approved; Dashboard run "Success. No rows returned"; REST existence verified same day).
-- Prepared 2026-10-25 at the owner's Phase 03-A approval: migration
-- FILE + scratch verification only. Applying this file to the live
-- database needs the owner's separate approval.
--
-- Purpose: one append-only audit trail for the three scopes the
-- owner approved in Section 03 Scope A —
--   * public.profiles      (role / active-status / profile changes)
--   * public.news_posts    (create, edit, publish/unpublish, delete)
--   * public.site_settings (website settings changes)
-- Finance keeps its OWN log (finance_audit_logs, migration 0001);
-- this migration does not touch it or its trigger.
--
-- Design (the finance-audit pattern, generalised):
--   * The trigger function below is the ONLY writer. There are no
--     INSERT/UPDATE/DELETE policies and no write grants for anyone,
--     so audit rows can never be forged, edited or deleted through
--     the API — not even by an admin.
--   * Read: Admin only (is_admin()), read-only.
--   * Field-based changes only: `changes` holds, per tracked field,
--     {"old": ..., "new": ...}. Fields a table marks as sensitive
--     are recorded as {"changed": true} with NO value:
--       - profiles.phone       (personal data)
--       - news_posts.content   (long text; only the fact of a change
--                              is recorded, not the text itself)
--     No password, token, secret or auth credential exists in any
--     tracked table, and auth.users is never touched by a trigger.
--   * Tracked-field lists are deliberately limited: an UPDATE that
--     changes no tracked field writes no log row (no noise), and
--     untracked display-preference columns (e.g. football_layout)
--     are not recorded.
--   * actor_id / entity_id are plain values (no foreign keys) and
--     actor_name / entity_label are snapshots taken at write time,
--     so the history survives later renames, deactivations and even
--     deletion of the audited record itself.
--   * FAILURE BEHAVIOUR (deliberate, fail-closed): the audit insert
--     runs in the SAME transaction as the change it records. If the
--     audit write fails, the whole change rolls back — an audit gap
--     can never happen silently. There is no exception handler that
--     swallows audit errors.
--
-- Additive only: creates one table, two indexes, one function and
-- three triggers. No existing table, column, policy or row changes.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity_type text not null,
  entity_id text not null,
  entity_label text,
  changes jsonb not null default '{}'::jsonb
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;

-- Read: Admin only. No write policies on purpose: only the trigger
-- (security definer) writes here; nobody can forge or edit the log.
create policy "audit logs: admin reads"
  on public.audit_logs for select
  using (public.is_admin());

-- Grants (migration 0010 rule — every migration states its own):
-- authenticated may SELECT (RLS still gates it to admins); anon gets
-- nothing; NOBODY gets insert/update/delete.
revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

-- ---------------------------------------------------------------------
-- 2) Generic audit trigger function
--    Trigger arguments: (entity_type, tracked fields CSV,
--                        redacted fields CSV, label column)
-- ---------------------------------------------------------------------
create or replace function public.log_audit_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_fields text[] := string_to_array(tg_argv[1], ',');
  v_redact text[] := string_to_array(coalesce(tg_argv[2], ''), ',');
  v_label_col text := tg_argv[3];
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_actor uuid := auth.uid();
  v_actor_name text;
begin
  foreach v_field in array v_fields loop
    if tg_op = 'INSERT' then
      if (v_new -> v_field) is not null and (v_new -> v_field) <> 'null'::jsonb then
        if v_field = any (v_redact) then
          v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('changed', true));
        else
          v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('old', null, 'new', v_new -> v_field));
        end if;
      end if;
    elsif tg_op = 'DELETE' then
      if (v_old -> v_field) is not null and (v_old -> v_field) <> 'null'::jsonb then
        if v_field = any (v_redact) then
          v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('changed', true));
        else
          v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('old', v_old -> v_field, 'new', null));
        end if;
      end if;
    else -- UPDATE: only fields whose value actually changed
      if (v_old -> v_field) is distinct from (v_new -> v_field) then
        if v_field = any (v_redact) then
          v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('changed', true));
        else
          v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('old', v_old -> v_field, 'new', v_new -> v_field));
        end if;
      end if;
    end if;
  end loop;

  -- An UPDATE that changed no tracked field leaves no row.
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return new;
  end if;

  if v_actor is not null then
    select full_name into v_actor_name from public.profiles where id = v_actor;
  end if;

  insert into public.audit_logs (actor_id, actor_name, action, entity_type, entity_id, entity_label, changes)
  values (
    v_actor,
    v_actor_name,
    lower(tg_op),
    tg_argv[0],
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    coalesce(v_new ->> v_label_col, v_old ->> v_label_col),
    v_changes
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Triggers — Scope A only (profiles, news_posts, site_settings)
-- ---------------------------------------------------------------------
create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit_change(
    'profiles',
    'full_name,phone,avatar_url,role,is_active',
    'phone',
    'full_name'
  );

create trigger trg_audit_news_posts
  after insert or update or delete on public.news_posts
  for each row execute function public.log_audit_change(
    'news_posts',
    'type,title,slug,content,cover_image_url,is_published,published_at',
    'content',
    'title'
  );

create trigger trg_audit_site_settings
  after insert or update or delete on public.site_settings
  for each row execute function public.log_audit_change(
    'site_settings',
    'org_name_bn,org_name_en,tagline,logo_url,established_year,address,phone,email,facebook_url,youtube_url,football_team_name,football_current_season,cricket_team_name,cricket_current_season',
    '',
    'org_name_bn'
  );

commit;
