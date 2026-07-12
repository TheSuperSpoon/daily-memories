create or replace function public.get_glimmer_dashboard(p_space_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  member_record public.space_members%rowtype;
  member_name text;
  space_timezone text;
  local_today date;
  complete_days_total integer;
  current_streak integer;
begin
  select * into member_record from public.space_members
  where space_id=p_space_id and user_id=auth.uid();
  if not found then
    raise exception using errcode='42501',message='NOT_SPACE_MEMBER';
  end if;

  select p.display_name,s.timezone into member_name,space_timezone
  from public.profiles p cross join public.spaces s
  where p.user_id=auth.uid() and s.id=p_space_id;
  local_today:=(now() at time zone space_timezone)::date;

  with complete_days as (
    select g.glimmer_date
    from public.glimmers g
    where g.space_id=p_space_id and g.status='ready' and g.deleted_at is null
      and public.is_glimmer_accounted(g)
    group by g.glimmer_date having count(distinct g.role)=2
  ) select count(*)::integer into complete_days_total from complete_days;

  with complete_days as (
    select g.glimmer_date
    from public.glimmers g
    where g.space_id=p_space_id and g.status='ready' and g.deleted_at is null
      and public.is_glimmer_accounted(g)
    group by g.glimmer_date having count(distinct g.role)=2
  ), grouped as (
    select glimmer_date,glimmer_date-(row_number() over(order by glimmer_date))::integer grp
    from complete_days
  ) select coalesce(count(*),0)::integer into current_streak
    from grouped where grp=(select grp from grouped where glimmer_date=local_today);

  return jsonb_build_object(
    'user_id',auth.uid(),
    'role',member_record.role,
    'display_name',member_name,
    'timezone',space_timezone,
    'server_now',now(),
    'local_today',local_today,
    'reward_balance',public.reward_balance(p_space_id),
    'current_streak',current_streak,
    'complete_days_total',complete_days_total
  );
end; $$;

revoke all on function public.get_glimmer_dashboard(uuid) from public,anon;
grant execute on function public.get_glimmer_dashboard(uuid) to authenticated;
