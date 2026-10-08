-- commit_game_save is SECURITY DEFINER and owned by moss_save_writer.
-- Its own-save RLS policies call auth.uid(), so the owner needs access
-- to that helper even when the authenticated caller already has it.
-- No auth table access, RLS bypass, or client write access is granted.
begin;

grant usage on schema auth to moss_save_writer;
grant execute on function auth.uid() to moss_save_writer;

commit;

select
  has_schema_privilege('moss_save_writer', 'auth', 'USAGE') as writer_auth_usage,
  has_function_privilege('moss_save_writer', 'auth.uid()', 'EXECUTE') as writer_uid_execute;
