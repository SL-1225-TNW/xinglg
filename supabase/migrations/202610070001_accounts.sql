begin;
-- This NOLOGIN role owns only the RPC, does not own tables and cannot bypass RLS.
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'moss_save_writer') then
    create role moss_save_writer nologin noinherit nobypassrls;
  end if;
end $$;
create table public.game_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid not null,
  schema_version integer not null check (schema_version > 0),
  revision bigint not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  last_device_id uuid not null,
  last_mutation_id uuid not null,
  primary key (user_id, slot_id)
);
create table public.save_backups (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid not null,
  revision bigint not null,
  schema_version integer not null,
  payload jsonb not null,
  updated_at timestamptz not null,
  backed_up_at timestamptz not null default now(),
  last_device_id uuid not null,
  primary key (user_id, slot_id, revision)
);
alter table public.game_saves enable row level security;
alter table public.game_saves force row level security;
alter table public.save_backups enable row level security;
alter table public.save_backups force row level security;
create policy own_save_read on public.game_saves for select to authenticated, moss_save_writer
  using ((select auth.uid()) = user_id);
create policy own_save_insert on public.game_saves for insert to moss_save_writer
  with check ((select auth.uid()) = user_id);
create policy own_save_update on public.game_saves for update to moss_save_writer
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_backup_read on public.save_backups for select to authenticated, moss_save_writer
  using ((select auth.uid()) = user_id);
create policy own_backup_insert on public.save_backups for insert to moss_save_writer
  with check ((select auth.uid()) = user_id);
create policy own_backup_prune on public.save_backups for delete to moss_save_writer
  using ((select auth.uid()) = user_id);
revoke all on public.game_saves, public.save_backups from public, anon, authenticated;
grant select on public.game_saves, public.save_backups to authenticated;
grant usage on schema public, auth to moss_save_writer;
grant execute on function auth.uid() to moss_save_writer;
grant select, insert, update on public.game_saves to moss_save_writer;
grant select, insert, delete on public.save_backups to moss_save_writer;
create function public.commit_game_save(
  p_slot_id uuid, p_expected_revision bigint, p_schema_version integer,
  p_payload jsonb, p_device_id uuid, p_mutation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_save public.game_saves%rowtype;
  next_revision bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_slot_id is null or
     p_device_id is null or p_mutation_id is null or p_schema_version is null or p_schema_version < 1 or
     p_payload is null or jsonb_typeof(p_payload) <> 'object' or
     p_payload->>'version' is distinct from p_schema_version::text or octet_length(p_payload::text) > 1048576 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  -- Serializes initial INSERT races as well as updates; hash collisions only serialize unrelated saves.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_slot_id::text, 0));
  select * into current_save from public.game_saves where user_id = uid and slot_id = p_slot_id for update;
  if found then
    if current_save.last_mutation_id = p_mutation_id then
      return jsonb_build_object('status', 'ok', 'save', to_jsonb(current_save));
    end if;
    if current_save.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict', 'save', to_jsonb(current_save));
    end if;
    if current_save.schema_version > p_schema_version then raise exception 'Upgrade required' using errcode = '22023'; end if;
    insert into public.save_backups(user_id,slot_id,revision,schema_version,payload,updated_at,last_device_id)
      values(uid,p_slot_id,current_save.revision,current_save.schema_version,current_save.payload,current_save.updated_at,current_save.last_device_id);
    next_revision := current_save.revision + 1;
    update public.game_saves set revision = next_revision, schema_version = p_schema_version, payload = p_payload,
      updated_at = clock_timestamp(), last_device_id = p_device_id, last_mutation_id = p_mutation_id
      where user_id = uid and slot_id = p_slot_id returning * into current_save;
    delete from public.save_backups where user_id = uid and slot_id = p_slot_id and revision not in
      (select revision from public.save_backups where user_id = uid and slot_id = p_slot_id order by revision desc limit 10);
  else
    if p_expected_revision <> 0 then return jsonb_build_object('status','conflict','save',null); end if;
    insert into public.game_saves(user_id,slot_id,schema_version,revision,payload,last_device_id,last_mutation_id)
      values(uid,p_slot_id,p_schema_version,1,p_payload,p_device_id,p_mutation_id) returning * into current_save;
  end if;
  return jsonb_build_object('status', 'ok', 'save', to_jsonb(current_save));
end;
$$;
-- A function owner needs CREATE briefly to receive ownership; it is revoked immediately.
grant moss_save_writer to postgres;
grant create on schema public to moss_save_writer;
alter function public.commit_game_save(uuid,bigint,integer,jsonb,uuid,uuid) owner to moss_save_writer;
revoke create on schema public from moss_save_writer;
revoke all on function public.commit_game_save(uuid,bigint,integer,jsonb,uuid,uuid) from public, anon;
grant execute on function public.commit_game_save(uuid,bigint,integer,jsonb,uuid,uuid) to authenticated;
commit;
