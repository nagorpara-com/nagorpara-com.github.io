-- =====================================================================
-- Storage buckets (Phase 2 DRAFT — run AFTER 0001, in the Supabase
-- setup step, after review. Not applied anywhere yet.)
--
-- Public buckets : player-photos, gallery, site-assets (logo/banners)
-- Private bucket : receipts (finance receipts & sensitive documents)
--                  — files here are NEVER publicly readable; they are
--                  served only through short-lived signed URLs to users
--                  whose role can manage finance.
-- =====================================================================

insert into storage.buckets (id, name, public) values
  ('player-photos', 'player-photos', true),
  ('gallery', 'gallery', true),
  ('site-assets', 'site-assets', true),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Public buckets: anyone can read, only content editors can write.
create policy "public buckets: read"
  on storage.objects for select
  using (bucket_id in ('player-photos', 'gallery', 'site-assets'));

create policy "public buckets: editors write"
  on storage.objects for insert
  with check (
    bucket_id in ('player-photos', 'gallery', 'site-assets')
    and public.can_edit_content()
  );

create policy "public buckets: editors update/delete"
  on storage.objects for update
  using (
    bucket_id in ('player-photos', 'gallery', 'site-assets')
    and public.can_edit_content()
  );

create policy "public buckets: editors delete"
  on storage.objects for delete
  using (
    bucket_id in ('player-photos', 'gallery', 'site-assets')
    and public.can_edit_content()
  );

-- Private receipts: finance roles only, for every operation.
create policy "receipts: finance roles only"
  on storage.objects for all
  using (bucket_id = 'receipts' and public.can_manage_finance())
  with check (bucket_id = 'receipts' and public.can_manage_finance());
