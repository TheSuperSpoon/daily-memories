insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('glimmers','glimmers',false,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

create policy glimmers_storage_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id='glimmers' and owner_id=auth.uid()::text and exists (
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=bucket_id and a.object_key=name and a.provider='supabase'
      and a.is_current and a.deleted_at is null and g.status='pending'
      and g.deleted_at is null and g.owner_id=auth.uid()
  )
);

create policy glimmers_storage_select_member
on storage.objects for select to authenticated
using (
  bucket_id='glimmers' and exists (
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=bucket_id and a.object_key=name and a.provider='supabase'
      and a.is_current and a.deleted_at is null and g.status='ready'
      and g.deleted_at is null and public.is_space_member(g.space_id)
  )
);

create policy glimmers_storage_delete_owner
on storage.objects for delete to authenticated
using (
  bucket_id='glimmers' and owner_id=auth.uid()::text and exists (
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=bucket_id and a.object_key=name and a.provider='supabase'
      and a.is_current and a.deleted_at is null and g.deleted_at is null
      and g.owner_id=auth.uid() and g.created_at>now()-interval '24 hours'
  )
);
