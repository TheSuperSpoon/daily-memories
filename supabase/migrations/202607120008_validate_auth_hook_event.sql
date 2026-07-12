create or replace function public.before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if event is null or event -> 'user' is null then
    raise exception using errcode = '22023', message = 'INVALID_AUTH_HOOK_EVENT';
  end if;
  perform pg_advisory_xact_lock(82472641001);
  if not exists (select 1 from public.registration_slots where state = 'open') then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'REGISTRATION_LIMIT_REACHED'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
