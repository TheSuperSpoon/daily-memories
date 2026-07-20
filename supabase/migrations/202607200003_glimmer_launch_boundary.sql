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
  select * into s from public.spaces where id=p_space_id for share;
  local_today:=(now() at time zone s.timezone)::date;
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
  if p_preferred_timezone not in ('Asia/Shanghai','America/Los_Angeles') then
    raise exception using errcode='22023',message='INVALID_TIMEZONE';
  end if;
  ext:=case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/gif' then 'gif' end;
  insert into public.glimmers(space_id,owner_id,role,glimmer_date,note,mood,preferred_timezone)
  values(p_space_id,auth.uid(),m.role,p_date,coalesce(p_note,''),p_mood,p_preferred_timezone) returning * into g;
  insert into public.glimmer_assets(glimmer_id,provider,bucket,object_key,content_type,size_bytes)
  values(g.id,s.default_storage_provider,'glimmers',format('spaces/%s/users/%s/%s/%s/%s.%s',
    p_space_id,auth.uid(),to_char(p_date,'YYYY'),to_char(p_date,'MM'),g.id,ext),p_content_type,p_size_bytes) returning * into a;
  return jsonb_build_object('id',g.id,'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,
    'object_key',a.object_key,'content_type',a.content_type,'size_bytes',a.size_bytes));
exception when unique_violation then raise exception using errcode='23505',message='DAILY_GLIMMER_EXISTS';
end; $$;

revoke all on function public.begin_glimmer_upload(uuid,date,text,bigint,text,text,text) from public, anon;
grant execute on function public.begin_glimmer_upload(uuid,date,text,bigint,text,text,text) to authenticated;
