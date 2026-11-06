\set ON_ERROR_STOP on
begin;
create schema test_weighted;
create table test_weighted.state(key text primary key,value jsonb);
grant usage on schema test_weighted to anon,authenticated;
grant select,insert on test_weighted.state to anon,authenticated;
create function test_weighted.ok(result boolean,label text) returns void language plpgsql as $$
begin
 if result is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
grant execute on function test_weighted.ok(boolean,text) to anon,authenticated;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000051','ranking-test@projeto.test');

set local role anon;
insert into test_weighted.state values
 ('team_one',public.register_team(
  (select id from public.classes where slug='poraque'),
  'CTF Principal','Ana CTF','Beto CTF'));
insert into test_weighted.state values
 ('team_two',public.register_team(
  (select id from public.classes where slug='poraque'),
  'Avaliação Complementar','Lia Avaliação','João Avaliação'));
select test_weighted.ok(
 (select count(*)=2 from public.public_leaderboard
  where is_visible and points=0 and assessment_band=0),
 'new teams enter ranking with zero CTF and zero assessment');

reset role;
insert into public.activities(title,created_by) values
 ('Teste ponderação', '00000000-0000-0000-0000-000000000051');
insert into test_weighted.state
 select 'activity_one',to_jsonb(id) from public.activities where title='Teste ponderação';
insert into public.activity_sessions(activity_id,class_ids,published,status)
values(
 (select (value#>>'{}')::uuid from test_weighted.state where key='activity_one'),
 array[(select id from public.classes where slug='poraque')],true,'open'
);
insert into test_weighted.state
 select 'session_one',to_jsonb(id) from public.activity_sessions
 where activity_id=(select (value#>>'{}')::uuid from test_weighted.state where key='activity_one');
insert into public.attempts(team_id,activity_session_id,submitted_at)
values(
 (select (value->>'team_id')::uuid from test_weighted.state where key='team_one'),
 (select (value#>>'{}')::uuid from test_weighted.state where key='session_one'),
 null
);
insert into test_weighted.state
 select 'attempt_one',to_jsonb(id) from public.attempts
 where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one');
insert into public.grades(attempt_id,points,max_points)
values((select (value#>>'{}')::uuid from test_weighted.state where key='attempt_one'),75,100);
select test_weighted.ok(
 (select assessment_band=0 from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one')),
 'unsubmitted grade does not award ranking points');
update public.attempts set submitted_at=clock_timestamp()
 where id=(select (value#>>'{}')::uuid from test_weighted.state where key='attempt_one');
select test_weighted.ok(
 (select assessment_band=75 and points=0 and solved_count=0
  from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one')),
 'submitted quiz receives 75% assessment component, without new CTF event');

insert into public.ctf_score_events(team_id,points,reason,solved_delta)
values(
 (select (value->>'team_id')::uuid from test_weighted.state where key='team_one'),
 100,'Desafio CTF no laboratório',1
);
select test_weighted.ok(
 (select points=100 and solved_count=1 and assessment_band=75 from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one')),
 'CTF score stays independent of assessment aggregate');

update public.grades set points=50
 where attempt_id=(select (value#>>'{}')::uuid from test_weighted.state where key='attempt_one');
select test_weighted.ok(
 (select assessment_band=50 and points=100 from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one')),
 'pedagogical correction updates only complementary score');

insert into public.attempts(team_id,activity_session_id,submission_no,submitted_at)
values(
 (select (value->>'team_id')::uuid from test_weighted.state where key='team_one'),
 (select (value#>>'{}')::uuid from test_weighted.state where key='session_one'),
 2,clock_timestamp()
);
insert into public.grades(attempt_id,points,max_points)
select id,100,100 from public.attempts where submission_no=2
 and team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one');
select test_weighted.ok(
 (select assessment_band=100 and points=100 from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one')),
 'highest approved submitted retry replaces previous quiz percentage rather than adding twice');

insert into public.activities(title,created_by) values
 ('Segunda avaliação', '00000000-0000-0000-0000-000000000051');
insert into public.activity_sessions(activity_id,class_ids,published,status)
select a.id,array[(select id from public.classes where slug='poraque')],true,'open'
 from public.activities a where a.title='Segunda avaliação';
select test_weighted.ok(
 (select assessment_band=50 from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one')),
 'non-submitted second eligible activity counts zero and keeps the full complement capped');
select test_weighted.ok(
 (select assessment_band=0 from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_two')),
 'other team without grades never inherits first team grades');

-- Public guests can see only rounded aggregate, never protected grades.
set local role anon;
select test_weighted.ok(
 (select count(*)=2 from public.public_leaderboard where is_visible),
 'anonymous ranking lists both active teams');
reset role;
update public.teams set status='inactive'
 where id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one');
set local role anon;
select test_weighted.ok(
 (select count(*)=1 from public.public_leaderboard),
 'anonymous leaderboard hides inactive team with CTF and quiz score');
reset role;
select test_weighted.ok(
 (select points=100 and assessment_band=50 and not is_visible
  from public.public_leaderboard
  where team_id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one')),
 'deactivated team retains raw CTF, aggregate and activity history');
update public.teams set status='active'
 where id=(select (value->>'team_id')::uuid from test_weighted.state where key='team_one');
set local role anon;
select test_weighted.ok(
 (select count(*)=2 from public.public_leaderboard),
 'reactivating restores original team to public ranking');
reset role;
select test_weighted.ok(
 (select count(*)=1 from public.ctf_score_events),
 'quiz grading and retry do not double count CTF events');
rollback;
