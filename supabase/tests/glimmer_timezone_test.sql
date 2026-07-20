begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select extensions.plan(8);

select extensions.has_column('public','glimmers','preferred_timezone','glimmers preferred timezone exists');
select extensions.ok(exists(
  select 1 from pg_constraint
  where conname='glimmers_preferred_timezone_check'
    and conrelid='public.glimmers'::regclass
),'glimmers preferred timezone check exists');
select extensions.has_function('public','begin_glimmer_upload',
  array['uuid','date','text','bigint','text','text','text'],
  'timezone-aware begin glimmer upload exists');
select extensions.is(has_function_privilege('anon',
  'public.begin_glimmer_upload(uuid,date,text,bigint,text,text,text)','EXECUTE'),false,
  'anonymous users cannot begin timezone-aware uploads');
select extensions.is((select count(*)::integer from public.glimmers
  where preferred_timezone not in ('Asia/Shanghai','America/Los_Angeles')),0,
  'all existing glimmers have a supported timezone');

update public.glimmers
set deleted_at=now()
where space_id='00000000-0000-0000-0000-000000000001'
  and role='ray'
  and glimmer_date=(now() at time zone 'Asia/Shanghai')::date
  and deleted_at is null;

select set_config('test.ray_user_id',(
  select user_id::text from public.space_members
  where space_id='00000000-0000-0000-0000-000000000001' and role='ray'
),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.ray_user_id'),true);

select extensions.lives_ok($$select public.begin_glimmer_upload(
  '00000000-0000-0000-0000-000000000001',
  (now() at time zone 'Asia/Shanghai')::date,'image/png',128,
  'timezone remote test','happy','America/Los_Angeles')$$,
  'member can begin a West Coast-preferred glimmer');
select extensions.is((select preferred_timezone from public.glimmers
  where note='timezone remote test'),'America/Los_Angeles',
  'selected timezone is persisted');
select extensions.throws_ok($$select public.begin_glimmer_upload(
  '00000000-0000-0000-0000-000000000001',
  (now() at time zone 'Asia/Shanghai')::date,'image/png',128,
  'bad timezone','happy','Europe/London')$$,
  '22023','INVALID_TIMEZONE','unknown timezone is rejected');

reset role;
rollback;
