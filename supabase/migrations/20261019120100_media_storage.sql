-- 0038 — Real image uploads (CricHeroes parity #01).
--
-- Logos, banners and player photos used to be saved as device-local URIs
-- (file:// / blob:), so only the uploader's device could show them. They now go
-- to a public `media` bucket under the uploader's uid folder; the app stores the
-- public URL. Who may ATTACH an image is still decided by the table RLS on the
-- row update (tournaments/matches/clubs/organizations/players).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media insert own" on storage.objects;
create policy "media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media delete own" on storage.objects;
create policy "media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

alter table tournaments add column if not exists banner_url text;
