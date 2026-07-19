alter table public.profiles
  add column if not exists gift_icons_found jsonb not null default '{}'::jsonb;

drop function if exists public.get_gift_icons_found();
drop function if exists public.collect_gift_icon(text);

create or replace function public.get_gift_icons_found(p_space_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare gift_state jsonb;
begin
  if not exists (
    select 1 from public.space_members sm
    where sm.space_id=p_space_id and sm.user_id=auth.uid() and sm.role='mel'
  ) then
    raise exception using errcode='42501', message='FEATURE_FORBIDDEN';
  end if;

  select coalesce(p.gift_icons_found, '{}'::jsonb) into gift_state
  from public.profiles p where p.user_id=auth.uid();
  if gift_state is null then
    raise exception using errcode='42501', message='PROFILE_NOT_FOUND';
  end if;
  return gift_state;
end;
$$;

create or replace function public.collect_gift_icon(p_space_id uuid, p_gift_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare next_state jsonb;
begin
  if not exists (
    select 1 from public.space_members sm
    where sm.space_id=p_space_id and sm.user_id=auth.uid() and sm.role='mel'
  ) then
    raise exception using errcode='42501', message='FEATURE_FORBIDDEN';
  end if;

  if p_gift_id not in ('home','lighthouse','gallery','playlist','ticket') then
    raise exception using errcode='22023', message='INVALID_GIFT_ID';
  end if;

  update public.profiles
  set gift_icons_found = coalesce(gift_icons_found, '{}'::jsonb) || jsonb_build_object(p_gift_id, true)
  where user_id = auth.uid()
  returning gift_icons_found into next_state;

  if next_state is null then
    raise exception using errcode='42501', message='PROFILE_NOT_FOUND';
  end if;

  return next_state;
end;
$$;

revoke all on function public.get_gift_icons_found(uuid) from public, anon;
revoke all on function public.collect_gift_icon(uuid,text) from public, anon;
grant execute on function public.get_gift_icons_found(uuid) to authenticated;
grant execute on function public.collect_gift_icon(uuid,text) to authenticated;
