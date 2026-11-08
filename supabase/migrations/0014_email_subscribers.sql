-- ============================================================================
-- Migration 0014 (DRAFT — NOT APPLIED)
-- Email subscribers for the Notice & Notification system (Phase C / C2).
--
-- PURPOSE
--   One table holding everyone who asked to receive announcement
--   email from the public website, with double opt-in verification:
--   a subscription counts only after the mailbox owner clicks the
--   verification link (status 'verified'). The Admin Panel (built
--   in the C2 implementation step) lists these rows; the public
--   NEVER sees this table (see the security model below).
--
-- SECURITY MODEL — read before applying
--   * RLS is enabled in this same file, and there is deliberately
--     NO policy and NO grant for `anon` at all: an anonymous
--     visitor can neither read a single row, nor create one, nor
--     change a verification status. This differs from
--     `contact_messages` ON PURPOSE: subscribing is not just an
--     insert — a token must be generated, hashed, throttled and
--     emailed, which only the server-side subscribe function can
--     do. All writes therefore happen through Edge Functions
--     using the service role (which bypasses RLS); the functions
--     are the gate, and their own validation/throttling is the
--     enforcement. See the flow notes at the bottom of this file.
--   * `authenticated` receives SELECT + UPDATE grants, and both
--     policies require is_admin() — in practice only the Admin
--     can list subscribers or change a status from the panel
--     (e.g. unsubscribe someone on request). There is NO insert
--     or delete policy for any API role: rows are created only
--     by the subscribe function, and they are never hard-deleted
--     (an unsubscribe is a status, keeping the consent record).
--
-- VERIFICATION TOKEN DESIGN
--   * The raw token is a random 32-byte value, generated in the
--     Edge Function, sent ONLY inside the verification email link.
--   * The database stores just its SHA-256 hash (hex), so even a
--     full read of this table yields no usable link.
--   * Expiry: 48 hours from issue (verification_expires_at). The
--     function sets a fresh hash + expiry on every (re)send.
--   * Single use: a successful verification clears the expiry in
--     the same UPDATE that sets status/verified_at. The hash is
--     RETAINED (inert) so a repeat click on the link can be
--     answered 'already verified'; reuse is impossible because
--     both the verify flow and its guarded update require
--     status = 'pending' before a token can do anything.
--   * Resend throttling is supported by verification_sent_count
--     and last_verification_sent_at (function-enforced: minimum
--     60 seconds between sends, at most 5 sends per address
--     before the owner must intervene).
--
-- UNSUBSCRIBE DESIGN (no column needed)
--   Announcement emails carry an unsubscribe link of the form
--   /#/unsubscribe?t=<subscriber id>.<HMAC> where the HMAC is
--   computed in the Edge Function over the subscriber id with a
--   server-only signing secret (UNSUBSCRIBE_SIGNING_SECRET, set
--   alongside the C4 secrets at implementation time). Nothing is
--   stored for it, links stay valid while the subscription does,
--   and the function verifies the signature before changing any
--   status. Trade-off, accepted deliberately: rotating that
--   secret invalidates old links.
--
-- CONSENT
--   consent_at records when the person subscribed (refreshed if
--   they re-subscribe after unsubscribing); verified_at proves
--   mailbox control; unsubscribed_at records the opt-out. Only
--   status='verified' rows may receive announcement email —
--   that rule is enforced by the C3 delivery code, this table
--   just carries the facts.
--
-- DEPENDENCIES / ORDER
--   Run ONCE, only with the owner's explicit permission, after
--   0001–0012. Independent of draft 0013 (contact subject) — the
--   two touch nothing in common, in either order.
--
-- ROLLBACK
--   Before C3 exists: `drop table public.email_subscribers;`
--   removes everything this file creates (policies, grants and
--   indexes go with the table). After C3's notice_deliveries
--   references this table, drop that table first. Dropping is a
--   data-losing operation (the subscriber list) — export first.
-- ============================================================================

create table public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  -- Stored normalized (lowercase, trimmed) by the subscribe
  -- function; the CHECK below refuses anything else.
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'unsubscribed')),
  -- SHA-256 hash (hex) of the current verification token; the raw
  -- token exists only in the emailed link. Retained (inert) after
  -- a successful verification so repeat clicks can be answered
  -- 'already verified'; cleared on unsubscribe; overwritten
  -- whenever a fresh token is issued.
  verification_token_hash text,
  verification_expires_at timestamptz,
  verification_sent_count int not null default 0,
  last_verification_sent_at timestamptz,
  consent_at timestamptz not null default now(),
  verified_at timestamptz,
  unsubscribed_at timestamptz,
  source text not null default 'website'
    check (source in ('website', 'admin')),
  created_at timestamptz not null default now(),

  constraint email_subscribers_email_unique unique (email),
  constraint email_subscribers_email_lower
    check (email = lower(email)),
  constraint email_subscribers_email_shape
    check (position('@' in email) > 1 and char_length(email) <= 254),
  -- State consistency: a row may only claim a state whose
  -- evidence timestamp is set (both are written in one UPDATE).
  constraint email_subscribers_verified_has_time
    check (status <> 'verified' or verified_at is not null),
  constraint email_subscribers_unsub_has_time
    check (status <> 'unsubscribed' or unsubscribed_at is not null)
);

-- Admin list filtering by status; token lookups by hash (partial —
-- only live tokens are ever looked up).
create index email_subscribers_status_idx
  on public.email_subscribers (status);
create index email_subscribers_token_idx
  on public.email_subscribers (verification_token_hash)
  where verification_token_hash is not null;

alter table public.email_subscribers enable row level security;

-- Admin reads the list (subscriber management in the panel).
create policy "subscribers: admin reads"
  on public.email_subscribers for select
  using (public.is_admin());

-- Admin may change a status (e.g. unsubscribe on request, fix a
-- record). Creation is NOT possible through the API by design.
create policy "subscribers: admin updates"
  on public.email_subscribers for update
  using (public.is_admin()) with check (public.is_admin());

-- Deliberately NO insert/delete policies for anon or
-- authenticated, and NO grant of any kind to anon (see header).

-- ----------------------------------------------------------------------------
-- GRANTs (project rule: every migration that creates a table ends
-- with its own explicit grant section; no default privileges were
-- ever set for this project — see 0010).
-- ----------------------------------------------------------------------------
revoke all on table public.email_subscribers from anon;
revoke all on table public.email_subscribers from authenticated;
grant select, update on table public.email_subscribers to authenticated;

-- ============================================================================
-- FLOWS THIS SCHEMA SUPPORTS (implemented in the C2 step, not here)
--   Subscribe (public form -> subscribe Edge Function):
--     normalize email; then exactly one of —
--       no row            -> insert 'pending' + token hash/expiry,
--                            send verification mail (C4 library);
--       row 'pending'     -> resend only if throttles allow, with a
--                            FRESH token (old links die at once);
--       row 'verified'    -> send nothing;
--       row 'unsubscribed'-> fresh consent: back to 'pending',
--                            consent_at = now, unsubscribed_at null,
--                            new token + verification mail.
--     The public response is IDENTICAL in every case ("check your
--     email") so the form can never be used to discover whether an
--     address is subscribed (no enumeration).
--   Verify (link -> verify Edge Function): hash the presented
--     token, find the row by hash, require status 'pending' and
--     now < verification_expires_at; then one GUARDED update sets
--     status='verified', verified_at=now, expiry null (the status
--     guard makes the retained hash unusable for a second
--     verification).
--   Unsubscribe (link -> unsubscribe Edge Function): verify the
--     HMAC, then set status='unsubscribed', unsubscribed_at=now,
--     token fields null. Idempotent: repeating it changes nothing.
-- ============================================================================
