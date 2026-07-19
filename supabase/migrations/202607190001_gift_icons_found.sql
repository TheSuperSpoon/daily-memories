alter table public.profiles
  add column if not exists gift_icons_found jsonb not null default '{}'::jsonb;

create or replace function public.get_gift_icons_found()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(p.gift_icons_found, '{}'::jsonb)
  from public.profiles p
  where p.user_id = auth.uid();
$$;

create or replace function public.collect_gift_icon(p_gift_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare next_state jsonb;
begin
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

revoke all on function public.get_gift_icons_found() from public, anon;
revoke all on function public.collect_gift_icon(text) from public, anon;
grant execute on function public.get_gift_icons_found() to authenticated;
grant execute on function public.collect_gift_icon(text) to authenticated;
