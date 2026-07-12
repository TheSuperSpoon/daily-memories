create or replace function public.begin_glimmer_upload(
  p_space_id uuid, p_date date, p_content_type text, p_size_bytes bigint, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.space_members%rowtype; s public.spaces%rowtype; g public.glimmers%rowtype;
  a public.glimmer_assets%rowtype; ext text;
begin
  select * into m from public.space_members where space_id = p_space_id and user_id = auth.uid();
  if not found then raise exception using errcode='42501', message='NOT_SPACE_MEMBER'; end if;
  select * into s from public.spaces where id = p_space_id for share;
  if p_date <> (now() at time zone s.timezone)::date then
    raise exception using errcode='22023', message='INVALID_GLIMMER_DATE';
  end if;
  if p_content_type not in ('image/jpeg','image/png','image/webp','image/gif') then
    raise exception using errcode='22023', message='INVALID_CONTENT_TYPE';
  end if;
  if p_size_bytes not between 1 and 10485760 then
    raise exception using errcode='22023', message='INVALID_FILE_SIZE';
  end if;
  if char_length(coalesce(p_note,'')) > 500 then
    raise exception using errcode='22023', message='NOTE_TOO_LONG';
  end if;
  ext := case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' when 'image/gif' then 'gif' end;
  insert into public.glimmers(space_id,owner_id,role,glimmer_date,note)
  values(p_space_id,auth.uid(),m.role,p_date,coalesce(p_note,'')) returning * into g;
  insert into public.glimmer_assets(glimmer_id,provider,bucket,object_key,content_type,size_bytes)
  values(g.id,s.default_storage_provider,'glimmers',format('spaces/%s/users/%s/%s/%s/%s.%s',
    p_space_id,auth.uid(),to_char(p_date,'YYYY'),to_char(p_date,'MM'),g.id,ext),p_content_type,p_size_bytes)
  returning * into a;
  return jsonb_build_object('id',g.id,'asset',jsonb_build_object('id',a.id,'provider',a.provider,
    'bucket',a.bucket,'object_key',a.object_key,'content_type',a.content_type,'size_bytes',a.size_bytes));
exception when unique_violation then
  raise exception using errcode='23505', message='DAILY_GLIMMER_EXISTS';
end; $$;

create or replace function public.finalize_glimmer_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.glimmers%rowtype; a public.glimmer_assets%rowtype;
begin
  select * into g from public.glimmers where id=p_id for update;
  if not found or g.owner_id <> auth.uid() or g.deleted_at is not null then
    raise exception using errcode='42501', message='GLIMMER_NOT_OWNED';
  end if;
  if g.status='ready' then return to_jsonb(g); end if;
  select * into a from public.glimmer_assets where glimmer_id=g.id and is_current and deleted_at is null;
  if a.provider <> 'supabase' or not exists (
    select 1 from storage.objects o where o.bucket_id=a.bucket and o.name=a.object_key
      and o.owner_id=auth.uid()::text and o.metadata->>'mimetype'=a.content_type
  ) then raise exception using errcode='P0001', message='OBJECT_NOT_FOUND_OR_MISMATCH'; end if;
  update public.glimmers set status='ready',ready_at=coalesce(ready_at,now()) where id=g.id returning * into g;
  return to_jsonb(g);
end; $$;

create or replace function public.list_glimmers(
  p_space_id uuid, p_from date, p_to date, p_owner_id uuid default null,
  p_limit integer default 50, p_cursor_date date default null,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns table(glimmer jsonb) language plpgsql security definer set search_path='' as $$
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if p_from>p_to or p_to-p_from>366 then raise exception using errcode='22023',message='INVALID_DATE_RANGE'; end if;
  if p_limit<1 or p_limit>100 then raise exception using errcode='22023',message='INVALID_LIMIT'; end if;
  return query select jsonb_build_object('id',g.id,'space_id',g.space_id,'owner_id',g.owner_id,
    'role',g.role,'glimmer_date',g.glimmer_date,'note',g.note,'created_at',g.created_at,
    'ready_at',g.ready_at,'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,
    'object_key',a.object_key,'content_type',a.content_type,'size_bytes',a.size_bytes))
  from public.glimmers g join public.glimmer_assets a on a.glimmer_id=g.id and a.is_current and a.deleted_at is null
  where g.space_id=p_space_id and g.status='ready' and g.deleted_at is null
    and g.glimmer_date between p_from and p_to and (p_owner_id is null or g.owner_id=p_owner_id)
    and (p_cursor_date is null or (g.glimmer_date,g.created_at,g.id)<(p_cursor_date,p_cursor_created_at,p_cursor_id))
  order by g.glimmer_date desc,g.created_at desc,g.id desc limit p_limit;
end; $$;

create or replace function public.complete_glimmer_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.glimmers%rowtype; a public.glimmer_assets%rowtype;
begin
  select * into g from public.glimmers where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if g.owner_id<>auth.uid() then raise exception using errcode='42501',message='DELETE_FORBIDDEN'; end if;
  if g.deleted_at is not null then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if g.created_at <= now()-interval '24 hours' then raise exception using errcode='42501',message='DELETE_WINDOW_EXPIRED'; end if;
  select * into a from public.glimmer_assets where glimmer_id=g.id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=a.bucket and name=a.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS';
  end if;
  update public.glimmer_assets set deleted_at=now(),is_current=false where id=a.id;
  update public.glimmers set deleted_at=now() where id=g.id;
  return jsonb_build_object('id',p_id,'deleted',true);
end; $$;

revoke all on function public.begin_glimmer_upload(uuid,date,text,bigint,text) from public;
revoke all on function public.finalize_glimmer_upload(uuid) from public;
revoke all on function public.list_glimmers(uuid,date,date,uuid,integer,date,timestamptz,uuid) from public;
revoke all on function public.complete_glimmer_delete(uuid) from public;
grant execute on function public.begin_glimmer_upload(uuid,date,text,bigint,text),
 public.finalize_glimmer_upload(uuid), public.list_glimmers(uuid,date,date,uuid,integer,date,timestamptz,uuid),
 public.complete_glimmer_delete(uuid) to authenticated;
