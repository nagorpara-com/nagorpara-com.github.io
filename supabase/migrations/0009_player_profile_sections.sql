-- =====================================================================
-- Nagar Para Agragami Youth Sangha — Dynamic Player Profiles, Phase 1
-- Migration 0009: player_profile_sections table (owner-approved
-- proposal, 2026-10-23).
--
-- Purpose: let admins attach extra, structured sections to a player
-- profile (personal-info custom fields, career timeline, achievements,
-- media gallery, external links, free text) WITHOUT ever changing the
-- players table again. Each section is one row; the structured entries
-- of a section live in its `items` JSONB array (label/value pairs,
-- timeline entries, media URLs…) whose shape is defined per
-- section_type and validated by the Admin UI (Phase 2). New custom
-- fields never need a schema change — they are data, not columns.
--
-- Section types (fixed list, guarded by a CHECK constraint):
--   text         -> free text in `body`
--   info_fields  -> items: [{ "label": "...", "value": "..." }]
--   achievements -> items: [{ "year": "...", "title": "...",
--                             "description": "..." }]
--   career       -> items: [{ "period": "...", "title": "...",
--                             "description": "..." }]
--   media        -> items: [{ "url": "...", "caption": "..." }]
--                   (URLs point at the existing player-photos bucket;
--                   no new bucket and no storage-policy change)
--   links        -> items: [{ "label": "...", "url": "..." }]
--
-- Safety / design rules:
--   * PURELY ADDITIVE: this file creates ONE new table, its RLS
--     policies and one index. The players table, the publish-approval
--     trigger, the season-stats tables/views and every existing
--     policy are untouched — existing player data cannot be lost,
--     and players without sections render exactly as before.
--   * Sections have NO publish state of their own. A section is
--     publicly readable only while (a) the section itself is visible
--     (is_visible) AND (b) its player is published + active + not
--     archived — the same rule the players policy (0004) enforces.
--     Unpublishing or archiving a player hides all of its sections
--     immediately, at the database level.
--   * Writes follow the established permission pattern of this
--     project: insert/update for content roles (super_admin, admin,
--     editor — via can_edit_content(), which since 0007 only counts
--     ACTIVE profiles), DELETE for admins only (is_admin()) — the
--     same split migration 0006 applied to matches.
--   * No RLS recursion: this table's public policy reads
--     public.players, whose policies never reference this table.
--   * `items` must be a JSON array (CHECK below). `updated_at` is
--     maintained by the application on update (this project has no
--     generic updated_at trigger); it defaults to now() on insert.
--   * Deleting a player deletes its sections (ON DELETE CASCADE) —
--     consistent with the stats tables; the Admin UI's archive-first
--     rule and the performance-record delete guard are unchanged.
--
-- Apply AFTER 0001–0007, exactly once (run-once draft, like the
-- others). Migration 0008 (finance_summary security_invoker fix)
-- is a separate pending proposal: if it is approved it applies
-- BEFORE this file; if it is skipped, this file applies directly
-- after 0007 — the numbering gap is harmless.
-- NOT applied anywhere yet — no Supabase project exists as of
-- 2026-10-23.
-- =====================================================================

create table public.player_profile_sections (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  section_type text not null check (
    section_type in ('text', 'info_fields', 'achievements', 'career', 'media', 'links')
  ),
  title text not null,
  body text,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  display_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_profile_sections_player_order_idx
  on public.player_profile_sections (player_id, display_order);

alter table public.player_profile_sections enable row level security;

-- Public: only visible sections of published, active, unarchived
-- players. Draft/pending/archived players expose NOTHING here.
create policy "player_profile_sections: public reads visible of published players"
  on public.player_profile_sections for select
  using (
    is_visible
    and exists (
      select 1 from public.players p
      where p.id = player_id
        and p.status = 'published'
        and p.is_active
        and p.archived_at is null
    )
  );

-- Content roles can read every section (including hidden ones and
-- sections of draft players) so the Admin editor can manage them.
create policy "player_profile_sections: editors read all"
  on public.player_profile_sections for select
  using (public.can_edit_content());

create policy "player_profile_sections: editors insert"
  on public.player_profile_sections for insert
  with check (public.can_edit_content());

create policy "player_profile_sections: editors update"
  on public.player_profile_sections for update
  using (public.can_edit_content()) with check (public.can_edit_content());

-- Delete is admin-only, matching the players/matches pattern (0004/0006).
create policy "player_profile_sections: admins delete"
  on public.player_profile_sections for delete
  using (public.is_admin());

-- =====================================================================
-- VERIFY AFTER RUNNING (Supabase SQL Editor / API, per role):
--  1. As ANON with a PUBLISHED player: insert one visible and one
--     hidden section for that player (as an editor), then read as
--     anon — ONLY the visible section MUST come back.
--  2. Set the player to status 'draft' (as admin): anon reads of its
--     sections MUST return zero rows; set it back to 'published' and
--     the visible section MUST return.
--  3. Archive the player: anon section reads MUST return zero rows.
--  4. As EDITOR: insert/update/reorder a section MUST succeed;
--     DELETE MUST fail. As ADMIN: DELETE MUST succeed.
--  5. As VIEWER / FINANCE_MANAGER / INACTIVE editor: every write
--     MUST fail (can_edit_content is false for them).
--  6. Insert with section_type 'bogus' MUST fail (CHECK); insert
--     with items = '{}' (object, not array) MUST fail (CHECK).
--  7. Regression: players, stats views and match pages behave
--     exactly as before (this migration touches nothing else).
-- =====================================================================
