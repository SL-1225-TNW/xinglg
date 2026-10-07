-- Read-only: run in the project's Supabase SQL editor as its administrator.
-- Contains no save payloads, email addresses, passwords or session tokens.
select n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer, p.proconfig as settings,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname = 'commit_game_save')
   or (n.nspname = 'auth' and p.proname in ('uid', 'role', 'jwt'));

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('game_saves', 'player_profiles');

select role_name, has_schema_privilege(role_name, 'public', 'USAGE') as public_usage,
       has_schema_privilege(role_name, 'auth', 'USAGE') as auth_usage,
       has_function_privilege(role_name, 'auth.uid()', 'EXECUTE') as uid_execute,
       has_table_privilege(role_name, 'public.game_saves', 'SELECT') as saves_select
from (values ('anon'), ('authenticated')) r(role_name);

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'game_saves'
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.game_saves'::regclass;
