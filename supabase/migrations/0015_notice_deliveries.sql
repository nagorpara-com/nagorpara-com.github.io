-- ============================================================================
-- Migration 0015 (DRAFT — NOT APPLIED)
-- Notice delivery log for the Notice & Notification system
-- (Phase C / C3 Step 3 — draft + safety audit only; applying needs
-- the owner's separate permission, as with 0013 and 0014).
--
-- GOVERNING RULE (owner, 2026-10-24 — Admin-Controlled C3, see
-- docs/ADMIN_FIRST_ARCHITECTURE.md §6): all notice management and
-- sending happens from the Admin Panel under the existing roles;
-- this table is read ONLY by the Admin and written ONLY by the
-- server-side send function. Nothing here is public.
--
-- FINAL SECURITY REVIEW (2026-10-24) changed three things from
-- the first draft, each for a stated reason: (1) the Admin
-- UPDATE policy was REMOVED — no panel feature edits delivery
-- rows, and an update path would only let history be falsified;
-- (2) a 'sending' claim status was ADDED — the UNIQUE constraint
-- alone cannot stop two concurrent runs emailing one address;
-- (3) status/error/message-id/attempts consistency CHECKs were
-- COMPLETED (sent ⇒ error null, failed ⇒ error present, message
-- id only when sent, outcome ⇒ attempts ≥ 1).
--
-- FINAL PRE-APPLY AUDIT (2026-10-24) then corrected the claim
-- PROTOCOL text only — the schema is unchanged by it: outcome
-- updates are guarded by the claimed attempts value; claims are
-- one row at a time; and a stale 'sending' row is closed as
-- outcome-unknown 'failed' for a human retry decision instead of
-- being auto-resent (an email accepted by Gmail whose outcome
-- write was lost would otherwise be silently duplicated —
-- exactly-once is impossible across SMTP + database, so the
-- design chooses at-least-once ONLY by explicit human retry).
--
-- PURPOSE
--   One row per (notice, recipient) recording whether the
--   announcement email for a published notice was delivered:
--   which address it went to, how many send attempts were made,
--   and — on success — when, and the provider's message id. The
--   C3 Step 4 send function (not built yet) is the only writer;
--   the Admin Panel reads this log so the owner can see, per
--   notice, who got the email and what failed.
--
-- WHY A SNAPSHOT, NO FOREIGN KEY TO email_subscribers
--   `recipient_email` copies the address at send time on purpose.
--   A delivery log is history: if a subscriber later unsubscribes
--   or their row changes, the record of what was sent must not
--   change with it. `recipient_kind` says where the address came
--   from ('subscriber' today; 'member' is reserved for a possible
--   future member-notification step, which first needs a members
--   email column — it does not exist yet). There is deliberately
--   NO foreign key to email_subscribers, and no flow in this
--   project hard-deletes subscriber rows anyway.
--
-- SECURITY MODEL — read before applying
--   Mirrors email_subscribers (0014) in spirit — the data
--   sensitivity is the same (a list of email addresses) — with
--   ONE deliberate difference, from the Final Security Review:
--   * RLS is enabled in this same file, with NO policy and NO
--     grant for `anon` at all — the public can never read who
--     received an email.
--   * `authenticated` receives a SELECT grant ONLY, and the one
--     policy requires is_admin() — the Admin can READ the
--     delivery report, and nothing more. There is deliberately
--     NO update policy: a delivery row is an audit record, and
--     every change to it (claims, outcomes, retries) is made by
--     the server-side send function using the service role
--     (which bypasses RLS) after its own authorization check.
--     0014 keeps an admin update policy because subscriber rows
--     ARE managed directly in the panel (unsubscribe on request,
--     fix a record); delivery rows are never edited in the
--     panel — the panel's only actions are viewing the report
--     and asking the function to retry — so an update path here
--     would only be a way to falsify history (status, attempts,
--     sent_at, provider_message_id) with no feature needing it.
--     Genuine corrections remain possible for the owner through
--     the SQL Editor, outside the app's API surface.
--   * There is NO insert or delete policy for any API role
--     either: rows are created only by the send function. Rows
--     leave this table only via the post foreign key's CASCADE.
--
-- DUPLICATE PREVENTION — THE CLAIM CONTRACT
--   UNIQUE (post_id, recipient_kind, recipient_email) makes one
--   row per recipient per notice, forever — but on its own it
--   only stops duplicate ROWS, not duplicate SENDS: two send
--   runs racing could both read the same 'pending' row and both
--   email it before either records the outcome. The send
--   function therefore works by ATOMIC CLAIM (Final Security
--   Review):
--     * First, rows are inserted 'pending'
--       (ON CONFLICT DO NOTHING).
--     * To send, a run must CLAIM a row with one atomic update:
--         update notice_deliveries
--            set status = 'sending', attempts = attempts + 1,
--                last_attempt_at = now(), error = null
--          where id = $1 and status in ('pending', 'failed')
--       Exactly one racing run can win a given row — the other's
--       update matches nothing once the status has flipped — so
--       the same address can never be emailed twice for one
--       notice, even under concurrent sends.
--     * The claimer then sends and records the outcome in one
--       GUARDED update — where id = $1 and status = 'sending'
--       and attempts = <the attempts value its claim returned>.
--       The guard matters: if a claim went stale and another
--       run took the row over, the first run's late outcome
--       matches nothing and can neither overwrite the new state
--       nor resurrect the row. Outcome writes are retried a few
--       times inside the function before giving up.
--     * Rows are claimed ONE AT A TIME (claim -> send -> record),
--       never in bulk, so a claim's live window is a single SMTP
--       send (the C4 mailer times out at 25s), far inside the
--       staleness threshold.
--     * A row left in 'sending' past the staleness threshold
--       (the function uses 15 minutes) is NOT auto-resent: the
--       previous run may have delivered the email and died
--       before recording it (see the at-least-once note in the
--       Final Pre-Apply Audit). The function closes it as
--       'failed' with the reason recorded as an interrupted,
--       outcome-unknown attempt, and a HUMAN decides on the
--       retry from the admin report — accepting the small
--       chance the recipient then gets the notice twice.
--     * A 'sent' row is never claimed again — its status is not
--       in the claimable set — so a successful delivery is never
--       repeated by construction.
--
-- STATUS VALUES — AND WHY THERE IS NO 'bounced'
--   status is 'pending' | 'sending' | 'sent' | 'failed'.
--   'sending' is the transient claim state of the contract
--   above; the admin report shows it as "in progress" next to
--   the three outcome states. The provider is Gmail SMTP
--   (Phase C4): it confirms acceptance of the message or gives
--   an SMTP error, but offers no bounce/webhook callback to
--   this system, so a 'bounced' state could never be set
--   truthfully. 'sent' therefore means "Gmail accepted it", not
--   "it reached the inbox" — the admin UI must word it that way.
--   provider_message_id stores the message id Gmail returns, for
--   support lookups. Operational note (not a schema concern):
--   consumer Gmail sending is capped (~500/day), so a very large
--   subscriber list needs the send function to pace itself —
--   that belongs to Step 4's design, not this table.
--
-- STATE CONSISTENCY (same style as 0014, completed by the
-- Final Security Review)
--   A row may only claim 'sent' when sent_at is set AND its
--   error is cleared — the send function writes status +
--   timestamp in ONE update, and the CHECKs below refuse any
--   other combination. Symmetrically, a 'failed' row must carry
--   its reason, a provider message id may exist only on a 'sent'
--   row, and any row past 'pending' must show at least one
--   attempt (attempts is incremented at claim time). `error` is
--   capped at 500 characters so a provider stack trace can
--   never bloat a row; the function stores a short, safe
--   message only.
--
-- RE-RUN SAFETY
--   Unlike 0014 (plain statements), this file is wrapped in
--   BEGIN/COMMIT on purpose: the statements are plain `create
--   table` / `create policy` (run ONCE — a second run fails with
--   "already exists"), and the transaction wrapper guarantees
--   that such a failure leaves NOTHING behind instead of a
--   half-created table. The preflight absence check in the
--   execution checklist remains the primary guard; this is the
--   seatbelt, not a licence to run it twice.
--
-- DEPENDENCIES / ORDER
--   Run ONCE, only with the owner's explicit permission, after
--   0001–0014. Requires public.news_posts (0001) for the foreign
--   key and public.is_admin() (0001, current form since 0012).
--   Nothing in this file changes any existing table, policy or
--   row.
--
-- ROLLBACK
--   `drop table public.notice_deliveries;` removes everything
--   this file creates (policies, grants, indexes go with the
--   table). The ONLY data lost is the delivery log itself —
--   news_posts and email_subscribers are untouched (the foreign
--   key points FROM this table TO news_posts, never the other
--   way). If delivery history matters, export the table first.
--   Until C3 Step 4 exists, nothing reads this table, so a
--   rollback before Step 4 affects no running feature.
-- ============================================================================

begin;

create table public.notice_deliveries (
  id uuid primary key default gen_random_uuid(),
  -- The notice this delivery belongs to. Deleting the notice
  -- deletes its delivery log with it (a log without its notice
  -- answers no question the panel could ask).
  post_id uuid not null references public.news_posts (id) on delete cascade,
  -- Where the address came from: 'subscriber' (email_subscribers,
  -- status 'verified' at send time) or 'member' (reserved; no
  -- members email column exists yet, so nothing can produce
  -- 'member' rows today).
  recipient_kind text not null
    check (recipient_kind in ('subscriber', 'member')),
  -- Send-time snapshot, stored normalized (lowercase, trimmed)
  -- by the send function; the CHECKs below refuse anything else
  -- (same pair as email_subscribers in 0014).
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  -- Message id returned by Gmail on acceptance; null until sent.
  provider_message_id text,
  -- Last failure's short, safe message (never a stack trace,
  -- never anything from the recipient's side). Null unless the
  -- latest attempt failed.
  error text,
  -- Number of send attempts made for this row (>= 1 once the
  -- row has been claimed for its first attempt; incremented by
  -- the send function in the atomic claim update).
  attempts int not null default 0,
  last_attempt_at timestamptz,
  -- Set once, when Gmail accepted the message.
  sent_at timestamptz,
  created_at timestamptz not null default now(),

  -- One row per recipient per notice — the retry contract above.
  constraint notice_deliveries_once_per_recipient
    unique (post_id, recipient_kind, recipient_email),
  constraint notice_deliveries_email_lower
    check (recipient_email = lower(recipient_email)),
  constraint notice_deliveries_email_shape
    check (position('@' in recipient_email) > 1
           and char_length(recipient_email) <= 254),
  constraint notice_deliveries_attempts_nonnegative
    check (attempts >= 0),
  constraint notice_deliveries_error_short
    check (error is null or char_length(error) <= 500),
  -- A row may only claim 'sent' with its evidence timestamp set.
  constraint notice_deliveries_sent_has_time
    check (status <> 'sent' or sent_at is not null),
  -- ... and with any earlier failure reason cleared.
  constraint notice_deliveries_sent_error_clear
    check (status <> 'sent' or error is null),
  -- A failure must carry its (short, safe) reason.
  constraint notice_deliveries_failed_has_error
    check (status <> 'failed' or error is not null),
  -- A provider message id exists only for an accepted message.
  constraint notice_deliveries_msgid_only_when_sent
    check (status = 'sent' or provider_message_id is null),
  -- Any state past 'pending' implies at least one claim/attempt.
  constraint notice_deliveries_outcome_has_attempt
    check (status = 'pending' or attempts >= 1)
);

-- The panel's delivery view filters one notice's rows by status;
-- the unique constraint already covers plain per-notice lookups.
create index notice_deliveries_post_status_idx
  on public.notice_deliveries (post_id, status);

alter table public.notice_deliveries enable row level security;

-- Admin reads the delivery log (per-notice delivery report).
-- This is the ONLY policy: delivery rows are an audit record and
-- are written exclusively by the send function (service role).
-- The panel's retry action calls that function; it never edits
-- rows directly, so no update policy exists on purpose.
create policy "deliveries: admin reads"
  on public.notice_deliveries for select
  using (public.is_admin());

-- Deliberately NO insert/update/delete policies for anon or
-- authenticated, and NO grant of any kind to anon (see header).

-- ----------------------------------------------------------------------------
-- GRANTs (project rule: every migration that creates a table ends
-- with its own explicit grant section; no default privileges were
-- ever set for this project — see 0010).
-- ----------------------------------------------------------------------------
revoke all on table public.notice_deliveries from anon;
revoke all on table public.notice_deliveries from authenticated;
grant select on table public.notice_deliveries to authenticated;

commit;

-- ============================================================================
-- FLOW THIS SCHEMA SUPPORTS (implemented in C3 Step 4, not here)
--   Publish & Send (admin action -> send-announcement function):
--     load verified subscribers; insert one 'pending' row per
--     address (ON CONFLICT DO NOTHING); then per row, the atomic
--     CLAIM (see the claim contract in the header): one update
--     flips a 'pending'/'failed' row to 'sending' with attempts
--     + 1 — only the run whose update matched sends the email via
--     the C4 Gmail library, then ONE guarded outcome update
--     records 'sent' + sent_at + provider_message_id, or
--     'failed' + short error. A 'sending' row gone stale (claim
--     older than 15 minutes) is closed as 'failed' with an
--     interrupted/unknown reason — never auto-resent; the admin
--     retries it manually from the report. The notice itself is
--     already published by the normal publish action — email
--     failure never unpublishes or blocks it; the panel reads
--     the report from this table (SELECT only).
-- ============================================================================
