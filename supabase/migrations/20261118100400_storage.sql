-- Storage buckets and per-bucket policies.
--
--   room-photos      public read   writers: rooms.manage or content.manage
--   site-media       public read   writers: content.manage
--   guest-documents  PRIVATE       read: documents.read · upload: documents.write
--                                  path must be bookings/<booking uuid>/<file>
--                                  delete: owner/super_admin/manager only (staff.manage)
--
-- Public buckets serve files by URL without these policies; the policies
-- govern listing, upload, overwrite and delete. Guest documents are never
-- public: the app gives staff a short-lived signed URL.
--
-- Rollback: drop the policies named below; restore the four "room photos:
-- managers …" policies from 20261116151700; delete buckets site-media and
-- guest-documents (after emptying them).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('site-media', 'site-media', true, 10485760, '{image/jpeg,image/png,image/webp,image/avif,image/svg+xml}'),
  ('guest-documents', 'guest-documents', false, 10485760, '{application/pdf,image/jpeg,image/png}')
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

/* ---------- room-photos ---------- */

drop policy if exists "room photos: managers read" on storage.objects;
drop policy if exists "room photos: managers upload" on storage.objects;
drop policy if exists "room photos: managers update" on storage.objects;
drop policy if exists "room photos: managers delete" on storage.objects;

create policy "room photos: editors read" on storage.objects for select to authenticated
  using (bucket_id = 'room-photos' and (public.has_permission('rooms.manage') or public.has_permission('content.manage')));
create policy "room photos: editors upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'room-photos' and (public.has_permission('rooms.manage') or public.has_permission('content.manage')));
create policy "room photos: editors update" on storage.objects for update to authenticated
  using (bucket_id = 'room-photos' and (public.has_permission('rooms.manage') or public.has_permission('content.manage')))
  with check (bucket_id = 'room-photos' and (public.has_permission('rooms.manage') or public.has_permission('content.manage')));
create policy "room photos: editors delete" on storage.objects for delete to authenticated
  using (bucket_id = 'room-photos' and (public.has_permission('rooms.manage') or public.has_permission('content.manage')));

/* ---------- site-media ---------- */

create policy "site media: editors read" on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and public.has_permission('content.manage'));
create policy "site media: editors upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.has_permission('content.manage'));
create policy "site media: editors update" on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.has_permission('content.manage'))
  with check (bucket_id = 'site-media' and public.has_permission('content.manage'));
create policy "site media: editors delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.has_permission('content.manage'));

/* ---------- guest-documents (private) ---------- */

-- bookings/<uuid>/<file>, and the booking must exist. Answers only for staff
-- who may upload documents, so it can't be used to probe booking ids.
create or replace function public._guest_document_path_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('documents.write')
     and p_name ~ '^bookings/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
     and exists (select 1 from bookings where id::text = (storage.foldername(p_name))[2]);
$$;
revoke all on function public._guest_document_path_ok(text) from public, anon;
grant execute on function public._guest_document_path_ok(text) to authenticated;

create policy "guest documents: documents.read" on storage.objects for select to authenticated
  using (bucket_id = 'guest-documents' and public.has_permission('documents.read'));
create policy "guest documents: documents.write uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'guest-documents' and public.has_permission('documents.write') and public._guest_document_path_ok(name));
-- No overwrites: a corrected document is a new file.
create policy "guest documents: senior staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'guest-documents' and public.has_permission('staff.manage'));
