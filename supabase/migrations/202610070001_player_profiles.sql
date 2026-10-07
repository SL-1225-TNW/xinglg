-- Player identity table for the optional username shown in the game.
-- The existing public.game_saves table and commit_game_save RPC are reused as-is.
begin;

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null
    check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists player_profiles_username_ci_uidx
  on public.player_profiles (lower(username));

alter table public.player_profiles enable row level security;

grant select, insert, update on public.player_profiles to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'player_profiles'
      and policyname = 'player_profiles_read_own'
  ) then
    create policy player_profiles_read_own
      on public.player_profiles for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'player_profiles'
      and policyname = 'player_profiles_insert_own'
  ) then
    create policy player_profiles_insert_own
      on public.player_profiles for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'player_profiles'
      and policyname = 'player_profiles_update_own'
  ) then
    create policy player_profiles_update_own
      on public.player_profiles for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end
$$;

commit;
