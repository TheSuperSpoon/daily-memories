-- Business ownership belongs to a role in a space. Auth user ids are only
-- nullable audit metadata so replacing an account cannot remove role data.

alter table public.glimmers drop constraint if exists glimmers_owner_id_fkey;
alter table public.glimmers alter column owner_id drop not null;
alter table public.glimmers add constraint glimmers_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

alter table public.memories drop constraint if exists memories_owner_id_fkey;
alter table public.memories alter column owner_id drop not null;
alter table public.memories add constraint memories_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

alter table public.mel_likes drop constraint if exists mel_likes_owner_id_fkey;
alter table public.mel_likes alter column owner_id drop not null;
alter table public.mel_likes add constraint mel_likes_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

create or replace function public.is_current_role_owner(
  target_space uuid,
  target_role public.member_role
) returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.space_members sm
    where sm.space_id=target_space and sm.role=target_role and sm.user_id=auth.uid()
  );
$$;

revoke all on function public.is_current_role_owner(uuid,public.member_role) from public,anon;
grant execute on function public.is_current_role_owner(uuid,public.member_role) to authenticated;

alter table public.gift_progress
  add column if not exists prelude_completed_at timestamptz;

create or replace function public.get_mel_prelude_completed(p_space_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_current_role_owner(p_space_id,'mel'::public.member_role) then
    raise exception using errcode='42501',message='FEATURE_FORBIDDEN'; end if;
  return exists(
    select 1 from public.gift_progress gp
    where gp.space_id=p_space_id and gp.role='mel'::public.member_role
      and gp.prelude_completed_at is not null
  );
end;
$$;

create or replace function public.complete_mel_prelude(p_space_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.is_current_role_owner(p_space_id,'mel'::public.member_role) then
    raise exception using errcode='42501',message='FEATURE_FORBIDDEN'; end if;
  insert into public.gift_progress(space_id,role,prelude_completed_at)
  values(p_space_id,'mel'::public.member_role,now())
  on conflict(space_id,role) do update
  set prelude_completed_at=coalesce(public.gift_progress.prelude_completed_at,excluded.prelude_completed_at),
      updated_at=now();
  return true;
end;
$$;

revoke all on function public.get_mel_prelude_completed(uuid),
  public.complete_mel_prelude(uuid) from public,anon;
grant execute on function public.get_mel_prelude_completed(uuid),
  public.complete_mel_prelude(uuid) to authenticated;

-- Release the canonical role slot before Auth applies cascading foreign keys.
-- Storage ownership is detached as well; access remains controlled by the
-- role-aware record and storage policies below.
create or replace function public.prepare_auth_user_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update storage.objects set owner_id=null where owner_id=old.id::text;
  update public.registration_slots
  set state='open',user_id=null,claimed_at=null
  where user_id=old.id;
  return old;
end;
$$;

drop trigger if exists before_auth_user_deleted on auth.users;
create trigger before_auth_user_deleted
before delete on auth.users
for each row execute function public.prepare_auth_user_deletion();

revoke all on function public.prepare_auth_user_deletion() from public,anon,authenticated;

create or replace function public.finalize_glimmer_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.glimmers%rowtype; a public.glimmer_assets%rowtype;
begin
  select * into g from public.glimmers where id=p_id for update;
  if not found or not public.is_current_role_owner(g.space_id,g.role) or g.deleted_at is not null then
    raise exception using errcode='42501',message='GLIMMER_NOT_OWNED';
  end if;
  if g.status='ready' then return to_jsonb(g); end if;
  select * into a from public.glimmer_assets where glimmer_id=g.id and is_current and deleted_at is null;
  if a.provider<>'supabase' or not exists(
    select 1 from storage.objects o where o.bucket_id=a.bucket and o.name=a.object_key
      and o.metadata->>'mimetype'=a.content_type
  ) then raise exception using errcode='P0001',message='OBJECT_NOT_FOUND_OR_MISMATCH'; end if;
  update public.glimmers set status='ready',ready_at=coalesce(ready_at,now())
  where id=g.id returning * into g;
  return to_jsonb(g);
end;
$$;

create or replace function public.cancel_glimmer_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.glimmers%rowtype; a public.glimmer_assets%rowtype;
begin
  select * into g from public.glimmers where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'cancelled',true); end if;
  if not public.is_current_role_owner(g.space_id,g.role) then
    raise exception using errcode='42501',message='GLIMMER_NOT_OWNED'; end if;
  if g.status<>'pending' then raise exception using errcode='P0001',message='GLIMMER_NOT_PENDING'; end if;
  select * into a from public.glimmer_assets where glimmer_id=g.id and is_current and deleted_at is null;
  if a.provider='supabase' and exists(
    select 1 from storage.objects where bucket_id=a.bucket and name=a.object_key
  ) then raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  delete from public.glimmers where id=g.id;
  return jsonb_build_object('id',p_id,'cancelled',true);
end;
$$;

create or replace function public.complete_glimmer_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.glimmers%rowtype; a public.glimmer_assets%rowtype;
begin
  select * into g from public.glimmers where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if not public.is_current_role_owner(g.space_id,g.role) then
    raise exception using errcode='42501',message='DELETE_FORBIDDEN'; end if;
  if g.deleted_at is not null then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if g.created_at<=now()-interval '24 hours' then
    raise exception using errcode='42501',message='DELETE_WINDOW_EXPIRED'; end if;
  select * into a from public.glimmer_assets where glimmer_id=g.id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=a.bucket and name=a.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  update public.glimmer_assets set deleted_at=now(),is_current=false where id=a.id;
  update public.glimmers set deleted_at=now() where id=g.id;
  return jsonb_build_object('id',p_id,'deleted',true);
end;
$$;

create function public.list_glimmers_by_role(
  p_space_id uuid,p_from date,p_to date,p_role public.member_role default null,p_limit integer default 50,
  p_cursor_date date default null,p_cursor_created_at timestamptz default null,p_cursor_id uuid default null
) returns table(glimmer jsonb) language plpgsql security definer set search_path='' as $$
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if p_from>p_to or p_to-p_from>366 then raise exception using errcode='22023',message='INVALID_DATE_RANGE'; end if;
  if p_limit<1 or p_limit>100 then raise exception using errcode='22023',message='INVALID_LIMIT'; end if;
  if (p_cursor_date is null)<>(p_cursor_created_at is null) or (p_cursor_date is null)<>(p_cursor_id is null) then
    raise exception using errcode='22023',message='INVALID_CURSOR'; end if;
  return query select jsonb_build_object('id',g.id,'space_id',g.space_id,'owner_id',g.owner_id,
    'role',g.role,'glimmer_date',g.glimmer_date,'note',g.note,'mood',g.mood,
    'preferred_timezone',g.preferred_timezone,'created_at',g.created_at,'ready_at',g.ready_at,
    'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,'object_key',a.object_key,
      'content_type',a.content_type,'size_bytes',a.size_bytes))
  from public.glimmers g join public.glimmer_assets a on a.glimmer_id=g.id and a.is_current and a.deleted_at is null
  where g.space_id=p_space_id and g.status='ready' and g.deleted_at is null and public.is_glimmer_accounted(g)
    and g.glimmer_date between p_from and p_to and (p_role is null or g.role=p_role)
    and (p_cursor_date is null or (g.glimmer_date,g.created_at,g.id)<(p_cursor_date,p_cursor_created_at,p_cursor_id))
  order by g.glimmer_date desc,g.created_at desc,g.id desc limit p_limit;
end;
$$;

create or replace function public.finalize_memory_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare record_row public.memories%rowtype; asset_row public.memory_assets%rowtype;
begin
  select * into record_row from public.memories where id=p_id for update;
  if not found or not public.is_current_role_owner(record_row.space_id,record_row.role)
    or record_row.deleted_at is not null then
    raise exception using errcode='42501',message='MEMORY_NOT_OWNED'; end if;
  if record_row.status='ready' then return to_jsonb(record_row); end if;
  select * into asset_row from public.memory_assets where memory_id=p_id and is_current and deleted_at is null;
  if not exists(select 1 from storage.objects o where o.bucket_id=asset_row.bucket and o.name=asset_row.object_key
    and o.metadata->>'mimetype'=asset_row.content_type) then
    raise exception using errcode='P0001',message='OBJECT_NOT_FOUND_OR_MISMATCH'; end if;
  update public.memories set status='ready',ready_at=coalesce(ready_at,now())
  where id=p_id returning * into record_row;
  return to_jsonb(record_row);
end;
$$;

create or replace function public.cancel_memory_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare record_row public.memories%rowtype; asset_row public.memory_assets%rowtype;
begin
  select * into record_row from public.memories where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'cancelled',true); end if;
  if not public.is_current_role_owner(record_row.space_id,record_row.role) or record_row.status<>'pending' then
    raise exception using errcode='42501',message='MEMORY_NOT_CANCELLABLE'; end if;
  select * into asset_row from public.memory_assets where memory_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  delete from public.memories where id=p_id;
  return jsonb_build_object('id',p_id,'cancelled',true);
end;
$$;

create or replace function public.complete_memory_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare record_row public.memories%rowtype; asset_row public.memory_assets%rowtype;
begin
  select * into record_row from public.memories where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if not public.is_current_role_owner(record_row.space_id,record_row.role) then
    raise exception using errcode='42501',message='DELETE_FORBIDDEN'; end if;
  if record_row.deleted_at is not null then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if record_row.created_at<=now()-interval '24 hours' then
    raise exception using errcode='42501',message='DELETE_WINDOW_EXPIRED'; end if;
  select * into asset_row from public.memory_assets where memory_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  update public.memory_assets set deleted_at=now(),is_current=false where id=asset_row.id;
  update public.memories set deleted_at=now() where id=p_id;
  return jsonb_build_object('id',p_id,'deleted',true);
end;
$$;

create or replace function public.finalize_mel_like_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare like_row public.mel_likes%rowtype; asset_row public.mel_like_assets%rowtype;
begin
  select * into like_row from public.mel_likes where id=p_id for update;
  if not found or not public.is_current_role_owner(like_row.space_id,like_row.role)
    or like_row.deleted_at is not null then
    raise exception using errcode='42501',message='MEL_LIKE_NOT_OWNED'; end if;
  if like_row.status='ready' then return to_jsonb(like_row); end if;
  select * into asset_row from public.mel_like_assets where mel_like_id=p_id and is_current and deleted_at is null;
  if not exists(select 1 from storage.objects o where o.bucket_id=asset_row.bucket and o.name=asset_row.object_key
    and o.metadata->>'mimetype'=asset_row.content_type) then
    raise exception using errcode='P0001',message='OBJECT_NOT_FOUND_OR_MISMATCH'; end if;
  update public.mel_likes set status='ready',ready_at=coalesce(ready_at,now())
  where id=p_id returning * into like_row;
  return to_jsonb(like_row);
end;
$$;

create or replace function public.cancel_mel_like_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare like_row public.mel_likes%rowtype; asset_row public.mel_like_assets%rowtype;
begin
  select * into like_row from public.mel_likes where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'cancelled',true); end if;
  if not public.is_current_role_owner(like_row.space_id,like_row.role) or like_row.status<>'pending' then
    raise exception using errcode='42501',message='MEL_LIKE_NOT_CANCELLABLE'; end if;
  select * into asset_row from public.mel_like_assets where mel_like_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  delete from public.mel_likes where id=p_id;
  return jsonb_build_object('id',p_id,'cancelled',true);
end;
$$;

create or replace function public.complete_mel_like_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare like_row public.mel_likes%rowtype; asset_row public.mel_like_assets%rowtype;
begin
  select * into like_row from public.mel_likes where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if not public.is_current_role_owner(like_row.space_id,like_row.role) then
    raise exception using errcode='42501',message='DELETE_FORBIDDEN'; end if;
  if like_row.deleted_at is not null then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if like_row.created_at<=now()-interval '24 hours' then
    raise exception using errcode='42501',message='DELETE_WINDOW_EXPIRED'; end if;
  select * into asset_row from public.mel_like_assets where mel_like_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  update public.mel_like_assets set deleted_at=now(),is_current=false where id=asset_row.id;
  update public.mel_likes set deleted_at=now() where id=p_id;
  return jsonb_build_object('id',p_id,'deleted',true);
end;
$$;

create or replace function public.can_upload_glimmer_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='glimmers' and exists(
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and g.status='pending' and g.deleted_at is null
      and public.is_current_role_owner(g.space_id,g.role)
  );
$$;

create or replace function public.can_delete_glimmer_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='glimmers' and exists(
    select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and g.deleted_at is null
      and public.is_current_role_owner(g.space_id,g.role)
      and g.created_at>now()-interval '24 hours'
  );
$$;

create or replace function public.can_upload_memory_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='memories' and (exists(
    select 1 from public.memory_assets a join public.memories m on m.id=a.memory_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and m.status='pending' and m.deleted_at is null
      and public.is_current_role_owner(m.space_id,m.role)
  ) or exists(
    select 1 from public.mel_like_assets a join public.mel_likes l on l.id=a.mel_like_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and l.status='pending' and l.deleted_at is null
      and public.is_current_role_owner(l.space_id,l.role)
  ));
$$;

create or replace function public.can_delete_memory_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='memories' and (exists(
    select 1 from public.memory_assets a join public.memories m on m.id=a.memory_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and m.deleted_at is null
      and public.is_current_role_owner(m.space_id,m.role)
      and m.created_at>now()-interval '24 hours'
  ) or exists(
    select 1 from public.mel_like_assets a join public.mel_likes l on l.id=a.mel_like_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and l.deleted_at is null
      and public.is_current_role_owner(l.space_id,l.role)
      and l.created_at>now()-interval '24 hours'
  ));
$$;

drop policy if exists glimmers_storage_delete_owner on storage.objects;
create policy glimmers_storage_delete_owner on storage.objects for delete to authenticated
using(bucket_id='glimmers' and public.can_delete_glimmer_object(bucket_id,name));

drop policy if exists memories_storage_delete_owner on storage.objects;
create policy memories_storage_delete_owner on storage.objects for delete to authenticated
using(bucket_id='memories' and public.can_delete_memory_object(bucket_id,name));

revoke all on function public.finalize_glimmer_upload(uuid),public.cancel_glimmer_upload(uuid),
  public.complete_glimmer_delete(uuid),
  public.list_glimmers_by_role(uuid,date,date,public.member_role,integer,date,timestamptz,uuid),
  public.finalize_memory_upload(uuid),public.cancel_memory_upload(uuid),public.complete_memory_delete(uuid),
  public.finalize_mel_like_upload(uuid),public.cancel_mel_like_upload(uuid),public.complete_mel_like_delete(uuid),
  public.can_upload_glimmer_object(text,text),public.can_delete_glimmer_object(text,text),
  public.can_upload_memory_object(text,text),public.can_delete_memory_object(text,text)
from public,anon;

grant execute on function public.finalize_glimmer_upload(uuid),public.cancel_glimmer_upload(uuid),
  public.complete_glimmer_delete(uuid),
  public.list_glimmers_by_role(uuid,date,date,public.member_role,integer,date,timestamptz,uuid),
  public.finalize_memory_upload(uuid),public.cancel_memory_upload(uuid),public.complete_memory_delete(uuid),
  public.finalize_mel_like_upload(uuid),public.cancel_mel_like_upload(uuid),public.complete_mel_like_delete(uuid),
  public.can_upload_glimmer_object(text,text),public.can_delete_glimmer_object(text,text),
  public.can_upload_memory_object(text,text),public.can_delete_memory_object(text,text)
to authenticated;
