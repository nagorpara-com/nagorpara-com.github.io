-- ============================================================================
-- Migration 0013 (DRAFT — NOT APPLIED)
-- Contact messages: a real `subject` column.
--
-- Why: the Phase C / C1 contact form collects a subject, but the
-- live `contact_messages` table (0001) has no subject column. Until
-- this migration is applied, the app bridges the gap by storing the
-- subject as the first line of `message`
-- (see src/utils/contactMessage.ts — the only place that knows).
-- This migration adds the column and backfills the bridged rows, so
-- the bridge can then be retired with a small code change.
--
-- Scope — deliberately small:
--   * ONE nullable column + a length check. No policy changes, no
--     grant changes (column operations inherit the table grants set
--     by 0010; the project's explicit-GRANT rule concerns new TABLES).
--   * The CAPTCHA follow-up (removing the anonymous INSERT policy
--     once server-side token verification exists) is a SEPARATE
--     future migration — it is NOT bundled here, because submissions
--     must keep working until that infrastructure is live.
--
-- Run only with the owner's explicit permission, after 0001–0012.
-- Idempotent: safe to run once; the column add and the backfill are
-- both guarded.
-- ============================================================================

alter table public.contact_messages
  add column if not exists subject text;

-- Length guard matching the form's validation (subject ≤ 120 chars).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contact_messages_subject_len'
  ) then
    alter table public.contact_messages
      add constraint contact_messages_subject_len
      check (subject is null or char_length(subject) <= 120);
  end if;
end $$;

-- Backfill rows written through the C1 bridge: the subject is the
-- first line, in the exact format "বিষয়: <subject>" followed by a
-- blank line (see src/utils/contactMessage.ts). Only untouched rows
-- (subject still null AND message carrying the prefix) are changed,
-- and the prefix line is stripped from the stored message.
update public.contact_messages
set subject = nullif(trim(substring(message from '^বিষয়: ([^\n]*)')), ''),
    message = regexp_replace(message, '^বিষয়: [^\n]*\n\n?', '')
where subject is null
  and message like 'বিষয়: %';
