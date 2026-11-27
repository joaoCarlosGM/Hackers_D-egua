\set ON_ERROR_STOP on
begin;
create schema test_ctf1;
create table test_ctf1.state(k text primary key,v text);
grant usage on schema test_ctf1 to anon,authenticated;
grant select,insert,update on test_ctf1.state to anon,authenticated;
create function test_ctf1.ok(condition boolean,label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL CTF1: %',label;end if;
 raise notice 'PASS CTF1: %',label;
end $$;
create function test_ctf1.denied(stmt text,label text) returns void language plpgsql as $$
begin
 begin execute stmt;
 exception when others then raise notice 'PASS CTF1: % denied',label;return;end;
 raise exception 'FAIL CTF1: % allowed',label;
end $$;
grant execute on all functions in schema test_ctf1 to anon,authenticated;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000191','ctf1-teacher@test.invalid'),
 ('00000000-0000-0000-0000-000000000192','ctf1-outsider@test.invalid');
insert into public.admin_users(user_id,role)
values('00000000-0000-0000-0000-000000000191','teacher');

set local role anon;
insert into test_ctf1.state values('team1',public.register_team(
 (select id from public.classes where slug='poraque'),
 'Dupla CTF1 Alfa','Aluno CTF1 Alfa','Aluna CTF1 Alfa')::text);
insert into test_ctf1.state values('team2',public.register_team(
 (select id from public.classes where slug='poraque'),
 'Dupla CTF1 Beta','Aluno CTF1 Beta','Aluna CTF1 Beta')::text);
select test_ctf1.denied($q$select * from public.ctf1_official_rounds$q$,
 'anonymous cannot directly read any official round');
select test_ctf1.denied($q$select public.ctf1_staff_create_round(
 array[(select id from public.classes where slug='poraque')],'Teste CTF Aula 7')$q$,
 'anonymous cannot create round');
select test_ctf1.denied($q$select app_private.ctf1_flag_value(
 gen_random_uuid(),gen_random_uuid(),1::smallint)$q$,
 'anonymous cannot request hidden HMAC secret-derived flag');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000192',true);
select test_ctf1.denied($q$select public.ctf1_staff_create_round(
 array[(select id from public.classes where slug='poraque')],'Teste CTF Aula 7')$q$,
 'ordinary user cannot create a round');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
insert into test_ctf1.state values('round',public.ctf1_staff_create_round(
 array[(select id from public.classes where slug='poraque')],'Teste CTF Aula 7')::text);
reset role;
select test_ctf1.ok((select count(*)=2 from public.ctf1_official_participations
 where round_id=(select v::uuid from test_ctf1.state where k='round')),
 'two registered teams enrolled in CTF1');
select test_ctf1.ok((select state='draft' and started_at is null
 from public.ctf1_official_rounds where id=(select v::uuid from test_ctf1.state where k='round')),
 'round does not start on team login');
set local role anon;
select test_ctf1.denied($q$select public.ctf1_student_submit_flag(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,'FLAG{unused}')$q$,
 'students cannot submit before professor starts');
select test_ctf1.ok((select (x->>'state')='draft'
 from jsonb_array_elements(public.ctf1_student_status(
  (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'))) x limit 1)
 is distinct from true,
 'unstarted round is not visible to student');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select public.ctf1_staff_start_round((select v::uuid from test_ctf1.state where k='round'));
select test_ctf1.denied($q$select public.ctf1_staff_start_round(
 (select v::uuid from test_ctf1.state where k='round'))$q$,
 'same round cannot start a second time');
reset role;
select test_ctf1.ok((select ends_at-started_at=interval '60 minutes'
 from public.ctf1_official_rounds where id=(select v::uuid from test_ctf1.state where k='round')),
 'authoritative server start creates exactly one-hour window');

-- The test harness is postgres; never permit this access to anon/authenticated.
reset role;
insert into test_ctf1.state values ('correct1',app_private.ctf1_flag_value(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team1'),1::smallint));
insert into test_ctf1.state values ('correct2',app_private.ctf1_flag_value(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2'),1::smallint));
select test_ctf1.ok((select (select v from test_ctf1.state where k='correct1') <>
 (select v from test_ctf1.state where k='correct2')),
 'challenge flags differ between registered teams');

set local role anon;
-- Legacy flag/write-up endpoints must not bypass the sequential contract.
select test_ctf1.denied($q$select public.ctf1_student_submit_flag(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 (select v from test_ctf1.state where k='correct1'))$q$,
 'legacy flag endpoint is blocked');
select test_ctf1.denied($q$select public.ctf1_student_save_writeup(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 '{"command":"ls","reason":"Investigacao DAC","evidence":"Permissoes registradas"}'::jsonb)$q$,
 'legacy writeup endpoint is blocked');
select test_ctf1.denied($q$select public.ctf1_student_complete_challenge(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),2::smallint,
 'FLAG{unused}',
 '{"command":"ls","reason":"Investigacao DAC","evidence":"Permissoes registradas"}'::jsonb)$q$,
 'cannot skip challenge 1');
select test_ctf1.ok((select (public.ctf1_student_complete_challenge(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 (select v from test_ctf1.state where k='correct1'),
 '{"command":"ls","reason":"Investigacao DAC","evidence":"Permissoes registradas"}'::jsonb)->>'accepted')::boolean=false),
 'team 2 cannot reuse team 1 flag');
-- Incorrect D1 is nevertheless a final delivery, so the team may advance.
select test_ctf1.ok((select (public.ctf1_student_progress(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'))->'completed')='[1]'::jsonb),
 'incorrect flag counts as delivered, not correct');
select test_ctf1.ok((select (public.ctf1_student_progress(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'))->'solved')='[]'::jsonb),
 'wrong flag cannot increase correct count');
select test_ctf1.denied($q$select public.ctf1_student_complete_challenge(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 (select v from test_ctf1.state where k='correct1'),
 '{"command":"ls","reason":"teste","evidence":"teste"}'::jsonb)$q$,
 'wrong submitted flag cannot be retried after delivery');

select test_ctf1.ok((select (public.ctf1_student_complete_challenge(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 (select v from test_ctf1.state where k='correct1'),
 '{"command":"ls","reason":"Investigacao DAC","evidence":"Permissoes registradas"}'::jsonb)->>'accepted')::boolean=true),
 'team 1 completes challenge 1 with write-up atomically');
select test_ctf1.denied($q$select public.ctf1_student_complete_challenge(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 (select v from test_ctf1.state where k='correct1'),
 '{"command":"ls","reason":"Investigacao DAC","evidence":"Permissoes registradas"}'::jsonb)$q$,
 'cannot submit challenge 1 again');
select test_ctf1.ok((select public.ctf1_student_append_challenge_commands(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),2::smallint,
 '["cat missao.txt","ls -la"]'::jsonb)=2),
 'new challenge command audit captures commands');
reset role;
insert into test_ctf1.state values ('correct2team2',app_private.ctf1_flag_value(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2'),2::smallint));
insert into test_ctf1.state values ('correct3team2',app_private.ctf1_flag_value(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2'),3::smallint));
set local role anon;
select test_ctf1.ok((select (public.ctf1_student_complete_challenge(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'),2::smallint,
 (select v from test_ctf1.state where k='correct2team2'),
 '{"command":"grep","reason":"Log SSH","evidence":"IP confirmado"}'::jsonb)->>'accepted')::boolean=true),
 'second challenge advances after first wrong flag');
select test_ctf1.ok((select (public.ctf1_student_complete_challenge(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'),3::smallint,
 (select v from test_ctf1.state where k='correct3team2'),
 '{"command":"sha256sum","reason":"Hash verificado","evidence":"Cofre resolvido"}'::jsonb)->>'next_challenge') is null),
 'third write-up closes progress');
select test_ctf1.ok((select (public.ctf1_student_progress(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'))->'solved')='[2,3]'::jsonb),
 'finished team has exactly 2 of 3 correct flags');
reset role;
select test_ctf1.ok((select count(*)=3 and bool_and(elapsed_seconds is not null and elapsed_seconds>=0)
 from public.ctf1_official_writeups
 where round_id=(select v::uuid from test_ctf1.state where k='round')
  and team_id=(select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2')),
 'all three durations persisted by server');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select test_ctf1.ok((select exists(
 select 1 from jsonb_array_elements(public.ctf1_staff_challenge_results(
 (select v::uuid from test_ctf1.state where k='round'))) x
 where x->>'team_id'=(select (v::jsonb)->>'team_id' from test_ctf1.state where k='team2')
  and x->'correct'='[2,3]'::jsonb and x->'delivered'='[1,2,3]'::jsonb
  and (x->>'total_seconds')::integer>=0)),
 'teacher sees 2/3 flags, 3/3 delivered and elapsed time');
reset role;


reset role;
select test_ctf1.ok((select count(*)=1 from public.ctf1_official_writeups
 where round_id=(select v::uuid from test_ctf1.state where k='round')
 and team_id=(select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team1')),
 'student writeup is saved only for own team');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select test_ctf1.denied($q$select public.ctf1_staff_grade(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team1'),
 '{"mission1":31,"mission2":60,"mission3":80,"writeup1":10,"writeup2":10,"writeup3":10}'::jsonb,
 'Tentativa acima do limite previsto')$q$,
 'teacher cannot record mission score above thirty');
select test_ctf1.ok((select public.ctf1_staff_grade(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team1'),
 '{"mission1":30,"mission2":60,"mission3":80,"writeup1":10,"writeup2":10,"writeup3":10}'::jsonb,
 'Correcoes e evidencias revisadas pelo instrutor')=200),
 'full mission and write-up scores total 200');
select public.ctf1_staff_exclude(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2'),
 'Exclusao de teste, historico preservado');
reset role;
select test_ctf1.ok((select excluded_at is not null from public.ctf1_official_participations
 where round_id=(select v::uuid from test_ctf1.state where k='round') and
 team_id=(select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2')),
 'exclusion is soft and retains participation');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select public.ctf1_staff_restore(
 (select v::uuid from test_ctf1.state where k='round'),
 (select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2'),
 'Restaurado apos verificacao administrativa');
reset role;
select test_ctf1.ok((select excluded_at is null from public.ctf1_official_participations
 where round_id=(select v::uuid from test_ctf1.state where k='round') and
 team_id=(select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k='team2')),
 'restore returns team to round without deleting audit');
select test_ctf1.ok((select count(*)=0 from public.ctf_score_events
 where team_id in (
  select ((v::jsonb)->>'team_id')::uuid from test_ctf1.state where k in ('team1','team2'))),
 'new CTF grading does not publish points into legacy ranking by accident');

-- Class-wide rehearsals: 7 active Poraque teams and 9 active Pitiu
-- teams in the disposable database. Never permit a mixed-class round.
reset role;
insert into public.teams(class_id,public_name,credential_hash)
select (select id from public.classes where slug='poraque'),
 'CTF1 Poraque Teste '||n,
 extensions.crypt('senha-descartavel',extensions.gen_salt('bf',10))
from generate_series(1,5) n;
insert into public.teams(class_id,public_name,credential_hash)
select (select id from public.classes where slug='pitiu'),
 'CTF1 Pitiu Teste '||n,
 extensions.crypt('senha-descartavel',extensions.gen_salt('bf',10))
from generate_series(1,9) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select test_ctf1.denied($q$select public.ctf1_staff_create_round(
 array[(select id from public.classes where slug='poraque'),(select id from public.classes where slug='pitiu')],
 'Dupla turma proibida')$q$, 'round cannot combine Poraque and Pitiu');
select test_ctf1.denied($q$select public.ctf1_staff_create_round(
 array[(select id from public.classes where slug='poraque')],
 'Roster manual proibido','test',
 array[(select id from public.teams where public_name='CTF1 Poraque Teste 1')])$q$,
 'round cannot choose manual subset of a class');
insert into test_ctf1.state values('seven',public.ctf1_staff_create_round(
 array[(select id from public.classes where slug='poraque')],
 'Ensaio Turma Poraque')::text);
insert into test_ctf1.state values('nine',public.ctf1_staff_create_round(
 array[(select id from public.classes where slug='pitiu')],
 'Ensaio Turma Pitiu')::text);
reset role;
select test_ctf1.ok((select count(*)=7 from public.ctf1_official_participations
 where round_id=(select v::uuid from test_ctf1.state where k='seven')),
 'all seven active Poraque teams enrolled automatically');
select test_ctf1.ok((select count(*)=9 from public.ctf1_official_participations
 where round_id=(select v::uuid from test_ctf1.state where k='nine')),
 'all nine active Pitiu teams enrolled automatically');
select test_ctf1.ok((select count(*)=0 from public.ctf1_official_participations a
 join public.ctf1_official_participations b on a.team_id=b.team_id
 where a.round_id=(select v::uuid from test_ctf1.state where k='seven')
 and b.round_id=(select v::uuid from test_ctf1.state where k='nine')),
 'class participants are not enrolled across class rounds');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select public.ctf1_staff_start_round((select v::uuid from test_ctf1.state where k='seven'));
select public.ctf1_staff_end_round((select v::uuid from test_ctf1.state where k='seven'));
select public.ctf1_staff_start_round((select v::uuid from test_ctf1.state where k='nine'));
reset role;
select test_ctf1.ok((select state='ended' from public.ctf1_official_rounds
 where id=(select v::uuid from test_ctf1.state where k='seven')),
 'first class rehearsal can be closed before next class');
select test_ctf1.ok((select state='running' and ends_at-started_at=interval '60 minutes'
 from public.ctf1_official_rounds
 where id=(select v::uuid from test_ctf1.state where k='nine')),
 'second class independently gets exactly one hour');

-- Extensions are staff-only, atomic and affect only the deadline.
set local role anon;
select test_ctf1.denied($q$select public.ctf1_staff_extend_round_10m(
 (select v::uuid from test_ctf1.state where k='nine'))$q$,
 'student cannot extend the competition');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000192',true);
select test_ctf1.denied($q$select public.ctf1_staff_extend_round_10m(
 (select v::uuid from test_ctf1.state where k='nine'))$q$,
 'non-staff cannot grant extra time');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select test_ctf1.ok((select (public.ctf1_staff_extend_round_10m(
 (select v::uuid from test_ctf1.state where k='nine'))->>'minutes_added')::integer=10),
 'teacher can grant ten minutes');
reset role;
select test_ctf1.ok((select state='running' and duration_seconds=3600
 and ends_at-started_at=interval '70 minutes'
 from public.ctf1_official_rounds
 where id=(select v::uuid from test_ctf1.state where k='nine')),
 'extension changes deadline, not timer origin, state or duration config');
select test_ctf1.ok((select count(*)=1 and bool_and((detail->>'minutes')::integer=10)
 from public.ctf1_official_audit
 where round_id=(select v::uuid from test_ctf1.state where k='nine')
 and kind='round_extend'),
 'teacher extension is stored in audit with ten minutes');
select test_ctf1.ok((select state='ended'
 and ends_at<=started_at+interval '60 minutes'
 from public.ctf1_official_rounds
 where id=(select v::uuid from test_ctf1.state where k='seven')),
 'other class remains ended and does not receive extra time');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select test_ctf1.denied($q$select public.ctf1_staff_extend_round_10m(
 (select v::uuid from test_ctf1.state where k='seven'))$q$,
 'ended round cannot be extended');
reset role;



-- Discard the previously started Poraque rehearsal; do not delete any
-- participation, submission or audit row. Pitiu must remain independent.
set local role anon;
select test_ctf1.denied($q$select public.ctf1_staff_discard_round(
 (select v::uuid from test_ctf1.state where k='seven'),
 'Sem permissao para descartar rodada')$q$,
 'student cannot discard a rehearsal');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000192',true);
select test_ctf1.denied($q$select public.ctf1_staff_discard_round(
 (select v::uuid from test_ctf1.state where k='seven'),
 'Usuario sem acesso de professor')$q$,
 'non-staff cannot discard a rehearsal');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select public.ctf1_staff_discard_round(
 (select v::uuid from test_ctf1.state where k='seven'),
 'Reinicio de testes da turma Poraque');
select test_ctf1.denied($q$select public.ctf1_staff_discard_round(
 (select v::uuid from test_ctf1.state where k='seven'),
 'Tentativa de descartar novamente')$q$,
 'same round cannot be discarded again');
reset role;
select test_ctf1.ok((select state='discarded' and discarded_at is not null
 from public.ctf1_official_rounds where id=(select v::uuid from test_ctf1.state where k='seven')),
 'discarded round persists with time marker');
select test_ctf1.ok((select count(*)=7 from public.ctf1_official_participations
 where round_id=(select v::uuid from test_ctf1.state where k='seven')),
 'discard preserves all seven team participation records');
select test_ctf1.ok((select count(*)=1 from public.ctf1_official_audit
 where round_id=(select v::uuid from test_ctf1.state where k='seven') and kind='round_discard'),
 'discard reason and event retained in audit log');
select test_ctf1.ok((select state='running' from public.ctf1_official_rounds
 where id=(select v::uuid from test_ctf1.state where k='nine')),
 'Pitiu round unaffected by Poraque discard');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select test_ctf1.ok(not exists(
 select 1 from jsonb_array_elements(public.ctf1_staff_list_rounds()) x
 where (x->>'id')::uuid=(select v::uuid from test_ctf1.state where k='seven')),
 'discard removed from active teacher round list');


-- Live staff monitoring must identify terminal activity even before any flag.
-- This is a read-only projection of pre-existing student telemetry.
reset role;
insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(
  (select v::uuid from test_ctf1.state where k='nine'),
  (select p.team_id from public.ctf1_official_participations p
   where p.round_id=(select v::uuid from test_ctf1.state where k='nine') limit 1),
  'terminal_event','{"command":"ls -la"}'::jsonb);
insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(
  (select v::uuid from test_ctf1.state where k='nine'),
  (select p.team_id from public.ctf1_official_participations p
   where p.round_id=(select v::uuid from test_ctf1.state where k='nine') limit 1),
  'terminal_event','{"command":"cat missao.txt"}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000191',true);
select test_ctf1.ok(
 exists (select 1 from jsonb_array_elements(
 public.ctf1_staff_dashboard((select v::uuid from test_ctf1.state where k='nine'))->'teams') x
 where x->>'first_activity_at' is not null
 and x->>'last_activity_at' is not null
 and x->>'mission_opened_at' is not null
 and x->'solved'='[]'::jsonb),
 'staff sees start and missao.txt before flags, with zero missions solved');

rollback;
