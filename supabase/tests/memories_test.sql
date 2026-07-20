begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select extensions.plan(25);

select extensions.has_table('public','memories','memories exists');
select extensions.has_table('public','memory_assets','memory assets exists');
select extensions.has_table('public','memory_tags','memory tags exists');
select extensions.has_table('public','memory_tag_links','memory tag links exist');
select extensions.has_table('public','mel_likes','Mel likes exists');
select extensions.has_table('public','mel_like_assets','Mel like assets exist');
select extensions.is((select public from storage.buckets where id='memories'),false,'memories bucket is private');
select extensions.is(has_function_privilege('anon',
 'public.begin_memory_upload(uuid,text,bigint,text,text,text[])','EXECUTE'),false,
 'anonymous users cannot begin a memory upload');

set local session_replication_role=replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'memory-ray@example.test','x',now(),'{}','{"display_name":"Memory Ray"}',now(),now()),
 ('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'memory-mel@example.test','x',now(),'{}','{"display_name":"Memory Mel"}',now(),now())
on conflict do nothing;
set local session_replication_role=origin;
insert into public.profiles(user_id,display_name) values
 ('50000000-0000-0000-0000-000000000001','Memory Ray'),
 ('50000000-0000-0000-0000-000000000002','Memory Mel') on conflict do nothing;
insert into public.space_members(space_id,user_id,role) values
 ('00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','ray'),
 ('00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','mel') on conflict do nothing;

select set_config('request.jwt.claim.sub',(select user_id::text from public.space_members
 where space_id='00000000-0000-0000-0000-000000000001' and role='ray'),true);
set local role authenticated;
select extensions.lives_ok($$select public.begin_memory_upload(
 '00000000-0000-0000-0000-000000000001','image/png',100,'first image','Asia/Shanghai',array['#Summer','summer','音乐'])$$,
 'valid image memory can begin');
select extensions.lives_ok($$select public.begin_memory_upload(
 '00000000-0000-0000-0000-000000000001','audio/mpeg',52428800,'voice note','America/Los_Angeles',array['voice'])$$,
 'valid maximum-size audio memory can begin');
reset role;

select extensions.is((select role::text from public.memories where body='first image'),'ray','role is bound by the server');

select set_config('request.jwt.claim.sub',(select user_id::text from public.space_members
 where space_id='00000000-0000-0000-0000-000000000001' and role='ray'),true);
set local role authenticated;
select extensions.throws_ok($$select public.begin_memory_upload(
 '00000000-0000-0000-0000-000000000001','video/mp4',100,'','Asia/Shanghai','{}')$$,
 '22023','INVALID_CONTENT_TYPE','video MIME is rejected');
select extensions.throws_ok($$select public.begin_memory_upload(
 '00000000-0000-0000-0000-000000000001','image/png',10485761,'','Asia/Shanghai','{}')$$,
 '22023','INVALID_FILE_SIZE','oversized image is rejected');
select extensions.throws_ok($$select public.begin_memory_upload(
 '00000000-0000-0000-0000-000000000001','audio/mpeg',52428801,'','Asia/Shanghai','{}')$$,
 '22023','INVALID_FILE_SIZE','oversized audio is rejected');
select extensions.throws_ok($$select public.begin_memory_upload(
 '00000000-0000-0000-0000-000000000001','image/png',100,'','UTC','{}')$$,
 '22023','INVALID_TIMEZONE','unknown preferred timezone is rejected');
select extensions.throws_ok($$select public.begin_memory_upload(
 '00000000-0000-0000-0000-000000000001','image/png',100,'','Asia/Shanghai',
 array['a','b','c','d','e','f','g','h','i','j','k'])$$,
 '22023','TOO_MANY_TAGS','more than ten tags are rejected');
reset role;

select extensions.is((select count(*)::integer from public.memory_tags),3,'tags are normalized and deduplicated');

update public.memories set status='ready',ready_at=now()
where body in ('first image','voice note');
select set_config('request.jwt.claim.sub',(select user_id::text from public.space_members
 where space_id='00000000-0000-0000-0000-000000000001' and role='mel'),true);
set local role authenticated;
select extensions.is((select jsonb_array_length(memory->'tags') from public.list_memories(
 '00000000-0000-0000-0000-000000000001',(now() at time zone 'Asia/Shanghai')::date,
 (now() at time zone 'Asia/Shanghai')::date,100) where memory->>'body'='first image'),2,
 'space peer lists memory tags');
select extensions.is(((select tag from public.list_top_memory_tags(
 '00000000-0000-0000-0000-000000000001',5) limit 1)->>'count')::integer,1,
 'top tag count only includes ready memories');
reset role;

update public.memories set created_at=now()-interval '23 hours 59 minutes 59 seconds' where body='first image';
update public.memories set created_at=now()-interval '24 hours' where body='voice note';
select set_config('request.jwt.claim.sub',(select user_id::text from public.space_members
 where space_id='00000000-0000-0000-0000-000000000001' and role='ray'),true);
select extensions.is(public.can_delete_memory_object('memories',
 (select object_key from public.memory_assets a join public.memories m on m.id=a.memory_id where m.body='first image')),true,
 'memory delete is allowed inside 24 hours');
select extensions.is(public.can_delete_memory_object('memories',
 (select object_key from public.memory_assets a join public.memories m on m.id=a.memory_id where m.body='voice note')),false,
 'memory delete is rejected at exactly 24 hours');

select set_config('request.jwt.claim.sub',(select user_id::text from public.space_members
 where space_id='00000000-0000-0000-0000-000000000001' and role='mel'),true);
set local role authenticated;
select extensions.throws_ok(format('select public.complete_memory_delete(%L)',
 (select id from public.memories where body='first image')),'42501','DELETE_FORBIDDEN','peer cannot delete another member memory');
select extensions.lives_ok($$select public.begin_mel_like_upload(
 '00000000-0000-0000-0000-000000000001','image/jpeg',100,'Jinx')$$,'either member can begin a Mel likes upload');
select extensions.throws_ok($$select public.begin_mel_like_upload(
 '00000000-0000-0000-0000-000000000001','image/jpeg',100,'')$$,
 '22023','INVALID_MEL_LIKE_LABEL','Mel likes caption is required');
reset role;

update public.mel_likes set status='ready',ready_at=now() where label='Jinx';
select set_config('request.jwt.claim.sub',(select user_id::text from public.space_members
 where space_id='00000000-0000-0000-0000-000000000001' and role='ray'),true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.list_mel_likes(
 '00000000-0000-0000-0000-000000000001')),1,'both members can list ready Mel likes');
reset role;

select * from extensions.finish();
rollback;
