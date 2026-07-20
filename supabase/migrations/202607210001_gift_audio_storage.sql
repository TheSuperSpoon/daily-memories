create table public.gift_assets (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  bucket text not null default 'gifts',
  object_key text not null,
  content_type text not null check (content_type = 'audio/mpeg'),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, object_key)
);

alter table public.gift_assets enable row level security;
revoke all on public.gift_assets from anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gifts','gifts',false,52428800,array['audio/mpeg'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_access_gift_audio(p_space_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.space_members sm
    join public.gift_progress gp on gp.space_id=sm.space_id and gp.role=sm.role
    where sm.space_id=p_space_id
      and sm.user_id=auth.uid()
      and sm.role='mel'::public.member_role
      and gp.gift_icons_found @> '{"home":true,"lighthouse":true,"gallery":true,"playlist":true,"ticket":true}'::jsonb
  );
$$;

create or replace function public.get_gift_audio(p_space_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare asset_row public.gift_assets%rowtype;
begin
  if not public.can_access_gift_audio(p_space_id) then
    raise exception using errcode='42501',message='GIFT_AUDIO_LOCKED';
  end if;
  select * into asset_row
  from public.gift_assets
  where space_id=p_space_id and id='in-loving-memory' and is_active;
  if not found then
    raise exception using errcode='P0002',message='GIFT_AUDIO_NOT_FOUND';
  end if;
  return jsonb_build_object(
    'id',asset_row.id,
    'title',asset_row.title,
    'sha256',asset_row.sha256,
    'asset',jsonb_build_object(
      'provider','supabase',
      'bucket',asset_row.bucket,
      'object_key',asset_row.object_key,
      'media_kind','audio',
      'content_type',asset_row.content_type,
      'size_bytes',asset_row.size_bytes,
      'sha256',asset_row.sha256
    )
  );
end;
$$;

create or replace function public.can_read_gift_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.gift_assets a
    where a.bucket=p_bucket and a.object_key=p_name and a.is_active
      and public.can_access_gift_audio(a.space_id)
  );
$$;

create policy gifts_storage_select_unlocked_mel
on storage.objects for select to authenticated
using(bucket_id='gifts' and public.can_read_gift_object(bucket_id,name));

revoke all on function public.can_access_gift_audio(uuid),
  public.get_gift_audio(uuid),public.can_read_gift_object(text,text) from public,anon;
grant execute on function public.can_access_gift_audio(uuid),
  public.get_gift_audio(uuid),public.can_read_gift_object(text,text) to authenticated;
