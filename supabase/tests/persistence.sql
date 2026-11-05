-- Local disposable database only. Simulates separately saved Live Boot credentials.
create schema test_persistence;
create table test_persistence.state (registration jsonb);
grant usage on schema test_persistence to anon;
grant insert,select on test_persistence.state to anon;
set role anon;
insert into test_persistence.state select public.register_team((select id from public.classes where slug='poraque'),'Persistência local','Ana Teste','João Teste');
reset role;
do $$ begin
 if (select count(*) from public.team_members)<>2 then raise exception 'Registration did not commit'; end if;
end $$;
