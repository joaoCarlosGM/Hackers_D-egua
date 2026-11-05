#!/usr/bin/env bash
# Sourced exclusively by test-db.sh inside its disposable PostgreSQL container.
# No remote URL, production connection or real student data is accepted.
declare -F psql_test >/dev/null || { echo 'Run npm run test:db instead.' >&2; exit 1; }
wait_for_class_lock() {
 local marker="$1" seen=0
 for ((probe=0;probe<40;probe++)); do
  if [[ "$(psql_test -Atc "select pg_try_advisory_lock($marker)")" == f ]]; then seen=1; break; fi
  sleep 0.05
 done
 [[ "$seen" == 1 ]] || { echo 'Concurrent transaction did not reach its lock barrier' >&2; return 1; }
}
psql_test <<'SQL'
insert into auth.users(id) values('00000000-0000-0000-0000-000000000091');
insert into public.admin_users(user_id,role) values('00000000-0000-0000-0000-000000000091','admin');
insert into public.classes(id,name,slug) values('00000000-0000-0000-0000-000000000092','Concorrência de cadastro','test-enrollment-race'),('00000000-0000-0000-0000-000000000093','Concorrência de vínculo','test-activity-race');
SQL
psql_test >/tmp/hpde-class-archive-race-$$.log 2>&1 <<'SQL' &
begin;
select 1 from public.classes where slug='test-enrollment-race' for update;
update public.classes set status='archived' where slug='test-enrollment-race';
select pg_advisory_xact_lock(913501);
select pg_sleep(2);
commit;
SQL
class_archiver_pid=$!
wait_for_class_lock 913501
psql_test <<'SQL'
set role anon;
do $$ declare response jsonb; begin
 response:=public.register_team('00000000-0000-0000-0000-000000000092','Dupla que deve ser rejeitada','Ana Teste','João Teste');
 if not response ? 'error' then raise exception 'Enrollment raced past archival'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.teams where class_id='00000000-0000-0000-0000-000000000092') then raise exception 'Concurrent enrollment persisted in archived class'; end if;
 raise notice 'PASS: concurrent archive blocks enrollment without partial team or rank';
end $$;
SQL
wait "$class_archiver_pid"
psql_test >/tmp/hpde-class-activity-race-$$.log 2>&1 <<'SQL' &
begin;
insert into public.activities(id,title,created_by) values('00000000-0000-0000-0000-000000000094','Vínculo simultâneo','00000000-0000-0000-0000-000000000091');
insert into public.activity_sessions(activity_id,class_ids) values('00000000-0000-0000-0000-000000000094',array['00000000-0000-0000-0000-000000000093'::uuid]);
select pg_advisory_xact_lock(913502);
select pg_sleep(2);
commit;
SQL
class_linker_pid=$!
wait_for_class_lock 913502
psql_test <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',false);
do $$ begin
 begin
 perform public.delete_class('00000000-0000-0000-0000-000000000093','EXCLUIR test-activity-race');
 exception when foreign_key_violation then
 raise notice 'PASS: concurrent activity association blocks class deletion';
 return;
 end;
 raise exception 'Class deleted while another transaction linked an activity';
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.classes where slug='test-activity-race') then raise exception 'Linked class disappeared'; end if;
 if not exists(select 1 from public.activity_sessions where activity_id='00000000-0000-0000-0000-000000000094') then raise exception 'Activity association disappeared'; end if;
end $$;
SQL
wait "$class_linker_pid"
rm -f /tmp/hpde-class-archive-race-$$.log /tmp/hpde-class-activity-race-$$.log
