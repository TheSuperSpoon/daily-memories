begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select extensions.plan(41);

select extensions.has_table('public','spaces','spaces exists');
select extensions.has_table('public','glimmers','glimmers exists');
select extensions.has_table('public','reward_ledger','reward ledger exists');
select extensions.has_column('public','glimmers','mood','glimmers mood exists');
select extensions.has_column('public','profiles','gift_icons_found','gift progress exists');
select extensions.ok(exists(
  select 1 from pg_constraint
  where conname='glimmers_mood_check' and conrelid='public.glimmers'::regclass
),'glimmers mood check exists');
select extensions.is((select count(*)::integer from public.registration_slots),2,'two registration slots seeded');
select extensions.is((select count(*)::integer from public.spaces),1,'one shared space seeded');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'ray@example.test','x',now(),'{}','{"display_name":"Ray"}',now(),now()),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'mel@example.test','x',now(),'{}','{"display_name":"Mel"}',now(),now());

select extensions.is((select count(*)::integer from public.profiles),2,'trigger creates two profiles');
select extensions.results_eq(
  'select role::text from public.space_members order by role::text',
  $$values ('mel'::text),('ray'::text)$$,
  'members receive distinct roles'
);
select extensions.is(has_function_privilege('anon',
 'public.get_gift_icons_found(uuid)','EXECUTE'),false,
 'anonymous users cannot read gift progress');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')$$,
 '42501','FEATURE_FORBIDDEN','Ray cannot read gift progress');
select extensions.throws_ok($$select public.collect_gift_icon('00000000-0000-0000-0000-000000000001','home')$$,
 '42501','FEATURE_FORBIDDEN','Ray cannot collect gifts');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select extensions.lives_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')$$,
 'Mel can read gift progress');
select extensions.lives_ok($$select public.collect_gift_icon('00000000-0000-0000-0000-000000000001','home')$$,
 'Mel can collect gifts');
select extensions.is((public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')->>'home')::boolean,true,
 'Mel gift progress is persisted');
select extensions.throws_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000099')$$,
 '42501','FEATURE_FORBIDDEN','wrong space cannot read gift progress');
reset role;
delete from public.profiles where user_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')$$,
 '42501','PROFILE_NOT_FOUND','missing profile is rejected');
reset role;
select extensions.throws_ok($$
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
   raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'third@example.test','x',now(),'{}','{"display_name":"Third"}',now(),now())
$$,'P0001','REGISTRATION_LIMIT_REACHED','third registration is rejected');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select extensions.lives_ok($$select public.begin_glimmer_upload('00000000-0000-0000-0000-000000000001',
 (now() at time zone 'Asia/Shanghai')::date,'image/jpeg',100,'safe <script> text','loved')$$,'valid upload with mood can begin');
reset role;
select extensions.is((select mood from public.glimmers where note='safe <script> text'),
 'loved','valid mood is persisted');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.begin_glimmer_upload('00000000-0000-0000-0000-000000000001',
 (now() at time zone 'Asia/Shanghai')::date,'image/jpeg',100,'','angry')$$,
 '22023','INVALID_MOOD','bad mood rejected by upload RPC');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select extensions.lives_ok($$select public.begin_glimmer_upload('00000000-0000-0000-0000-000000000001',
 (now() at time zone 'Asia/Shanghai')::date,'image/png',100,'legacy client')$$,'five argument upload remains compatible');
reset role;
select extensions.is(coalesce((select coalesce(mood,'__NULL__') from public.glimmers where note='legacy client'),'__MISSING__'),
 '__NULL__','legacy upload stores a null mood');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.begin_glimmer_upload('00000000-0000-0000-0000-000000000001',
 (now() at time zone 'Asia/Shanghai')::date,'text/html',100,'')$$,'22023','INVALID_CONTENT_TYPE','bad MIME rejected');
select extensions.throws_ok($$select public.begin_glimmer_upload('00000000-0000-0000-0000-000000000001',
 (now() at time zone 'Asia/Shanghai')::date,'image/png',10485761,'')$$,'22023','INVALID_FILE_SIZE','oversize rejected');
select extensions.throws_ok($$select public.list_glimmers('00000000-0000-0000-0000-000000000001',current_date-1,current_date,
 null,50,current_date,null,null)$$,'22023','INVALID_CURSOR','partial cursor rejected');

reset role;
select extensions.throws_ok($$
  insert into public.glimmers(space_id,owner_id,role,glimmer_date,mood)
  values('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'ray',current_date-40,'angry')
$$,'23514',null,'mood check rejects direct invalid writes');
insert into public.glimmers(id,space_id,owner_id,role,glimmer_date,status,mood,created_at,ready_at)
values('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',
 '10000000-0000-0000-0000-000000000001','ray',current_date-40,'ready','sad',
 (current_date-40)::timestamp at time zone 'Asia/Shanghai',now());
insert into public.glimmer_assets(glimmer_id,bucket,object_key,content_type,size_bytes)
values('20000000-0000-0000-0000-000000000003','glimmers','mood/list.png','image/png',1);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select extensions.is((select glimmer->>'mood' from public.list_glimmers(
 '00000000-0000-0000-0000-000000000001',current_date-40,current_date-40)),
 'sad','list glimmers returns mood');
select extensions.is(has_function_privilege('anon',
 'public.begin_glimmer_upload(uuid,date,text,bigint,text,text)','EXECUTE'),false,
 'anonymous users cannot execute mood upload RPC');
select extensions.throws_ok($$insert into public.reward_ledger(space_id,event_type,amount,streak_run_start,streak_milestone,idempotency_key)
 values('00000000-0000-0000-0000-000000000001','streak_earned',1,current_date,10,'forbidden')$$,
 '42501',null,'client cannot write reward ledger');

reset role;
insert into public.glimmers(id,space_id,owner_id,role,glimmer_date,status,created_at,ready_at)
values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','ray',current_date-30,'ready',now()-interval '23 hours 59 minutes 59 seconds',now()),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','ray',current_date-31,'ready',now()-interval '24 hours',now());
insert into public.glimmer_assets(glimmer_id,bucket,object_key,content_type,size_bytes)
values
 ('20000000-0000-0000-0000-000000000001','glimmers','boundary/inside.png','image/png',1),
 ('20000000-0000-0000-0000-000000000002','glimmers','boundary/exact.png','image/png',1);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select extensions.is(public.can_delete_glimmer_object('glimmers','boundary/inside.png'),true,
 'delete is allowed at 23:59:59');
select extensions.is(public.can_delete_glimmer_object('glimmers','boundary/exact.png'),false,
 'delete is rejected at exactly 24:00:00');
reset role;
insert into public.glimmers(space_id,owner_id,role,glimmer_date,status,ready_at,created_at)
select '00000000-0000-0000-0000-000000000001',
 case role when 'ray' then '10000000-0000-0000-0000-000000000001'::uuid else '10000000-0000-0000-0000-000000000002'::uuid end,
 role,d,'ready',now(),(d::date::timestamp at time zone 'Asia/Shanghai')
from generate_series(current_date-10,current_date-1,interval '1 day') dates(d)
cross join (values('ray'::public.member_role),('mel'::public.member_role)) roles(role)
on conflict do nothing;

insert into public.glimmers(space_id,owner_id,role,glimmer_date,status,ready_at)
values('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 'ray',current_date-20,'ready',now());
select extensions.is((select public.is_glimmer_accounted(g) from public.glimmers g where glimmer_date=current_date-20),false,
 'unpaid retro glimmer is not accounted');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select extensions.lives_ok($$select public.grant_streak_rewards('00000000-0000-0000-0000-000000000001')$$,'first reward grant succeeds');
select extensions.lives_ok($$select public.grant_streak_rewards('00000000-0000-0000-0000-000000000001')$$,'reward grant retry succeeds');
select extensions.is((public.get_glimmer_dashboard('00000000-0000-0000-0000-000000000001')->>'role'),'ray',
 'dashboard returns authenticated member role');
select extensions.is((public.get_glimmer_dashboard('00000000-0000-0000-0000-000000000001')->>'local_today')::date,
 (now() at time zone 'Asia/Shanghai')::date,'dashboard uses space local date');
select extensions.is((public.get_glimmer_dashboard('00000000-0000-0000-0000-000000000001')->>'complete_days_total')::integer,10,
 'dashboard counts complete accounted days without loading assets');
select extensions.is((public.get_glimmer_dashboard('00000000-0000-0000-0000-000000000001')->>'reward_balance')::integer,1,
 'dashboard returns immutable ledger balance');
reset role;
select extensions.is((select count(*)::integer from public.reward_ledger where event_type='streak_earned'),1,
 'concurrent-safe key prevents duplicate milestone reward');

select * from extensions.finish();
rollback;
