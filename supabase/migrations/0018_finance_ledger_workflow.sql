-- APPLIED LIVE 2026-11-04 (owner order; backup gate waived by owner).
-- 0018_finance_ledger_workflow.sql
-- Transaction boundary (Fix 5): the whole file runs inside one
-- transaction. PostgreSQL DDL is transactional and this file uses
-- no non-transactional statement (no CREATE INDEX CONCURRENTLY,
-- no ALTER TYPE ... ADD VALUE), so a failure anywhere rolls back
-- everything. Supabase Dashboard SQL Editor and psql both honour
-- explicit BEGIN/COMMIT; the Supabase CLI also wraps migrations in
-- a transaction by default — the explicit markers are compatible
-- with all three runners and must be verified once in F1's
-- scratch-DB step.

begin;

-- 3.1 Status: existing rows become 'approved' automatically (default),
--     which preserves today's behaviour exactly (every record counts).
create type public.finance_txn_status as enum
  ('draft', 'pending', 'approved', 'rejected', 'cancelled');

alter table public.finance_transactions
  add column status public.finance_txn_status not null default 'approved',
  add column reference_no text,
  add column approved_by uuid references public.profiles (id) on delete set null,
  add column approved_at timestamptz,
  add column status_reason text,
  add column reversal_of uuid references public.finance_transactions (id)
    on delete restrict,
  add column corrects_id uuid references public.finance_transactions (id)
    on delete restrict,
  add column updated_at timestamptz not null default now();

-- Reference numbers are optional, but never duplicated when present.
create unique index finance_txn_reference_no_key
  on public.finance_transactions (reference_no)
  where reference_no is not null;

-- A mistaken reversal can be corrected at most once (S9 process, 3.6).
create unique index finance_txn_corrects_key
  on public.finance_transactions (corrects_id)
  where corrects_id is not null;

-- Read patterns used by admin list, reports and the dues views later.
create index finance_txn_date_idx     on public.finance_transactions (txn_date);
create index finance_txn_type_idx     on public.finance_transactions (type);
create index finance_txn_status_idx   on public.finance_transactions (status);
create index finance_txn_member_idx   on public.finance_transactions (member_id);

-- 3.2 updated_at maintenance (audit trigger stays untouched, AFTER).
create or replace function public.finance_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_finance_touch
  before update on public.finance_transactions
  for each row execute function public.finance_touch_updated_at();

-- 3.3 Workflow guard (BEFORE UPDATE): legal transitions only, approved
--     records immutable in money fields, approval stamps itself.
create or replace function public.finance_guard_transition()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'    and new.status in ('pending', 'cancelled')) or
      (old.status = 'pending'  and new.status in ('approved', 'rejected', 'cancelled')) or
      (old.status = 'approved' and new.status = 'cancelled')
    ) then
      raise exception 'Illegal finance status transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'approved' then
      new.approved_at = now();
      new.approved_by = auth.uid();
    end if;
    -- Fix 3 (b): an approved record with a live reversal cannot be
    -- cancelled (see 3.3b / 3.6 for the negative-total scenario).
    if old.status = 'approved' and new.status = 'cancelled' then
      if exists (select 1 from public.finance_transactions
                 where reversal_of = old.id
                   and status in ('pending', 'approved')) then
        raise exception 'Record has a live reversal; resolve the reversal first.';
      end if;
      -- S9 (owner decision, 2026-10-24): an approved REVERSAL can
      -- never be cancelled directly. A wrong reversal is fixed only
      -- through the correction-entry process in 3.6.
      if old.reversal_of is not null then
        raise exception 'Approved reversals cannot be cancelled; use a correction entry.';
      end if;
    end if;
  end if;
  if old.status = 'approved' and new.status = 'approved' then
    if new.amount is distinct from old.amount
       or new.type is distinct from old.type
       or new.txn_date is distinct from old.txn_date
       or new.member_id is distinct from old.member_id then
      raise exception 'Approved finance records are immutable; use a reversal entry.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_finance_guard
  before update on public.finance_transactions
  for each row execute function public.finance_guard_transition();

-- 3.3b Reversal integrity (Fix 3 — added after the Pre-F1 Review):
--   (a) a reversal may only target an APPROVED record that is not
--       itself a reversal (no reversal-of-reversal, no chains);
--   (b) an approved record with a live (pending/approved) reversal
--       cannot be cancelled — otherwise the view would subtract the
--       reversal while the original no longer counts, driving the
--       type total negative (see the scenario table in section 3.6).
create or replace function public.finance_guard_reversal()
returns trigger language plpgsql as $$
declare target public.finance_transactions%rowtype;
begin
  if new.reversal_of is not null then
    select * into target from public.finance_transactions
      where id = new.reversal_of;
    if target.id is null
       or target.status <> 'approved'
       or target.reversal_of is not null then
      raise exception 'A reversal must target an approved, non-reversal record.';
    end if;
  end if;
  -- S9 correction entries: corrects_id may only point to an APPROVED
  -- REVERSAL (a record that itself has reversal_of set). The partial
  -- unique index finance_txn_corrects_key additionally guarantees a
  -- reversal is corrected at most once.
  if new.corrects_id is not null then
    select * into target from public.finance_transactions
      where id = new.corrects_id;
    if target.id is null
       or target.status <> 'approved'
       or target.reversal_of is null then
      raise exception 'A correction entry must target an approved reversal.';
    end if;
    if new.reversal_of is not null then
      raise exception 'A correction entry is a normal record, not a reversal.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_finance_reversal_guard
  before insert on public.finance_transactions
  for each row execute function public.finance_guard_reversal();

-- (Rule (b) lives inside finance_guard_transition in 3.3, as part of
-- the status-change branch — see the final block of that function.)

-- 3.4 Split the single FOR ALL write policy into per-command policies.
--     SELECT policies are NOT touched. Delete becomes draft-only.
drop policy "finance: finance roles write" on public.finance_transactions;

create policy "finance: finance roles insert"
  on public.finance_transactions for insert
  with check (public.can_manage_finance());

create policy "finance: finance roles update"
  on public.finance_transactions for update
  using (public.can_manage_finance())
  with check (public.can_manage_finance());

create policy "finance: finance roles delete drafts only"
  on public.finance_transactions for delete
  using (public.can_manage_finance() and status = 'draft');

-- 3.5 Grants: no change needed (0010 table grants cover new columns);
--     re-asserted here for the migration record.
grant select, insert, update, delete on public.finance_transactions
  to authenticated;
-- (anon keeps SELECT-only from 0010; RLS still gates every row.)

commit;
