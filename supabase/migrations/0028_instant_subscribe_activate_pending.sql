-- Migration 0028 — Instant subscribe: activate legacy pending
-- subscribers (owner's model change, 2026-10-27 evening).
--
-- The owner replaced double opt-in with instant activation:
-- subscribing on the website now makes a subscriber VERIFIED
-- immediately (the subscribe function inserts/flips the row and
-- sends the welcome email in the same call — see
-- _shared/subscribers.ts subscribeInstantFlow). There is no
-- pending state for new signups any more.
--
-- This migration is the one-time data companion: every row still
-- sitting at status='pending' (villagers who subscribed but
-- could never open the verification link, because the links
-- pointed at the owner's local site) becomes 'verified' with
-- verified_at set, so they receive notice emails like everyone
-- else. Their verification-token fields are cleared (the links
-- in their inboxes become harmless no-ops).
--
-- Nothing else changes: no column, policy, grant or other row
-- is touched. 'unsubscribed' rows are NOT resurrected — leaving
-- was their choice; if they subscribe again the function flips
-- them back to verified at that moment.
--
-- Idempotent: re-running matches zero rows.

update public.email_subscribers
set status = 'verified',
    verified_at = coalesce(verified_at, now()),
    verification_token_hash = null,
    verification_expires_at = null
where status = 'pending';
