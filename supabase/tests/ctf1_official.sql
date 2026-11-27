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
select test_ctf1.ok((select (public.ctf1_student_submit_flag(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team2'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 (select v from test_ctf1.state where k='correct1'))->>'accepted')::boolean=false),
 'team 2 cannot reuse team 1 flag');
select test_ctf1.ok((select (public.ctf1_student_submit_flag(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 (select v from test_ctf1.state where k='correct1'))->>'accepted')::boolean=true),
 'team 1 correct challenge 1 flag accepted by server');
select public.ctf1_student_save_writeup(
 (select (v::jsonb)->>'token' from test_ctf1.state where k='team1'),
 (select v::uuid from test_ctf1.state where k='round'),1::smallint,
 '{"command":"ls","reason":"Investigacao DAC","evidence":"Permissoes registradas"}'::jsonb);
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
rollback;
