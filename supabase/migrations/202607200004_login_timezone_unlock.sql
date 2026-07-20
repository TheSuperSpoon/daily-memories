create or replace function public.begin_glimmer_upload(
  p_space_id uuid, p_date date, p_content_type text, p_size_bytes bigint,
  p_note text default '', p_mood text default null,
  p_preferred_timezone text default 'Asia/Shanghai'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.space_members%rowtype; s public.spaces%rowtype; g public.glimmers%rowtype;
  a public.glimmer_assets%rowtype; ext text; local_today date;
begin
  select * into m from public.space_members where space_id=p_space_id and user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if p_preferred_timezone not in ('Asia/Shanghai','America/Los_Angeles') then
    raise exception using errcode='22023',message='INVALID_TIMEZONE';
  end if;
  select * into s from public.spaces where id=p_space_id for share;
  local_today:=(now() at time zone p_preferred_timezone)::date;
  if p_date < date '2026-07-20' or p_date>local_today
    or (p_date<local_today and public.reward_balance(p_space_id)<=0) then
    raise exception using errcode='22023',message='INVALID_GLIMMER_DATE';
  end if;
  if p_content_type not in ('image/jpeg','image/png','image/webp','image/gif') then
    raise exception using errcode='22023',message='INVALID_CONTENT_TYPE';
  end if;
  if p_size_bytes not between 1 and 10485760 then
    raise exception using errcode='22023',message='INVALID_FILE_SIZE';
  end if;
  if char_length(coalesce(p_note,''))>500 then
    raise exception using errcode='22023',message='NOTE_TOO_LONG';
  end if;
  if p_mood is not null and p_mood not in ('happy','neutral','sad','tired','loved') then
    raise exception using errcode='22023',message='INVALID_MOOD';
  end if;
  ext:=case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' when 'image/gif' then 'gif' end;
  insert into public.glimmers(space_id,owner_id,role,glimmer_date,note,mood,preferred_timezone)
  values(p_space_id,auth.uid(),m.role,p_date,coalesce(p_note,''),p_mood,p_preferred_timezone) returning * into g;
  insert into public.glimmer_assets(glimmer_id,provider,bucket,object_key,content_type,size_bytes)
  values(g.id,s.default_storage_provider,'glimmers',format('spaces/%s/users/%s/%s/%s/%s.%s',
    p_space_id,auth.uid(),to_char(p_date,'YYYY'),to_char(p_date,'MM'),g.id,ext),p_content_type,p_size_bytes) returning * into a;
  return jsonb_build_object('id',g.id,'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,
    'object_key',a.object_key,'content_type',a.content_type,'size_bytes',a.size_bytes));
exception when unique_violation then raise exception using errcode='23505',message='DAILY_GLIMMER_EXISTS';
end; $$;

drop function if exists public.get_glimmer_dashboard(uuid);

create function public.get_glimmer_dashboard(
  p_space_id uuid,
  p_timezone text default 'Asia/Shanghai'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  member_record public.space_members%rowtype;
  member_name text;
  local_today date;
  complete_days_total integer;
  current_streak integer;
begin
  select * into member_record from public.space_members
  where space_id=p_space_id and user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if p_timezone not in ('Asia/Shanghai','America/Los_Angeles') then
    raise exception using errcode='22023',message='INVALID_TIMEZONE';
  end if;
  select p.display_name into member_name from public.profiles p where p.user_id=auth.uid();
  local_today:=(now() at time zone p_timezone)::date;

  with complete_days as (
    select g.glimmer_date from public.glimmers g
    where g.space_id=p_space_id and g.status='ready' and g.deleted_at is null
      and public.is_glimmer_accounted(g)
    group by g.glimmer_date having count(distinct g.role)=2
  ) select count(*)::integer into complete_days_total from complete_days;

  with complete_days as (
    select g.glimmer_date from public.glimmers g
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
    'timezone',p_timezone,
    'preferred_timezone',p_timezone,
    'server_now',now(),
    'local_today',local_today,
    'reward_balance',public.reward_balance(p_space_id),
    'current_streak',current_streak,
    'complete_days_total',complete_days_total
  );
end; $$;

revoke all on function public.begin_glimmer_upload(uuid,date,text,bigint,text,text,text) from public,anon;
grant execute on function public.begin_glimmer_upload(uuid,date,text,bigint,text,text,text) to authenticated;
revoke all on function public.get_glimmer_dashboard(uuid,text) from public,anon;
grant execute on function public.get_glimmer_dashboard(uuid,text) to authenticated;
