# Edge Functions — server-side code

Everything in this folder runs **only** on Supabase's servers
(Deno). Nothing here is part of the website build, and nothing
here may ever be imported by the frontend (`src/`).

## send-email (Phase C / C4 — foundation)

The single, audited path for sending email as the organization.
Built for the features that use it — subscription verification
(C2, implemented as code) and notice delivery (C3, later).

- `_shared/email.ts` — configuration from environment, message
  validation, Gmail SMTP transport (timeouts: 10s connect /
  10s greeting / 20s socket, plus a 25s overall guard), typed
  errors, and secret-free logging (masked recipient only — never
  the password, the full address, or message content).
- `send-email/index.ts` — the endpoint. Server-to-server only:
  callers must present the internal secret in the
  `x-internal-secret` header. It refuses to operate when that
  secret is not configured.

### Secrets the owner sets (never in this repo, never in .env)

In the Supabase Dashboard **Edge Functions Secrets** (or via
the CLI with `supabase secrets set`), set exactly:

| Name | What it is |
|---|---|
| `GMAIL_ADDRESS` | The organization's Gmail address: `nagorpara.youth@gmail.com` |
| `GMAIL_APP_PASSWORD` | A Gmail **App Password** for that account |
| `INTERNAL_FUNCTION_SECRET` | A long random secret the owner generates; the only credential callers use |
| `PUBLIC_SITE_URL` | The public website's base URL (C2: email links + CORS) |
| `UNSUBSCRIBE_SIGNING_SECRET` | A long random secret the owner generates; signs unsubscribe links (C2). Rotating it invalidates old links |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
are provided automatically by the Supabase runtime — never set
or copy them anywhere.

Creating the App Password (owner does this personally — it is
never shared in chat or written anywhere in this project):
Gmail account **Manage your Google Account Security
2-Step Verification (turn ON) App passwords** create one for
"Mail". Google shows the password once; paste it directly into
the Supabase secret above.

Feasibility limits (audited, see `docs/NEXT_PHASE_ROADMAP.md`):
free Gmail allows roughly **500 recipients/day** via SMTP, and
Gmail SMTP provides **no bounce/delivery notifications** — on
this path a delivery can only be recorded as sent or failed.
Full delivery status (incl. bounced) becomes possible only with
an email provider on the organization's own domain (Phase B).

### Deployment — DONE 2026-10-25 (Email Activation)

All seven functions were deployed via the Supabase Dashboard
(owner-approved), and the full chain was verified live:
send-email test mail delivered; subscribe verification email
verify welcome email unsubscribe (via the welcome email's
own signed link) all passed. See
`docs/EMAIL_ACTIVATION_REPORT_2026-10-25.md`.

```bash
supabase functions deploy send-email --no-verify-jwt
```

`--no-verify-jwt`: authorization is the internal secret, because
callers are other server functions, not signed-in users.

> **PUBLIC_SITE_URL is currently `http://localhost:5173`** (the
> site runs only on the owner's PC). When the website is
> deployed, change this secret to
> `https://nagarparayouthsangha.org` — every email link and the
> CORS origin derive from it.

## Subscriber functions (Phase C / C2 — code implemented)

Double opt-in subscribers, per migration draft **0014** (the
table must exist before these are useful):

| Function | Caller | Deploy |
|---|---|---|
| `subscribe` | Public form (footer) | `--no-verify-jwt` |
| `resend-verification` | Verification page resend form | `--no-verify-jwt` |
| `verify-subscription` | Verification landing page | `--no-verify-jwt` |
| `unsubscribe` | Unsubscribe confirmation page | `--no-verify-jwt` |
| `subscription-status` | Public site popup logic (exists-check for a remembered subscription id; owner rule 2026-10-27) | `--no-verify-jwt` |
| `admin-subscribers` | Admin Panel (session token; role re-checked server-side) | default (JWT on) |

- `_shared/subscribers.ts` — all flow rules: token hashing,
  48-hour expiry, atomic single-use consume, resend throttles
  (60s / max 5), uniform public responses (anti-enumeration),
  HMAC unsubscribe signatures, admin authorization.
- `_shared/subscriberStore.ts` — the service-role data adapter
  and the Auth+profiles admin checker.
- `_shared/subscriberMailer.ts` — wires flows to the C4 mailer;
  verification email content (Bengali) lives there.
- `_shared/http.ts` — JSON/CORS helpers + per-IP rate limiting.

Status: **DEPLOYED 2026-10-25** (Dashboard; Verify JWT OFF for
the four public functions, ON for `admin-subscribers`).
Migration 0014 applied live 2026-10-23. Real delivery
**VERIFIED live 2026-10-25** (full double opt-in chain,
see the activation report). Requires migration **0024**
(service_role grants) — applied live 2026-10-25.

## Announcement function (Phase C / C3 Step D — code implemented)

Notice email delivery, per migration **0015** (applied live
2026-10-24) and the Admin-Controlled C3 rule — Publish and
Publish & Send Email are separate actions; sending happens only
from the Admin Panel, only for published notices, only to
verified subscribers.

| Function | Caller | Deploy |
|---|---|---|
| `send-announcement` | Admin Panel (session token; role re-checked server-side) | default (JWT on) |

```bash
supabase functions deploy send-announcement
```

Actions: `preview` / `report` (read-only counts + summary),
`send` (seed + deliver), `retry` (failed rows only — the
admin's explicit human decision for uncertain rows).

- `_shared/announcement.ts` — the delivery engine: atomic claim,
  guarded outcome writes, stale-'sending' closure as
  OUTCOME_UNKNOWN (never auto-resent), verified-only recipients,
  config gate (`PUBLIC_SITE_URL` + `UNSUBSCRIBE_SIGNING_SECRET`
  required before anything is seeded or sent).
- `_shared/announcementStore.ts` — the service-role data adapter
  (the ONLY writer of `notice_deliveries`).
- Extra secrets beyond C2/C4: none new — it reuses
  `PUBLIC_SITE_URL`, `UNSUBSCRIBE_SIGNING_SECRET`,
  `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`.

Status: **DEPLOYED 2026-10-25** (Verify JWT ON).
Unauthenticated calls are refused server-side (verified).
The full admin send flow (preview send delivery report)
gets its live proof from the owner's own Admin Panel test —
it needs his admin session, which never leaves his PC.

## Shared email footer & welcome email (Phase C — code implemented)

- `_shared/emailFooter.ts` — ONE shared footer (organization
  block + a subordinate developer-promotion block), appended
  automatically to BOTH the welcome email and every notice
  announcement email. The website link is the runtime
  `PUBLIC_SITE_URL` (never hardcoded); the organization
  Facebook URL and the developer block mirror
  `src/config/organization.ts` / `src/config/developer.ts`
  with their sources cited in the file.
- `_shared/welcomeEmail.ts` + a hook in `verify-subscription`:
  a welcome email is sent ONCE, only on the verify transition
  (the retained token hash finds the row; "already-verified"
  sends nothing). Its failure never changes the verification
  response. Verification mechanics are untouched.

Status: **DEPLOYED 2026-10-25**; welcome delivery **VERIFIED
live** the same day (arrived with footer + signed unsubscribe
link; the link itself completed the test unsubscribe).

### Local development

`supabase functions serve send-email` reads a local
`supabase/functions/.env` file — that file is git-ignored (the
repo's `.env` rule covers it) and must contain the same three
secret names with LOCAL/test values only. Never commit it.

### Status (C4)

**DEPLOYED and VERIFIED live 2026-10-25**: a real test send
through Gmail SMTP arrived from the organization's address
("Nagar Para Agragami Youth Sangha <nagorpara.youth@gmail.com>").
See `docs/EMAIL_ACTIVATION_REPORT_2026-10-25.md`.
