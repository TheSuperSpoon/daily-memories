begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select extensions.plan(9);

select extensions.has_function('public','get_gift_icons_found',array['uuid'],'gift read RPC exists');
select extensions.has_function('public','collect_gift_icon',array['uuid','text'],'gift collect RPC exists');
select extensions.is(has_function_privilege('anon',
 'public.get_gift_icons_found(uuid)','EXECUTE'),false,
 'anonymous users cannot read gift progress');

select set_config('audit.ray_user_id',(
  select sm.user_id::text from public.space_members sm
  where sm.space_id='00000000-0000-0000-0000-000000000001' and sm.role='ray'
),true);
select set_config('audit.mel_user_id',(
  select sm.user_id::text from public.space_members sm
  where sm.space_id='00000000-0000-0000-0000-000000000001' and sm.role='mel'
),true);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('audit.ray_user_id'),true);
select extensions.throws_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')$$,
 '42501','FEATURE_FORBIDDEN','Ray cannot read gift progress');
select extensions.throws_ok($$select public.collect_gift_icon('00000000-0000-0000-0000-000000000001','home')$$,
 '42501','FEATURE_FORBIDDEN','Ray cannot collect gifts');

select set_config('request.jwt.claim.sub',current_setting('audit.mel_user_id'),true);
select extensions.lives_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')$$,
 'Mel can read gift progress');
select extensions.lives_ok($$select public.collect_gift_icon('00000000-0000-0000-0000-000000000001','home')$$,
 'Mel can collect gifts');
select extensions.throws_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000099')$$,
 '42501','FEATURE_FORBIDDEN','wrong space cannot read gift progress');

reset role;
delete from public.profiles where user_id=current_setting('audit.mel_user_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('audit.mel_user_id'),true);
select extensions.throws_ok($$select public.get_gift_icons_found('00000000-0000-0000-0000-000000000001')$$,
 '42501','PROFILE_NOT_FOUND','missing profile is rejected');

select * from extensions.finish();
rollback;
