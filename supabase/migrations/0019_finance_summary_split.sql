-- APPLIED LIVE 2026-11-04 (owner order, right after 0018).
-- 0019_finance_summary_split.sql
-- CREATE OR REPLACE VIEW may only APPEND columns: the first five keep
-- name, type and meaning. security_invoker is re-asserted afterwards.
--
-- Fix 1 (Pre-F1 Review): every single-type scalar subquery is wrapped
-- in COALESCE **outside** the subquery. A scalar subquery that matches
-- no group row returns NULL (not a row of zeros), so the earlier
-- draft's inner coalesce could yield NULL totals — and a NULL
-- balance — whenever a type had no approved rows. The pattern below
-- cannot: no-row NULL outer coalesce 0.

begin;

create or replace view public.finance_summary as
with net as (
  select
    type,
    coalesce(sum(amount) filter (where reversal_of is null), 0)
      - coalesce(sum(amount) filter (where reversal_of is not null), 0) as net_amount
  from public.finance_transactions
  where status = 'approved'
  group by type
)
select
  -- === original five columns: identical names and meanings ===
  (select coalesce(sum(net_amount), 0) from net
     where type in ('income', 'subscription', 'donation')) as total_income,
  coalesce((select net_amount from net where type = 'expense'), 0)    as total_expense,
  coalesce((select net_amount from net where type = 'withdrawal'), 0) as total_withdrawn,
  coalesce((select net_amount from net where type = 'transfer'), 0)   as total_transferred,
  (select coalesce(sum(net_amount), 0) from net
     where type in ('income', 'subscription', 'donation'))
    - coalesce((select net_amount from net where type = 'expense'), 0) as current_balance,
  -- === appended columns ===
  coalesce((select net_amount from net where type = 'income'), 0)       as income_total,
  coalesce((select net_amount from net where type = 'subscription'), 0) as subscription_total,
  coalesce((select net_amount from net where type = 'donation'), 0)     as donation_total,
  (select coalesce(sum(amount), 0) from public.finance_transactions
     where status = 'pending' and type in ('income', 'subscription', 'donation')
       and reversal_of is null) as pending_inflow_total,
  (select coalesce(sum(amount), 0) from public.finance_transactions
     where status = 'pending' and type = 'expense'
       and reversal_of is null) as pending_expense_total;

alter view public.finance_summary set (security_invoker = true);

commit;
