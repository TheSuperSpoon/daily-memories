create or replace function public.is_space_member(target_space uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.space_members
    where space_id = target_space and user_id = auth.uid()
  );
$$;

create or replace function public.before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
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

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  claimed_slot public.registration_slots%rowtype;
  requested_name text;
begin
  perform pg_advisory_xact_lock(82472641001);
  select * into claimed_slot
  from public.registration_slots
  where state = 'open'
  order by slot
  for update skip locked
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_LIMIT_REACHED';
  end if;

  requested_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  if requested_name is null or char_length(requested_name) > 30 then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;

  update public.registration_slots
  set state = 'claimed', user_id = new.id, claimed_at = now()
  where slot = claimed_slot.slot;

  insert into public.profiles (user_id, display_name)
  values (new.id, requested_name);

  insert into public.space_members (space_id, user_id, role)
  values ('00000000-0000-0000-0000-000000000001', new.id, claimed_slot.role);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.spaces enable row level security;
alter table public.registration_slots enable row level security;
alter table public.profiles enable row level security;
alter table public.space_members enable row level security;
alter table public.glimmers enable row level security;
alter table public.glimmer_assets enable row level security;
alter table public.reward_ledger enable row level security;

create policy spaces_select_member on public.spaces for select to authenticated
using (public.is_space_member(id));
create policy profiles_select_space_peer on public.profiles for select to authenticated
using (exists (
  select 1 from public.space_members mine join public.space_members peer using (space_id)
  where mine.user_id = auth.uid() and peer.user_id = profiles.user_id
));
create policy profiles_update_self on public.profiles for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_select_peer on public.space_members for select to authenticated
using (public.is_space_member(space_id));
create policy glimmers_select_member on public.glimmers for select to authenticated
using (status = 'ready' and deleted_at is null and public.is_space_member(space_id));
create policy assets_select_member on public.glimmer_assets for select to authenticated
using (deleted_at is null and exists (
  select 1 from public.glimmers g
  where g.id = glimmer_id and g.status = 'ready' and g.deleted_at is null
    and public.is_space_member(g.space_id)
));
create policy rewards_select_member on public.reward_ledger for select to authenticated
using (public.is_space_member(space_id));

revoke all on public.registration_slots from anon, authenticated;
revoke insert, update, delete on public.spaces, public.profiles, public.space_members,
  public.glimmers, public.glimmer_assets, public.reward_ledger from anon, authenticated;
grant select on public.spaces, public.profiles, public.space_members,
  public.glimmers, public.glimmer_assets, public.reward_ledger to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
revoke all on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
