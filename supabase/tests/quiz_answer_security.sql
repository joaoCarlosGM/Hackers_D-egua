\set ON_ERROR_STOP on
begin;
create schema test_keys;
create function test_keys.ok(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function test_keys.denied(statement text, label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then raise notice 'PASS: % (denied)',label; return; end;
 raise exception 'FAIL: % unexpectedly allowed',label;
end $$;
grant usage on schema test_keys to anon,authenticated;
grant execute on all functions in schema test_keys to anon,authenticated;
create table test_keys.state(key text primary key,value jsonb);
grant select,insert on test_keys.state to anon,authenticated;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000061','professor-keys@test.invalid'),
 ('00000000-0000-0000-0000-000000000062','estudante-keys@test.invalid');
insert into public.admin_users(user_id,role) values
 ('00000000-0000-0000-0000-000000000061','teacher');

select test_keys.ok(not has_table_privilege('anon','public.question_options','select'),
 'anonymous does not have SQL SELECT on correct answers');
select test_keys.ok(not has_table_privilege('anon','public.grades','select'),
 'anonymous does not have SQL SELECT on grades');
select test_keys.ok(not has_table_privilege('anon','public.answers','select'),
 'anonymous does not have SQL SELECT on student submissions');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000061',true);
insert into test_keys.state values ('quiz',
 to_jsonb(public.save_assessment(
   'Aula 02 — comandos Linux', 'Gabarito privado',
   array[(select id from public.classes where slug='poraque')],
   '[{"prompt":"Qual comando lista arquivos?","kind":"multiple_choice",
     "points":10,"explanation":"Explicação privada",
     "options":[{"label":"ls","is_correct":true},
                {"label":"rm","is_correct":false}]}]'::jsonb
 )));
insert into test_keys.state
 select 'session',to_jsonb(id) from public.activity_sessions
 where activity_id=(select (value#>>'{}')::uuid from test_keys.state where key='quiz');
select public.transition_assessment(
 (select (value#>>'{}')::uuid from test_keys.state where key='session'),'published');
select public.transition_assessment(
 (select (value#>>'{}')::uuid from test_keys.state where key='session'),'open');

set local role anon;
select test_keys.denied('select id,is_correct from public.question_options',
 'anonymous inspector cannot fetch answer key directly');
select test_keys.denied('select id,explanation from public.questions',
 'anonymous inspector cannot fetch explanations');
select test_keys.denied('select * from public.answers',
 'anonymous inspector cannot fetch submissions');
select test_keys.denied('select * from public.grades',
 'anonymous inspector cannot fetch private grades');
select test_keys.denied($q$select public.assessment_results(
 (select (value#>>'{}')::uuid from test_keys.state where key='quiz'))$q$,
 'anonymous inspector cannot call private results RPC');
select test_keys.ok(
 (select jsonb_array_length(payload->'questions')=1
     and not ((payload->'questions'->0) ? 'explanation')
     and not ((payload->'questions'->0->'options'->0) ? 'is_correct')
     and not ((payload->'questions'->0->'options'->1) ? 'is_correct')
     and payload::text not like '%Explicação privada%'
     from (select public.public_activity(
       (select (value#>>'{}')::uuid from test_keys.state where key='session')
     ) payload) q),
 'public quiz returns labels but never correct-answer flags or explanations');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000062',true);
select test_keys.ok((select count(*)=0 from public.question_options),
 'ordinary authenticated accounts cannot read any correct answers via RLS');
select test_keys.ok((select count(*)=0 from public.questions),
 'ordinary authenticated accounts cannot read unpublished question rows');
select test_keys.denied($q$select public.assessment_results(
 (select (value#>>'{}')::uuid from test_keys.state where key='quiz'))$q$,
 'ordinary authenticated account cannot obtain teacher results');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000061',true);
select test_keys.ok((select count(*)=2 from public.question_options),
 'authorized teacher still sees and corrects answer keys');
select test_keys.ok((select count(*)=1 from public.questions),
 'teacher still sees the activity for editing');
rollback;
