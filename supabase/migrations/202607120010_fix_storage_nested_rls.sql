create or replace function public.can_upload_glimmer_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='glimmers' and exists(
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and g.status='pending' and g.deleted_at is null and g.owner_id=auth.uid()
  );
$$;
create or replace function public.can_read_glimmer_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='glimmers' and exists(
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and g.status='ready' and g.deleted_at is null
      and public.is_glimmer_accounted(g) and public.is_space_member(g.space_id)
  );
$$;
create or replace function public.can_delete_glimmer_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='glimmers' and exists(
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and g.deleted_at is null and g.owner_id=auth.uid()
      and g.created_at>now()-interval '24 hours'
  );
$$;

revoke all on function public.can_upload_glimmer_object(text,text),
 public.can_read_glimmer_object(text,text),public.can_delete_glimmer_object(text,text) from public,anon;
grant execute on function public.can_upload_glimmer_object(text,text),
 public.can_read_glimmer_object(text,text),public.can_delete_glimmer_object(text,text) to authenticated;

drop policy glimmers_storage_insert_owner on storage.objects;
create policy glimmers_storage_insert_owner on storage.objects for insert to authenticated
with check(bucket_id='glimmers' and owner_id=auth.uid()::text
  and public.can_upload_glimmer_object(bucket_id,name));
drop policy glimmers_storage_select_member on storage.objects;
create policy glimmers_storage_select_member on storage.objects for select to authenticated
using(public.can_read_glimmer_object(bucket_id,name));
drop policy glimmers_storage_delete_owner on storage.objects;
create policy glimmers_storage_delete_owner on storage.objects for delete to authenticated
using(bucket_id='glimmers' and owner_id=auth.uid()::text
  and public.can_delete_glimmer_object(bucket_id,name));
