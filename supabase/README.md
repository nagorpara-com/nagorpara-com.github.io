# Supabase — Setup & Security Notes

Status (Phase 2): **No Supabase project is connected yet.** No fake
credentials exist anywhere in this repository. The SQL files in
`migrations/` are reviewed drafts, not yet applied.

## When the organization is ready

1. Create the project at https://supabase.com (sign in with GitHub).
   - Name: `nagar-para-youth-sangha`, Region: **Singapore**.
   - Set a strong **Database Password** and keep it private — never
     share it in chat, never commit it, never put it in this repo.
2. In the project's **SQL Editor**, run the migrations in this exact
   order — **0001 0009** — one file at a time, each exactly once.
   They are run-once drafts: re-running a file will fail partway
   because its tables/policies already exist. After each file, run
   the short verify checklist at the bottom of that file (and the
   combined checklist at the end of this document) before continuing.
   - `migrations/0001_init_schema.sql`
   - `migrations/0002_storage_buckets.sql`
   - `migrations/0003_homepage_sections.sql`
   - `migrations/0004_player_management.sql`
   - `migrations/0005_cricket.sql`
   - `migrations/0006_matches_delete_hardening.sql`
   - `migrations/0007_active_account_enforcement.sql`
   - `migrations/0008_finance_summary_security_fix.sql` — one-line
     security fix: sets `security_invoker = true` on the
     `finance_summary` view (0001 created it as a plain view, so the
     table's RLS was bypassed and anonymous API callers could read
     the organisation's FULL income/expense/balance totals). After
     this fix, non-finance callers see aggregates over `is_public`
     rows only; finance roles keep the full totals. The view's
     definition and the balance rule are unchanged.
   - `migrations/0009_player_profile_sections.sql` — adds the
     `player_profile_sections` table for Dynamic Player Profiles
     (extra per-player sections: custom info fields, career,
     achievements, media, links, free text). Purely additive — it
     changes no existing table; public reads only return visible
     sections of published, active, unarchived players.
   - **APPLIED 2026-10-23:** migrations **0001–0009 are live** on the
     organisation's Supabase project (PostgreSQL 17.11), verified:
     20 tables, 3 views (all `security_invoker = true`), 61 RLS
     policies, 4 storage buckets. Two files needed owner-approved
     corrections during the first run — 0001 (helper functions moved
     after the `profiles` table; SQL function bodies are validated
     at creation) and 0004/0005 (season-stats views group by the full
     `coalesce(...)` expression, not the ambiguous alias `season`).
   - `migrations/0010_api_privileges.sql` — **DRAFT, NOT APPLIED.**
     The 2026-10-23 permission audit found the API roles (`anon`,
     `authenticated`) hold no SELECT/INSERT/UPDATE/DELETE grants on
     the public tables (current Supabase projects no longer grant
     these automatically), so every Data API call fails with 42501
     even though RLS is correct. 0010 grants least-privilege API
     access (anon: public reads + contact-form insert only;
     authenticated: reads + RLS-gated writes, never the finance
     audit log) and revokes the unneeded TRUNCATE/REFERENCES/TRIGGER
     privileges. **Run it only with the owner's explicit permission,
     after 0001–0009.** Until it runs, the website cannot read or
     write data through the API.
   - **0010 v2 APPLIED 2026-10-23** (owner-approved commit e32b0ff)
     and API-verified the same day: public reads return 200,
     contact submission works (201) with read-back denied, and
     unauthorised writes are closed. One defect was found by that
     verification: `members_public` cannot be read anonymously —
     as a security_invoker view it requires caller privileges on
     the `members` table, which v2 deliberately withholds.
   - `migrations/0011_members_public_view_fix.sql` — **APPLIED
     2026-10-23** (owner-approved). Redefines `members_public` as
     a definer view whose definition carries the public-read
     filter itself (`where is_active`, phone only when
     `is_phone_public`, address never projected) and removes the
     `security_invoker` option. Grants nothing new; direct
     `members` access stays closed to anon. Verified after
     applying: anon `members_public` returns 200 [] (member rows
     do not exist yet — the phone-flag behaviour itself stays
     UNTESTED until member rows exist).
   - `migrations/0012_remove_super_admin_role.sql` — **APPLIED
     2026-10-23** (owner-approved). There is no "Super Admin":
     the owner's account is the single **Admin**, the highest
     authority. Converts the profile role to `admin`, recreates
     the three role helpers without the old value, and replaces
     the profiles write policy with "only admin writes" (policy
     total unchanged at 61). The `user_role` ENUM still stores
     the legacy value (PostgreSQL cannot drop an enum value);
     nothing references it. The companion app patch removing it
     from the UI was applied right after (build PASS, stub UI
     check with an `admin` profile PASS).
3. Create the **first Admin** (there is no hard-coded admin
   account, and no automatic profile is created — this manual step is
   the only way in, by design):
   1. In **Authentication > Users**, choose **Add user** and create
      the account with the owner's email and a strong password.
   2. In the same **Users** list, open the new user and copy the
      **User UID** — a long identifier that looks like
      `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. This is the UUID the
      next step needs.
   3. In the **SQL Editor**, run exactly this (replace the UUID and
      the name with the real ones):
      ```sql
      insert into public.profiles (id, full_name, role)
      values ('PASTE-THE-USER-UID-HERE', 'Owner Name', 'admin');
      ```
      The SQL Editor runs with the service role, which bypasses RLS —
      that is why this one-time insert works even though the
      `profiles` table itself only accepts writes from an admin.
   4. Verify: `select id, full_name, role, is_active from public.profiles;`
      must show the row with `admin` and `is_active = true`.
   5. This project has ONE main Admin by the owner's decision.
      Keep that profile active; if it is ever deactivated, restore
      it from the SQL Editor (see the recovery note in the 0007
      section below). A second admin can be added later the same
      way if the owner wants a backup.
4. Copy `.env.example` to `.env` and fill in **only**:
   - `VITE_SUPABASE_URL` — Settings > API > Project URL
   - `VITE_SUPABASE_ANON_KEY` — Settings > API > anon public key
5. On GitHub, store the same two values as **Actions Secrets** with the
   same names, so the Pages build can read them.

## Never do this

- Never put the **service_role key** in the frontend, in `.env` for the
  frontend build, or anywhere in this repository.
- Never disable RLS on a table. Every table in `0001` enables RLS in the
  same file that creates it.
- Never share the database password or any admin password in chat.

## Security model (summary)

- `anon` (public visitors): read-only, and only rows flagged
  `is_published` / `is_active` / `is_public`.
- Roles live in `profiles.role`: `admin`,
  `finance_manager`, `editor`, `viewer` (the ENUM also stores a
  legacy `super_admin` value that nothing references since
  migration 0012 — the owner removed the Super Admin concept;
  `admin` is the highest role). Helper SQL functions
  (`is_admin`, `can_edit_content`, `can_manage_finance`) drive policies.
  Since migration 0007 they only apply to **active** profiles —
  deactivating a profile (`is_active = false`) removes all of its
  database permissions at once, even if its login session is still
  valid.
- Storage: `player-photos`, `gallery`, `site-assets` are public-read;
  `receipts` is private — finance roles only, served via signed URLs.
- Finance audit: a trigger writes every finance INSERT/UPDATE/DELETE to
  `finance_audit_logs`, which has no write policy — it cannot be forged
  or edited through the API.

## Finance balance rules (verified in Phase 1/2)

- `income`, `subscription`, `donation` — money IN.
- `expense` — real spending; the ONLY type that reduces the balance.
- `withdrawal` — cash taken out of the fund into a person's hand.
  It is **not** an expense and does **not** reduce the balance again
  when the money is later spent — that spending is recorded once, as an
  `expense`. This is what prevents double counting.
- `transfer` — moving money between the fund's own accounts; net
  effect on total balance is zero.
- `current_balance = total_income - total_expense`, computed by the
  `finance_summary` view — the single source of truth for the public
  summary and monthly/yearly reports.

## Player management rules (migration 0004, Phase 6)

- **Publishing workflow:** `players.status` is `draft` (admin only)
  `pending` (awaiting approval) `published`. The public site shows a
  player only when `status = 'published'` AND `is_active` AND
  `archived_at is null` — enforced by RLS, not just by the frontend.
- **Approval:** a database trigger (`players_publish_approval`) rejects
  any attempt to set `status = 'published'` by a signed-in user whose
  profile role is not `admin`. Editors can prepare
  drafts and pending players; only an admin can publish.
- **Archive before delete:** `archived_at` soft-archives a player and
  keeps every linked record. The Admin UI refuses a permanent delete
  while match performance records exist for the player. At the
  database level the players policies are split per operation —
  editors may read all / insert / update, but **DELETE is admin-only**
  (`players: admins delete`), because a delete cascades into stats
  and match performances.
- **View security:** `football_season_stats` is created with
  `security_invoker = true` (PostgreSQL 15+), so the underlying
  tables' RLS applies to whoever queries the view — anonymous callers
  only ever see aggregates for publicly visible players.
- **Season stats, no double counting:** `football_player_stats` holds
  one row per (player, season). The view `football_season_stats`
  computes season stats from published match performances (season =
  tournament season, else match year). Rule: when a season exists in
  the view, the computed numbers are final and the same season must
  not also be stored manually; stored rows cover seasons that have no
  performance records (older history). Inactive players keep their
  stored stats untouched.
- **Team settings:** `site_settings` football_* columns store the team
  name (নগর পাড়া ফুটবল দল), current season (2026), layout (grid),
  sorting (custom = display_order) and the player-card stat list —
  editable from the Admin Panel, persistent across refresh.
- **Photos:** player photos live in the `player-photos` Storage bucket
  (public read, editor write — see 0002).

## Cricket module (migration 0005, Phase 7)

- `players` gains `batting_style` / `bowling_style` (Admin-managed).
- `cricket_player_stats` is season-wise (PK player_id + season) with
  the full raw field set (innings, balls faced, highest score, not
  outs, fours/sixes, balls bowled, runs conceded, maidens, best
  bowling text, stumpings, run outs). Averages, strike rates and
  economy are **derived by the app** from raw numbers — never stored,
  and shown as "—" when the inputs do not exist.
- `cricket_season_stats` view (security_invoker = true) computes the
  same fields from published match performances; the football
  no-double-counting precedence rule applies unchanged.
- Public read of cricket stats is restricted to publicly visible
  players (the 0001 `using (true)` policy is replaced).
- Cricket settings live in `site_settings` cricket_* columns; team
  name/season start NULL (not provided by the owner yet) — the Admin
  Panel's Players page (Cricket tab) edits them.

## Matches delete hardening (migration 0006, §6 Security Fix)

- **In simple words:** editors may add and edit matches, tournaments
  and player performances, but they can never delete them. Only a
  admin can delete — because a delete also changes the published
  season statistics.
- The 0001 write policies for `matches`, `tournaments` and
  `match_performances` were FOR ALL with `can_edit_content()`, which
  silently included DELETE for editors. 0006 splits them (same pattern
  as the players fix in 0004): content roles keep read-all (matches /
  tournaments), insert and update; **DELETE requires `is_admin()`**
  (admin only).
- Performance reads need no extra policy: the 0004 public-read policy
  already lets content roles read all rows.
- The Admin Matches page matches this: the performance remove button
  renders only for admin profiles; the database policy
  is the real enforcement.

## Active account enforcement (migration 0007, Security Fix)

- **In simple words:** switching a person's profile off
  (`is_active = false`) switches ALL of their database permissions
  off — immediately and everywhere — even if they are still logged in
  somewhere. Switching it back on restores the permissions.
- Migration 0001's `current_user_role()` returned the role without
  looking at `is_active`; the Admin UI blocked inactive profiles, but
  direct API calls with a still-valid session token kept working.
  0007 redefines only that one function to also require `is_active`.
  Its name, return type, `SECURITY DEFINER` and `search_path` are
  unchanged, so every helper and policy — including 0006's admin-only
  deletes, which now also require an *active* admin — inherits the
  enforcement with no policy edits.
- Public reading of published content and reading one's own profile
  row do **not** depend on this function and are unaffected.
- **Recovery:** if the Admin profile is ever deactivated, no one
  can manage profiles through the app or API. The owner can
  restore access only in the **SQL Editor** (service role):
  `update public.profiles set is_active = true where id = '<uuid>';`
  Prevention: keep the Admin profile active (see step 3.5 above).

## After all migrations — verification & live RLS checklist

Run these checks right after applying 0001 0007, signed in as each
role (the SQL Editor's "Run as" / a test account per role). Every item
must behave as stated before the site goes live.

Per migration:
- [ ] 0001: 19 tables exist after 0003 with RLS enabled on all;
      `finance_summary` view returns one row.
- [ ] 0002: four buckets exist; `receipts` is private, the other
      three are public.
- [ ] 0003: `home_sections` rows are seeded/readable; writes require
      an admin.
- [ ] 0004: an editor can create a draft player but cannot set
      `status = 'published'` (trigger rejects it); an admin can.
- [ ] 0005: `cricket_season_stats` view exists; cricket stats of
      non-visible players are not readable by anon.
- [ ] 0006: as an editor, DELETE on `matches`, `tournaments` and
      `match_performances` fails / affects 0 rows; as an admin it
      succeeds and season statistics change accordingly.
- [ ] 0007: deactivate a test editor, reuse the SAME session token —
      every write fails and `select public.current_user_role();`
      returns NULL; reactivate and the permissions return.

Live RLS, by role:
- [ ] **Anon:** only published players / matches / tournaments /
      news are readable; season-stat views show published data only;
      public buckets are readable, `receipts` is not.
- [ ] **Viewer & finance_manager:** all content writes fail;
      finance_manager can manage finance rows and read `receipts`,
      nothing else extra.
- [ ] **Active editor:** content create/update works, publish /
      unpublish of matches works, ALL deletes on players, matches,
      tournaments and performances fail.
- [ ] **Admin:** deletes work (statistics update at
      once); Settings and profiles are manageable; finance audit log
      gains an entry for every finance change and cannot be edited
      through the API.
- [ ] **Finance rule:** add one income, one expense and one
      withdrawal; `finance_summary.current_balance` must equal
      (income + subscription + donation) − expense, with the
      withdrawal NOT reducing the balance.
