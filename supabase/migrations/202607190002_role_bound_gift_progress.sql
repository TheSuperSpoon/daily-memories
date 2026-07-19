create table public.gift_progress (
  space_id uuid not null references public.spaces(id) on delete cascade,
  role public.member_role not null check (role = 'mel'),
  gift_icons_found jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (space_id, role),
  constraint gift_progress_valid_state check (
    jsonb_typeof(gift_icons_found) = 'object'
    and gift_icons_found <@ '{"home":true,"lighthouse":true,"gallery":true,"playlist":true,"ticket":true}'::jsonb
  )
);

insert into public.gift_progress(space_id,role,gift_icons_found)
select sm.space_id,sm.role,
  jsonb_strip_nulls(jsonb_build_object(
    'home',case when p.gift_icons_found->>'home'='true' then true end,
    'lighthouse',case when p.gift_icons_found->>'lighthouse'='true' then true end,
    'gallery',case when p.gift_icons_found->>'gallery'='true' then true end,
    'playlist',case when p.gift_icons_found->>'playlist'='true' then true end,
    'ticket',case when p.gift_icons_found->>'ticket'='true' then true end
  ))
from public.space_members sm
join public.profiles p on p.user_id=sm.user_id
where sm.role='mel'
on conflict(space_id,role) do update
set gift_icons_found=excluded.gift_icons_found,updated_at=now();

alter table public.gift_progress enable row level security;
revoke all on public.gift_progress from anon,authenticated;

create or replace function public.get_gift_icons_found(p_space_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member_role public.member_role;
declare gift_state jsonb;
begin
  select sm.role into member_role from public.space_members sm
  where sm.space_id=p_space_id and sm.user_id=auth.uid();
  if member_role is distinct from 'mel'::public.member_role then
    raise exception using errcode='42501',message='FEATURE_FORBIDDEN';
  end if;

  select gp.gift_icons_found into gift_state from public.gift_progress gp
  where gp.space_id=p_space_id and gp.role=member_role;
  return coalesce(gift_state,'{}'::jsonb);
end;
$$;

create or replace function public.collect_gift_icon(p_space_id uuid,p_gift_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role public.member_role;
declare next_state jsonb;
begin
  select sm.role into member_role from public.space_members sm
  where sm.space_id=p_space_id and sm.user_id=auth.uid();
  if member_role is distinct from 'mel'::public.member_role then
    raise exception using errcode='42501',message='FEATURE_FORBIDDEN';
  end if;
  if p_gift_id not in ('home','lighthouse','gallery','playlist','ticket') then
    raise exception using errcode='22023',message='INVALID_GIFT_ID';
  end if;

  insert into public.gift_progress(space_id,role,gift_icons_found)
  values(p_space_id,member_role,jsonb_build_object(p_gift_id,true))
  on conflict(space_id,role) do update
  set gift_icons_found=public.gift_progress.gift_icons_found || jsonb_build_object(p_gift_id,true),
      updated_at=now()
  returning gift_icons_found into next_state;
  return next_state;
end;
$$;

revoke all on function public.get_gift_icons_found(uuid) from public,anon;
revoke all on function public.collect_gift_icon(uuid,text) from public,anon;
grant execute on function public.get_gift_icons_found(uuid) to authenticated;
grant execute on function public.collect_gift_icon(uuid,text) to authenticated;

alter table public.profiles drop column gift_icons_found;
