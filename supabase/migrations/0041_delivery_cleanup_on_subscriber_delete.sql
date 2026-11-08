-- =====================================================================
-- Migration 0041 — subscriber delete removes the person EVERYWHERE:
-- service_role DELETE grant on notice_deliveries + one-time cleanup
-- of delivery rows whose recipient is no longer a subscriber.
-- STATUS: APPLIED LIVE on 2026-11-02 (~09:44 +06), at the owner's
-- explicit approval, via the Supabase Dashboard SQL Editor;
-- Dashboard answered "Success. No rows returned" and post-checks
-- verified: service_role now holds DELETE on notice_deliveries,
-- and the cleanup removed every subscriber-kind delivery row
-- whose address is no longer subscribed (12 recipient groups
-- before only the then-current subscribers' groups after).
-- Must be live BEFORE the updated admin-subscribers function is
-- redeployed (the updated delete path needs this grant; without
-- it the delete fails loudly and removes nothing).
--
-- WHY THIS EXISTS (owner's rule, 2026-11-02):
--   The owner deleted a subscriber from Admin ইমেইল গ্রাহক and
--   the address still appeared in a notice's "নোটিশ ইমেইল"
--   recipient list. His rule: an email deleted from the
--   Subscribers section must remain in NO section. Delivery
--   records (announcement sends AND welcome sends) all live in
--   public.notice_deliveries, keyed by recipient_email as a
--   send-time snapshot — there is deliberately no foreign key to
--   email_subscribers (0015), so nothing cascades on its own.
--   The panel delete therefore has to remove the delivery rows
--   itself (admin-subscribers function, updated with this
--   migration), and that needs a DELETE grant: migration 0024
--   granted service_role only select/insert/update on
--   notice_deliveries — the same grant gap as 0040, one table
--   over.
--
-- What it does (and nothing else):
--   1. grant delete on public.notice_deliveries to service_role.
--   2. ONE-TIME cleanup: delete delivery rows whose recipient
--      (recipient_kind = 'subscriber') is not present in
--      email_subscribers — i.e. the residue of subscribers who
--      were already deleted before this rule existed (the owner
--      saw exactly such a row on 2026-11-02). Rows for current
--      subscribers are untouched; notices themselves are
--      untouched.
--
-- What it does NOT do:
--   * No table, column, policy or RLS change.
--   * No change to email_subscribers rows.
--   * 'member'-kind delivery rows (reserved; none exist) are
--     left alone.
-- =====================================================================

grant delete on public.notice_deliveries to service_role;

delete from public.notice_deliveries d
where d.recipient_kind = 'subscriber'
  and not exists (
    select 1 from public.email_subscribers s
    where s.email = d.recipient_email
  );
