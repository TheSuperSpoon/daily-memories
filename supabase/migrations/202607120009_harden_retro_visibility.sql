create or replace function public.is_glimmer_accounted(g public.glimmers)
returns boolean language sql stable security definer set search_path='' as $$
  select g.glimmer_date = (g.created_at at time zone s.timezone)::date
    or exists (
      select 1 from public.reward_ledger r
      where r.space_id=g.space_id and r.event_type='retro_spent' and r.target_date=g.glimmer_date
    )
  from public.spaces s where s.id=g.space_id;
$$;

revoke all on function public.is_space_member(uuid) from public,anon;
grant execute on function public.is_space_member(uuid) to authenticated;
revoke all on function public.is_glimmer_accounted(public.glimmers) from public,anon;
grant execute on function public.is_glimmer_accounted(public.glimmers) to authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;

create or replace function public.reward_balance(p_space_id uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_space_member(p_space_id) then
    raise exception using errcode='42501',message='NOT_SPACE_MEMBER';
  end if;
  return (select coalesce(sum(amount),0)::integer from public.reward_ledger where space_id=p_space_id);
end; $$;
revoke all on function public.reward_balance(uuid) from public,anon;
grant execute on function public.reward_balance(uuid) to authenticated;

drop policy glimmers_select_member on public.glimmers;
create policy glimmers_select_member on public.glimmers for select to authenticated
using (status='ready' and deleted_at is null and public.is_glimmer_accounted(glimmers)
  and public.is_space_member(space_id));

drop policy assets_select_member on public.glimmer_assets;
create policy assets_select_member on public.glimmer_assets for select to authenticated
using (deleted_at is null and exists (
  select 1 from public.glimmers g where g.id=glimmer_id and g.status='ready'
    and g.deleted_at is null and public.is_glimmer_accounted(g) and public.is_space_member(g.space_id)
));

drop policy glimmers_storage_select_member on storage.objects;
create policy glimmers_storage_select_member on storage.objects for select to authenticated
using (bucket_id='glimmers' and exists (
  select 1 from public.glimmer_assets a join public.glimmers g on g.id=a.glimmer_id
  where a.bucket=bucket_id and a.object_key=name and a.provider='supabase'
    and a.is_current and a.deleted_at is null and g.status='ready' and g.deleted_at is null
    and public.is_glimmer_accounted(g) and public.is_space_member(g.space_id)
));

create or replace function public.list_glimmers(
  p_space_id uuid,p_from date,p_to date,p_owner_id uuid default null,p_limit integer default 50,
  p_cursor_date date default null,p_cursor_created_at timestamptz default null,p_cursor_id uuid default null
) returns table(glimmer jsonb) language plpgsql security definer set search_path='' as $$
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  if p_from>p_to or p_to-p_from>366 then raise exception using errcode='22023',message='INVALID_DATE_RANGE'; end if;
  if p_limit<1 or p_limit>100 then raise exception using errcode='22023',message='INVALID_LIMIT'; end if;
  if (p_cursor_date is null)<>(p_cursor_created_at is null) or (p_cursor_date is null)<>(p_cursor_id is null) then
    raise exception using errcode='22023',message='INVALID_CURSOR';
  end if;
  return query select jsonb_build_object('id',g.id,'space_id',g.space_id,'owner_id',g.owner_id,
    'role',g.role,'glimmer_date',g.glimmer_date,'note',g.note,'created_at',g.created_at,'ready_at',g.ready_at,
    'asset',jsonb_build_object('id',a.id,'provider',a.provider,'bucket',a.bucket,'object_key',a.object_key,
      'content_type',a.content_type,'size_bytes',a.size_bytes))
  from public.glimmers g join public.glimmer_assets a on a.glimmer_id=g.id and a.is_current and a.deleted_at is null
  where g.space_id=p_space_id and g.status='ready' and g.deleted_at is null and public.is_glimmer_accounted(g)
    and g.glimmer_date between p_from and p_to and (p_owner_id is null or g.owner_id=p_owner_id)
    and (p_cursor_date is null or (g.glimmer_date,g.created_at,g.id)<(p_cursor_date,p_cursor_created_at,p_cursor_id))
  order by g.glimmer_date desc,g.created_at desc,g.id desc limit p_limit;
end; $$;

create or replace function public.grant_streak_rewards(p_space_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare end_date date;start_date date;day_count integer;milestone integer;inserted_count integer:=0;
begin
  if not public.is_space_member(p_space_id) then raise exception using errcode='42501',message='NOT_SPACE_MEMBER'; end if;
  perform 1 from public.spaces where id=p_space_id for update;
  with complete_days as (select glimmer_date from public.glimmers g where space_id=p_space_id and status='ready'
    and deleted_at is null and public.is_glimmer_accounted(g) group by glimmer_date having count(distinct role)=2)
  select max(glimmer_date) into end_date from complete_days;
  if end_date is null then return jsonb_build_object('awarded',0,'balance',public.reward_balance(p_space_id)); end if;
  with complete_days as (select glimmer_date from public.glimmers g where space_id=p_space_id and status='ready'
    and deleted_at is null and public.is_glimmer_accounted(g) group by glimmer_date having count(distinct role)=2),
  ranked as (select glimmer_date,glimmer_date-(row_number() over(order by glimmer_date))::integer grp from complete_days)
  select min(glimmer_date),count(*)::integer into start_date,day_count from ranked
    where grp=(select grp from ranked where glimmer_date=end_date) group by grp;
  for milestone in select generate_series(10,(day_count/10)*10,10) loop
    insert into public.reward_ledger(space_id,event_type,amount,streak_run_start,streak_milestone,idempotency_key)
    values(p_space_id,'streak_earned',1,start_date,milestone,format('streak:%s:%s:%s',p_space_id,start_date,milestone))
    on conflict do nothing;
    inserted_count:=inserted_count+case when found then 1 else 0 end;
  end loop;
  return jsonb_build_object('awarded',inserted_count,'balance',public.reward_balance(p_space_id),
    'run_start',start_date,'days',day_count);
end; $$;
