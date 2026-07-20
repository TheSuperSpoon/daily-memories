create or replace function public.can_access_gift_audio(p_space_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.space_members sm
    join public.gift_progress gp on gp.space_id=sm.space_id and gp.role=sm.role
    where sm.space_id=p_space_id
      and sm.user_id=auth.uid()
      and sm.role='mel'::public.member_role
      and gp.gift_icons_found<>'{}'::jsonb
  );
$$;

revoke all on function public.can_access_gift_audio(uuid) from public,anon;
grant execute on function public.can_access_gift_audio(uuid) to authenticated;
