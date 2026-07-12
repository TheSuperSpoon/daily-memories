create extension if not exists pgcrypto;

create type public.member_role as enum ('ray', 'mel');
create type public.upload_status as enum ('pending', 'ready');
create type public.storage_provider as enum ('supabase', 'r2');
create type public.reward_event_type as enum ('streak_earned', 'retro_spent');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Shanghai',
  default_storage_provider public.storage_provider not null default 'supabase',
  created_at timestamptz not null default now()
);

create table public.registration_slots (
  slot smallint primary key check (slot in (1, 2)),
  role public.member_role not null unique,
  state text not null default 'open' check (state in ('open', 'claimed', 'locked')),
  user_id uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  check ((state = 'claimed' and user_id is not null) or state <> 'claimed')
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id), unique (space_id, role)
);

create table public.glimmers (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  glimmer_date date not null,
  note text not null default '' check (char_length(note) <= 500),
  status public.upload_status not null default 'pending',
  created_at timestamptz not null default now(), ready_at timestamptz, deleted_at timestamptz
);

create table public.glimmer_assets (
  id uuid primary key default gen_random_uuid(),
  glimmer_id uuid not null references public.glimmers(id) on delete cascade,
  provider public.storage_provider not null default 'supabase',
  bucket text not null, object_key text not null, content_type text not null,
  size_bytes bigint not null, checksum text, is_current boolean not null default true,
  created_at timestamptz not null default now(), deleted_at timestamptz,
  unique (provider, bucket, object_key),
  check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  check (size_bytes between 1 and 10485760)
);

create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  event_type public.reward_event_type not null, amount smallint not null check (amount <> 0),
  streak_run_start date, streak_milestone smallint, target_date date,
  actor_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null unique, created_at timestamptz not null default now(),
  check ((event_type = 'streak_earned' and amount = 1 and streak_run_start is not null and streak_milestone > 0 and streak_milestone % 10 = 0 and target_date is null)
    or (event_type = 'retro_spent' and amount = -1 and target_date is not null))
);

create unique index glimmer_assets_one_current on public.glimmer_assets (glimmer_id) where is_current and deleted_at is null;
create unique index glimmers_one_per_role_per_day on public.glimmers (space_id, glimmer_date, role) where deleted_at is null and status in ('pending', 'ready');
create index glimmers_timeline on public.glimmers (space_id, glimmer_date desc, created_at desc) where deleted_at is null and status = 'ready';
create index reward_ledger_space_time on public.reward_ledger (space_id, created_at desc);
create unique index reward_one_card_per_run_milestone on public.reward_ledger (space_id, streak_run_start, streak_milestone) where event_type = 'streak_earned';
create unique index reward_one_spend_per_retro_date on public.reward_ledger (space_id, target_date) where event_type = 'retro_spent';

insert into public.spaces (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Daily Memories');
insert into public.registration_slots (slot, role) values (1, 'ray'), (2, 'mel');
