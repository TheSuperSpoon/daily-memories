begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,pg_catalog;
select extensions.plan(16);

select extensions.has_function('public','is_current_role_owner',array['uuid','member_role'],
  'role ownership helper exists');
select extensions.is((select is_nullable from information_schema.columns
  where table_schema='public' and table_name='glimmers' and column_name='owner_id'),'YES',
  'glimmer auth user is nullable audit metadata');
select extensions.is((select is_nullable from information_schema.columns
  where table_schema='public' and table_name='memories' and column_name='owner_id'),'YES',
  'memory auth user is nullable audit metadata');
select extensions.is((select is_nullable from information_schema.columns
  where table_schema='public' and table_name='mel_likes' and column_name='owner_id'),'YES',
  'Mel-like auth user is nullable audit metadata');

select set_config('audit.old_mel_user_id',(
  select sm.user_id::text from public.space_members sm
  where sm.space_id='00000000-0000-0000-0000-000000000001' and sm.role='mel'
),true);

insert into public.gift_progress(space_id,role,prelude_completed_at)
values('00000000-0000-0000-0000-000000000001','mel',now())
on conflict(space_id,role) do update set prelude_completed_at=excluded.prelude_completed_at;

insert into public.glimmers(id,space_id,owner_id,role,glimmer_date,status,created_at)
values('61000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
  current_setting('audit.old_mel_user_id')::uuid,'mel','2099-01-01','pending',now());
insert into public.memories(id,space_id,owner_id,role,preferred_timezone,status,created_at)
values('61000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
  current_setting('audit.old_mel_user_id')::uuid,'mel','Asia/Shanghai','pending',now());
insert into public.mel_likes(id,space_id,owner_id,role,label,position,status,created_at)
values('61000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',
  current_setting('audit.old_mel_user_id')::uuid,'mel','continuity fixture',2147483000,'pending',now());

delete from auth.users where id=current_setting('audit.old_mel_user_id')::uuid;

select extensions.is((select state from public.registration_slots where role='mel'),'open',
  'deleting the account reopens the canonical Mel role slot');
select extensions.is((select owner_id from public.glimmers where id='61000000-0000-0000-0000-000000000001'),null::uuid,
  'Mel glimmer survives account deletion');
select extensions.is((select owner_id from public.memories where id='61000000-0000-0000-0000-000000000002'),null::uuid,
  'Mel memory survives account deletion');
select extensions.is((select owner_id from public.mel_likes where id='61000000-0000-0000-0000-000000000003'),null::uuid,
  'Mel-like record survives account deletion');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('61000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','replacement-mel@example.test','x',now(),'{}',
 '{"display_name":"Replacement Mel"}',now(),now());

select extensions.is((select sm.role::text from public.space_members sm
  where sm.user_id='61000000-0000-0000-0000-000000000099'),'mel',
  'replacement account automatically reclaims the Mel role');
select extensions.is((select user_id from public.registration_slots where role='mel'),
  '61000000-0000-0000-0000-000000000099'::uuid,
  'Mel registration slot points at the replacement account');

set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000099',true);
select extensions.ok(public.is_current_role_owner('00000000-0000-0000-0000-000000000001','mel'),
  'replacement account owns Mel-role behavior');
select extensions.lives_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')$$,
  'replacement account inherits Mel gift progress');
select extensions.is(public.get_mel_prelude_completed('00000000-0000-0000-0000-000000000001'),true,
  'replacement account inherits Mel prelude completion');
select extensions.lives_ok($$select public.cancel_glimmer_upload('61000000-0000-0000-0000-000000000001')$$,
  'replacement account can continue a Mel glimmer workflow');
select extensions.lives_ok($$select public.cancel_memory_upload('61000000-0000-0000-0000-000000000002')$$,
  'replacement account can continue a Mel memory workflow');
select extensions.lives_ok($$select public.cancel_mel_like_upload('61000000-0000-0000-0000-000000000003')$$,
  'replacement account can continue a Mel-like workflow');

select * from extensions.finish();
rollback;
