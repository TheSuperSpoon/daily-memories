create table public.memories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  body text not null default '' check (char_length(body) <= 2000),
  preferred_timezone text not null check (preferred_timezone in ('Asia/Shanghai','America/Los_Angeles')),
  status public.upload_status not null default 'pending',
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz
);

create table public.memory_assets (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  provider public.storage_provider not null default 'supabase',
  bucket text not null default 'memories',
  object_key text not null,
  media_kind text not null check (media_kind in ('image','audio')),
  content_type text not null check (content_type in (
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/ogg'
  )),
  size_bytes bigint not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider,bucket,object_key),
  check ((media_kind='image' and content_type like 'image/%' and size_bytes between 1 and 10485760)
    or (media_kind='audio' and content_type like 'audio/%' and size_bytes between 1 and 52428800))
);

create table public.memory_tags (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  normalized_name text not null check (char_length(normalized_name) between 1 and 24),
  display_name text not null check (char_length(display_name) between 1 and 24),
  last_used_at timestamptz not null default now(),
  unique (space_id,normalized_name)
);

create table public.memory_tag_links (
  memory_id uuid not null references public.memories(id) on delete cascade,
  tag_id uuid not null references public.memory_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (memory_id,tag_id)
);

create table public.mel_likes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  label text not null check (char_length(label) between 1 and 60),
  position integer not null check (position > 0),
  status public.upload_status not null default 'pending',
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz,
  unique (space_id,position)
);

create table public.mel_like_assets (
  id uuid primary key default gen_random_uuid(),
  mel_like_id uuid not null references public.mel_likes(id) on delete cascade,
  provider public.storage_provider not null default 'supabase',
  bucket text not null default 'memories',
  object_key text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/gif')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider,bucket,object_key)
);

create unique index memory_assets_one_current on public.memory_assets(memory_id)
  where is_current and deleted_at is null;
create index memories_month_timeline on public.memories(space_id,created_at desc,id desc)
  where status='ready' and deleted_at is null;
create index memory_tag_frequency on public.memory_tag_links(tag_id,created_at desc);
create unique index mel_like_assets_one_current on public.mel_like_assets(mel_like_id)
  where is_current and deleted_at is null;
create index mel_likes_order on public.mel_likes(space_id,position)
  where status='ready' and deleted_at is null;

alter table public.memories enable row level security;
alter table public.memory_assets enable row level security;
alter table public.memory_tags enable row level security;
alter table public.memory_tag_links enable row level security;
alter table public.mel_likes enable row level security;
alter table public.mel_like_assets enable row level security;

create policy memories_select_member on public.memories for select to authenticated
using (status='ready' and deleted_at is null and public.is_space_member(space_id));
create policy memory_assets_select_member on public.memory_assets for select to authenticated
using (deleted_at is null and exists (
  select 1 from public.memories m where m.id=memory_id and m.status='ready'
    and m.deleted_at is null and public.is_space_member(m.space_id)
));
create policy memory_tags_select_member on public.memory_tags for select to authenticated
using (public.is_space_member(space_id));
create policy memory_tag_links_select_member on public.memory_tag_links for select to authenticated
using (exists (select 1 from public.memories m where m.id=memory_id and m.status='ready'
  and m.deleted_at is null and public.is_space_member(m.space_id)));
create policy mel_likes_select_member on public.mel_likes for select to authenticated
using (status='ready' and deleted_at is null and public.is_space_member(space_id));
create policy mel_like_assets_select_member on public.mel_like_assets for select to authenticated
using (deleted_at is null and exists (
  select 1 from public.mel_likes l where l.id=mel_like_id and l.status='ready'
    and l.deleted_at is null and public.is_space_member(l.space_id)
));

grant select on public.memories,public.memory_assets,public.memory_tags,public.memory_tag_links,
  public.mel_likes,public.mel_like_assets to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('memories','memories',false,52428800,array[
  'image/jpeg','image/png','image/webp','image/gif',
  'audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/ogg'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.begin_memory_upload(
  p_space_id uuid,p_content_type text,p_size_bytes bigint,p_body text default '',
  p_preferred_timezone text default 'Asia/Shanghai',p_tags text[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.space_members%rowtype; record_row public.memories%rowtype;
  asset_row public.memory_assets%rowtype; raw_tag text; clean_tag text; normalized text;
  tag_row public.memory_tags%rowtype; extension text; kind text;
begin
  select * into m from public.space_members where space_id=p_space_id and user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if char_length(coalesce(p_body,''))>2000 then raise exception using errcode='22023',message='MEMORY_BODY_TOO_LONG'; end if;
  if p_preferred_timezone not in ('Asia/Shanghai','America/Los_Angeles') then
    raise exception using errcode='22023',message='INVALID_TIMEZONE';
  end if;
  if cardinality(coalesce(p_tags,'{}'))>10 then raise exception using errcode='22023',message='TOO_MANY_TAGS'; end if;
  kind:=case when p_content_type in ('image/jpeg','image/png','image/webp','image/gif') then 'image'
    when p_content_type in ('audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/ogg') then 'audio' end;
  if kind is null then raise exception using errcode='22023',message='INVALID_CONTENT_TYPE'; end if;
  if (kind='image' and p_size_bytes not between 1 and 10485760)
    or (kind='audio' and p_size_bytes not between 1 and 52428800) then
    raise exception using errcode='22023',message='INVALID_FILE_SIZE';
  end if;
  extension:=case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' when 'image/gif' then 'gif' when 'audio/mpeg' then 'mp3'
    when 'audio/mp4' then 'm4a' when 'audio/aac' then 'aac' when 'audio/wav' then 'wav'
    when 'audio/x-wav' then 'wav' when 'audio/ogg' then 'ogg' end;
  insert into public.memories(space_id,owner_id,role,body,preferred_timezone)
  values(p_space_id,auth.uid(),m.role,coalesce(p_body,''),p_preferred_timezone) returning * into record_row;
  insert into public.memory_assets(memory_id,provider,bucket,object_key,media_kind,content_type,size_bytes)
  values(record_row.id,'supabase','memories',format('spaces/%s/records/users/%s/%s/%s.%s',
    p_space_id,auth.uid(),to_char(record_row.created_at at time zone 'Asia/Shanghai','YYYY/MM'),record_row.id,extension),
    kind,p_content_type,p_size_bytes) returning * into asset_row;
  foreach raw_tag in array coalesce(p_tags,'{}') loop
    clean_tag:=btrim(regexp_replace(coalesce(raw_tag,''),'^#+',''));
    normalized:=lower(clean_tag);
    if clean_tag='' or char_length(clean_tag)>24 or clean_tag~'\s' then
      raise exception using errcode='22023',message='INVALID_TAG';
    end if;
    insert into public.memory_tags(space_id,normalized_name,display_name,last_used_at)
    values(p_space_id,normalized,clean_tag,record_row.created_at)
    on conflict(space_id,normalized_name) do update set last_used_at=excluded.last_used_at
    returning * into tag_row;
    insert into public.memory_tag_links(memory_id,tag_id) values(record_row.id,tag_row.id) on conflict do nothing;
  end loop;
  return jsonb_build_object('id',record_row.id,'asset',jsonb_build_object('id',asset_row.id,
    'provider',asset_row.provider,'bucket',asset_row.bucket,'object_key',asset_row.object_key,
    'media_kind',asset_row.media_kind,'content_type',asset_row.content_type,'size_bytes',asset_row.size_bytes));
end; $$;

create or replace function public.finalize_memory_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare record_row public.memories%rowtype; asset_row public.memory_assets%rowtype;
begin
  select * into record_row from public.memories where id=p_id for update;
  if not found or record_row.owner_id<>auth.uid() or record_row.deleted_at is not null then
    raise exception using errcode='42501',message='MEMORY_NOT_OWNED'; end if;
  if record_row.status='ready' then return to_jsonb(record_row); end if;
  select * into asset_row from public.memory_assets where memory_id=p_id and is_current and deleted_at is null;
  if not exists(select 1 from storage.objects o where o.bucket_id=asset_row.bucket and o.name=asset_row.object_key
    and o.owner_id=auth.uid()::text and o.metadata->>'mimetype'=asset_row.content_type) then
    raise exception using errcode='P0001',message='OBJECT_NOT_FOUND_OR_MISMATCH'; end if;
  update public.memories set status='ready',ready_at=coalesce(ready_at,now()) where id=p_id returning * into record_row;
  return to_jsonb(record_row);
end; $$;

create or replace function public.cancel_memory_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare record_row public.memories%rowtype; asset_row public.memory_assets%rowtype;
begin
  select * into record_row from public.memories where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'cancelled',true); end if;
  if record_row.owner_id<>auth.uid() or record_row.status<>'pending' then
    raise exception using errcode='42501',message='MEMORY_NOT_CANCELLABLE'; end if;
  select * into asset_row from public.memory_assets where memory_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  delete from public.memories where id=p_id;
  return jsonb_build_object('id',p_id,'cancelled',true);
end; $$;

create or replace function public.list_memories(p_space_id uuid,p_from date,p_to date,p_limit integer default 100)
returns table(memory jsonb) language plpgsql security definer set search_path='' as $$
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if p_from>p_to or p_to-p_from>62 then raise exception using errcode='22023',message='INVALID_DATE_RANGE'; end if;
  if p_limit<1 or p_limit>200 then raise exception using errcode='22023',message='INVALID_LIMIT'; end if;
  return query select jsonb_build_object('id',m.id,'space_id',m.space_id,'owner_id',m.owner_id,'role',m.role,
    'body',m.body,'preferred_timezone',m.preferred_timezone,'created_at',m.created_at,'ready_at',m.ready_at,
    'tags',coalesce((select jsonb_agg(t.display_name order by l.created_at,t.display_name)
      from public.memory_tag_links l join public.memory_tags t on t.id=l.tag_id where l.memory_id=m.id),'[]'::jsonb),
    'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,'object_key',a.object_key,
      'media_kind',a.media_kind,'content_type',a.content_type,'size_bytes',a.size_bytes))
  from public.memories m join public.memory_assets a on a.memory_id=m.id and a.is_current and a.deleted_at is null
  where m.space_id=p_space_id and m.status='ready' and m.deleted_at is null
    and (m.created_at at time zone 'Asia/Shanghai')::date between p_from and p_to
  order by m.created_at desc,m.id desc limit p_limit;
end; $$;

create or replace function public.get_latest_memory_month(p_space_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  select to_char(max(created_at) at time zone 'Asia/Shanghai','YYYY-MM') into result
  from public.memories where space_id=p_space_id and status='ready' and deleted_at is null;
  return result;
end; $$;

create or replace function public.list_top_memory_tags(p_space_id uuid,p_limit integer default 5)
returns table(tag jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if p_limit<1 or p_limit>20 then raise exception using errcode='22023',message='INVALID_LIMIT'; end if;
  return query select jsonb_build_object('name',t.display_name,'count',count(*),'last_used_at',max(m.created_at))
  from public.memory_tags t join public.memory_tag_links l on l.tag_id=t.id
  join public.memories m on m.id=l.memory_id and m.status='ready' and m.deleted_at is null
  where t.space_id=p_space_id group by t.id,t.display_name
  order by count(*) desc,max(m.created_at) desc,t.display_name limit p_limit;
end; $$;

create or replace function public.complete_memory_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare record_row public.memories%rowtype; asset_row public.memory_assets%rowtype;
begin
  select * into record_row from public.memories where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if record_row.owner_id<>auth.uid() then raise exception using errcode='42501',message='DELETE_FORBIDDEN'; end if;
  if record_row.deleted_at is not null then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if record_row.created_at<=now()-interval '24 hours' then raise exception using errcode='42501',message='DELETE_WINDOW_EXPIRED'; end if;
  select * into asset_row from public.memory_assets where memory_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  update public.memory_assets set deleted_at=now(),is_current=false where id=asset_row.id;
  update public.memories set deleted_at=now() where id=p_id;
  return jsonb_build_object('id',p_id,'deleted',true);
end; $$;

create or replace function public.begin_mel_like_upload(p_space_id uuid,p_content_type text,p_size_bytes bigint,p_label text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_row public.space_members%rowtype; like_row public.mel_likes%rowtype;
  asset_row public.mel_like_assets%rowtype; extension text; next_position integer;
begin
  select * into member_row from public.space_members where space_id=p_space_id and user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if char_length(btrim(coalesce(p_label,''))) not between 1 and 60 then
    raise exception using errcode='22023',message='INVALID_MEL_LIKE_LABEL'; end if;
  if p_content_type not in ('image/jpeg','image/png','image/webp','image/gif') then
    raise exception using errcode='22023',message='INVALID_CONTENT_TYPE'; end if;
  if p_size_bytes not between 1 and 10485760 then raise exception using errcode='22023',message='INVALID_FILE_SIZE'; end if;
  perform 1 from public.spaces where id=p_space_id for update;
  select coalesce(max(position),0)+1 into next_position from public.mel_likes where space_id=p_space_id;
  insert into public.mel_likes(space_id,owner_id,role,label,position)
  values(p_space_id,auth.uid(),member_row.role,btrim(p_label),next_position) returning * into like_row;
  extension:=case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' when 'image/gif' then 'gif' end;
  insert into public.mel_like_assets(mel_like_id,provider,bucket,object_key,content_type,size_bytes)
  values(like_row.id,'supabase','memories',format('spaces/%s/mel-likes/users/%s/%s.%s',
    p_space_id,auth.uid(),like_row.id,extension),p_content_type,p_size_bytes) returning * into asset_row;
  return jsonb_build_object('id',like_row.id,'asset',jsonb_build_object('id',asset_row.id,
    'provider',asset_row.provider,'bucket',asset_row.bucket,'object_key',asset_row.object_key,
    'media_kind','image','content_type',asset_row.content_type,'size_bytes',asset_row.size_bytes));
end; $$;

create or replace function public.finalize_mel_like_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare like_row public.mel_likes%rowtype; asset_row public.mel_like_assets%rowtype;
begin
  select * into like_row from public.mel_likes where id=p_id for update;
  if not found or like_row.owner_id<>auth.uid() or like_row.deleted_at is not null then
    raise exception using errcode='42501',message='MEL_LIKE_NOT_OWNED'; end if;
  if like_row.status='ready' then return to_jsonb(like_row); end if;
  select * into asset_row from public.mel_like_assets where mel_like_id=p_id and is_current and deleted_at is null;
  if not exists(select 1 from storage.objects o where o.bucket_id=asset_row.bucket and o.name=asset_row.object_key
    and o.owner_id=auth.uid()::text and o.metadata->>'mimetype'=asset_row.content_type) then
    raise exception using errcode='P0001',message='OBJECT_NOT_FOUND_OR_MISMATCH'; end if;
  update public.mel_likes set status='ready',ready_at=coalesce(ready_at,now()) where id=p_id returning * into like_row;
  return to_jsonb(like_row);
end; $$;

create or replace function public.cancel_mel_like_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare like_row public.mel_likes%rowtype; asset_row public.mel_like_assets%rowtype;
begin
  select * into like_row from public.mel_likes where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'cancelled',true); end if;
  if like_row.owner_id<>auth.uid() or like_row.status<>'pending' then
    raise exception using errcode='42501',message='MEL_LIKE_NOT_CANCELLABLE'; end if;
  select * into asset_row from public.mel_like_assets where mel_like_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  delete from public.mel_likes where id=p_id;
  return jsonb_build_object('id',p_id,'cancelled',true);
end; $$;

create or replace function public.list_mel_likes(p_space_id uuid)
returns table(mel_like jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  return query select jsonb_build_object('id',l.id,'space_id',l.space_id,'owner_id',l.owner_id,'role',l.role,
    'label',l.label,'position',l.position,'created_at',l.created_at,
    'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,'object_key',a.object_key,
      'media_kind','image','content_type',a.content_type,'size_bytes',a.size_bytes))
  from public.mel_likes l join public.mel_like_assets a on a.mel_like_id=l.id and a.is_current and a.deleted_at is null
  where l.space_id=p_space_id and l.status='ready' and l.deleted_at is null order by l.position;
end; $$;

create or replace function public.complete_mel_like_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare like_row public.mel_likes%rowtype; asset_row public.mel_like_assets%rowtype;
begin
  select * into like_row from public.mel_likes where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if like_row.owner_id<>auth.uid() then raise exception using errcode='42501',message='DELETE_FORBIDDEN'; end if;
  if like_row.deleted_at is not null then return jsonb_build_object('id',p_id,'deleted',true); end if;
  if like_row.created_at<=now()-interval '24 hours' then raise exception using errcode='42501',message='DELETE_WINDOW_EXPIRED'; end if;
  select * into asset_row from public.mel_like_assets where mel_like_id=p_id and is_current and deleted_at is null;
  if exists(select 1 from storage.objects where bucket_id=asset_row.bucket and name=asset_row.object_key) then
    raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  update public.mel_like_assets set deleted_at=now(),is_current=false where id=asset_row.id;
  update public.mel_likes set deleted_at=now() where id=p_id;
  return jsonb_build_object('id',p_id,'deleted',true);
end; $$;

create or replace function public.can_upload_memory_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='memories' and (exists(
    select 1 from public.memory_assets a join public.memories m on m.id=a.memory_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and m.status='pending' and m.deleted_at is null and m.owner_id=auth.uid()
  ) or exists(
    select 1 from public.mel_like_assets a join public.mel_likes l on l.id=a.mel_like_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and l.status='pending' and l.deleted_at is null and l.owner_id=auth.uid()
  ));
$$;

create or replace function public.can_read_memory_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='memories' and (exists(
    select 1 from public.memory_assets a join public.memories m on m.id=a.memory_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and m.status='ready' and m.deleted_at is null and public.is_space_member(m.space_id)
  ) or exists(
    select 1 from public.mel_like_assets a join public.mel_likes l on l.id=a.mel_like_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and l.status='ready' and l.deleted_at is null and public.is_space_member(l.space_id)
  ));
$$;

create or replace function public.can_delete_memory_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket='memories' and (exists(
    select 1 from public.memory_assets a join public.memories m on m.id=a.memory_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and m.deleted_at is null and m.owner_id=auth.uid()
      and m.created_at>now()-interval '24 hours'
  ) or exists(
    select 1 from public.mel_like_assets a join public.mel_likes l on l.id=a.mel_like_id
    where a.bucket=p_bucket and a.object_key=p_name and a.provider='supabase' and a.is_current
      and a.deleted_at is null and l.deleted_at is null and l.owner_id=auth.uid()
      and l.created_at>now()-interval '24 hours'
  ));
$$;

create policy memories_storage_insert_owner on storage.objects for insert to authenticated
with check(bucket_id='memories' and owner_id=auth.uid()::text and public.can_upload_memory_object(bucket_id,name));
create policy memories_storage_select_member on storage.objects for select to authenticated
using(bucket_id='memories' and public.can_read_memory_object(bucket_id,name));
create policy memories_storage_delete_owner on storage.objects for delete to authenticated
using(bucket_id='memories' and owner_id=auth.uid()::text and public.can_delete_memory_object(bucket_id,name));

revoke all on function public.begin_memory_upload(uuid,text,bigint,text,text,text[]),
  public.finalize_memory_upload(uuid),public.cancel_memory_upload(uuid),public.list_memories(uuid,date,date,integer),
  public.get_latest_memory_month(uuid),public.list_top_memory_tags(uuid,integer),public.complete_memory_delete(uuid),
  public.begin_mel_like_upload(uuid,text,bigint,text),public.finalize_mel_like_upload(uuid),
  public.cancel_mel_like_upload(uuid),public.list_mel_likes(uuid),public.complete_mel_like_delete(uuid),
  public.can_upload_memory_object(text,text),public.can_read_memory_object(text,text),
  public.can_delete_memory_object(text,text) from public,anon;

grant execute on function public.begin_memory_upload(uuid,text,bigint,text,text,text[]),
  public.finalize_memory_upload(uuid),public.cancel_memory_upload(uuid),public.list_memories(uuid,date,date,integer),
  public.get_latest_memory_month(uuid),public.list_top_memory_tags(uuid,integer),public.complete_memory_delete(uuid),
  public.begin_mel_like_upload(uuid,text,bigint,text),public.finalize_mel_like_upload(uuid),
  public.cancel_mel_like_upload(uuid),public.list_mel_likes(uuid),public.complete_mel_like_delete(uuid),
  public.can_upload_memory_object(text,text),public.can_read_memory_object(text,text),
  public.can_delete_memory_object(text,text) to authenticated;
