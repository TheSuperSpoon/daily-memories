create or replace function public.reward_balance(p_space_id uuid)
returns integer language sql stable security definer set search_path='' as $$
  select coalesce(sum(amount),0)::integer from public.reward_ledger where space_id=p_space_id;
$$;

create or replace function public.grant_streak_rewards(p_space_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare end_date date; start_date date; day_count integer; milestone integer; inserted_count integer:=0;
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  perform 1 from public.spaces where id=p_space_id for update;
  with complete_days as (
    select glimmer_date from public.glimmers where space_id=p_space_id and status='ready' and deleted_at is null
    group by glimmer_date having count(distinct role)=2
  ) select max(glimmer_date) into end_date from complete_days;
  if end_date is null then return jsonb_build_object('awarded',0,'balance',public.reward_balance(p_space_id)); end if;
  with complete_days as (
    select glimmer_date from public.glimmers where space_id=p_space_id and status='ready' and deleted_at is null
    group by glimmer_date having count(distinct role)=2
  ), ranked as (
    select glimmer_date, glimmer_date-(row_number() over(order by glimmer_date))::integer grp from complete_days
  ) select min(glimmer_date),count(*)::integer into start_date,day_count from ranked
    where grp=(select grp from ranked where glimmer_date=end_date) group by grp;
  for milestone in select generate_series(10,(day_count/10)*10,10) loop
    insert into public.reward_ledger(space_id,event_type,amount,streak_run_start,streak_milestone,idempotency_key)
    values(p_space_id,'streak_earned',1,start_date,milestone,
      format('streak:%s:%s:%s',p_space_id,start_date,milestone)) on conflict do nothing;
    inserted_count:=inserted_count+case when found then 1 else 0 end;
  end loop;
  return jsonb_build_object('awarded',inserted_count,'balance',public.reward_balance(p_space_id),
    'run_start',start_date,'days',day_count);
end; $$;

create or replace function public.complete_retro_glimmer(p_space_id uuid,p_target_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tz text; complete_count integer; current_balance integer;
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  select timezone into tz from public.spaces where id=p_space_id for update;
  if p_target_date >= (now() at time zone tz)::date then
    raise exception using errcode='22023',message='RETRO_DATE_MUST_BE_PAST';
  end if;
  select count(distinct role) into complete_count from public.glimmers
    where space_id=p_space_id and glimmer_date=p_target_date and status='ready' and deleted_at is null;
  if complete_count<>2 then raise exception using errcode='P0001',message='RETRO_DATE_INCOMPLETE'; end if;
  if exists(select 1 from public.reward_ledger where space_id=p_space_id and target_date=p_target_date and event_type='retro_spent') then
    return jsonb_build_object('spent',false,'already_completed',true,'balance',public.reward_balance(p_space_id));
  end if;
  current_balance:=public.reward_balance(p_space_id);
  if current_balance<=0 then raise exception using errcode='P0001',message='INSUFFICIENT_REWARD_BALANCE'; end if;
  insert into public.reward_ledger(space_id,event_type,amount,target_date,actor_id,idempotency_key)
  values(p_space_id,'retro_spent',-1,p_target_date,auth.uid(),format('retro:%s:%s',p_space_id,p_target_date));
  return jsonb_build_object('spent',true,'balance',current_balance-1);
end; $$;

revoke all on function public.reward_balance(uuid),public.grant_streak_rewards(uuid),
 public.complete_retro_glimmer(uuid,date) from public;
grant execute on function public.reward_balance(uuid),public.grant_streak_rewards(uuid),
 public.complete_retro_glimmer(uuid,date) to authenticated;

create or replace function public.begin_glimmer_upload(
  p_space_id uuid, p_date date, p_content_type text, p_size_bytes bigint, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.space_members%rowtype; s public.spaces%rowtype; g public.glimmers%rowtype;
  a public.glimmer_assets%rowtype; ext text; local_today date;
begin
  select * into m from public.space_members where space_id=p_space_id and user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  select * into s from public.spaces where id=p_space_id for share;
  local_today:=(now() at time zone s.timezone)::date;
  if p_date>local_today or (p_date<local_today and public.reward_balance(p_space_id)<=0) then
    raise exception using errcode='22023',message='INVALID_GLIMMER_DATE'; end if;
  if p_content_type not in ('image/jpeg','image/png','image/webp','image/gif') then raise exception using errcode='22023',message='INVALID_CONTENT_TYPE'; end if;
  if p_size_bytes not between 1 and 10485760 then raise exception using errcode='22023',message='INVALID_FILE_SIZE'; end if;
  if char_length(coalesce(p_note,''))>500 then raise exception using errcode='22023',message='NOTE_TOO_LONG'; end if;
  ext:=case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/gif' then 'gif' end;
  insert into public.glimmers(space_id,owner_id,role,glimmer_date,note) values(p_space_id,auth.uid(),m.role,p_date,coalesce(p_note,'')) returning * into g;
  insert into public.glimmer_assets(glimmer_id,provider,bucket,object_key,content_type,size_bytes)
  values(g.id,s.default_storage_provider,'glimmers',format('spaces/%s/users/%s/%s/%s/%s.%s',p_space_id,auth.uid(),to_char(p_date,'YYYY'),to_char(p_date,'MM'),g.id,ext),p_content_type,p_size_bytes) returning * into a;
  return jsonb_build_object('id',g.id,'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,'object_key',a.object_key,'content_type',a.content_type,'size_bytes',a.size_bytes));
exception when unique_violation then raise exception using errcode='23505',message='DAILY_GLIMMER_EXISTS';
end; $$;
