\set ON_ERROR_STOP on
begin;
create schema test_attendance;
create function test_attendance.ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end;
$$;
create function test_attendance.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then raise notice 'PASS: %: %',label,sqlerrm; return; end;
 raise exception 'FAIL: % unexpectedly permitted',label;
end;
$$;
grant usage on schema test_attendance to anon,authenticated;
grant execute on all functions in schema test_attendance to anon,authenticated;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000041','admin-presenca@projeto.test'),
 ('00000000-0000-0000-0000-000000000042','professor-presenca@projeto.test'),
 ('00000000-0000-0000-0000-000000000043','sem-acesso-presenca@projeto.test');
insert into public.admin_users(user_id,role) values
 ('00000000-0000-0000-0000-000000000041','admin'),
 ('00000000-0000-0000-0000-000000000042','teacher');
create table test_attendance.fixtures(key text primary key,value text);
grant select,insert,update on test_attendance.fixtures to anon,authenticated;

set local role anon;
insert into test_attendance.fixtures(key,value)
 select 'poraque_team',public.register_team(
  (select id from public.classes where slug='poraque'),
  'Dupla Aula','Ana Aula','Beto Aula')::text;
insert into test_attendance.fixtures(key,value)
 select 'pitiu_team',public.register_team(
  (select id from public.classes where slug='pitiu'),
  'Dupla Pitiú','Carlos Aula','Dora Aula')::text;
select test_attendance.denied($q$select * from public.list_attendance_lessons(null)$q$,
 'anonymous cannot query lesson list');
select test_attendance.denied($q$select public.create_attendance_lesson(
 (select id from public.classes where slug='poraque'),
 'Comandos Linux','2026-11-05')$q$,
 'anonymous cannot create a lesson');
select test_attendance.denied($q$select count(*) from public.attendance_lessons$q$,
 'anonymous cannot read attendance tables directly');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000043',true);
select test_attendance.denied($q$select * from public.list_attendance_lessons(null)$q$,
 'ordinary Auth account cannot read attendance');
select test_attendance.denied($q$select public.create_attendance_lesson(
 (select id from public.classes where slug='poraque'),
 'Comandos Linux','2026-11-05')$q$,
 'ordinary Auth account cannot create attendance');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000042',true);
select test_attendance.ok((select count(*)=0 from public.list_attendance_lessons(null)),
 'teacher sees empty lesson list');
select test_attendance.denied($q$select public.create_attendance_lesson(
 (select id from public.classes where slug='poraque'),
 'Comandos Linux','2026-11-05')$q$,
 'teacher cannot create a lesson');
select test_attendance.denied($q$select public.save_attendance_marks(
 gen_random_uuid(),'[]'::jsonb)$q$,'teacher cannot register presence');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000041',true);
insert into test_attendance.fixtures(key,value)
 select 'lesson',public.create_attendance_lesson(
  (select id from public.classes where slug='poraque'),
  'Aula 02 — Comandos Linux','2026-11-05')::text;
select test_attendance.ok((select students=2 and present=0 and absent=0 and unmarked=2
 from public.list_attendance_lessons(null) where id=(select value::uuid from test_attendance.fixtures where key='lesson')),
 'new lesson has two individually unmarked students');
select test_attendance.ok((select count(*)=2 from public.list_attendance_roster(
 (select value::uuid from test_attendance.fixtures where key='lesson'))),
 'roster includes both students in the registered double');
select test_attendance.denied($q$select public.create_attendance_lesson(
 (select id from public.classes where slug='poraque'),
 'Aula 02 — Comandos Linux','2026-11-05')$q$,
 'duplicate class/day/title lesson is blocked');

select public.save_attendance_marks(
 (select value::uuid from test_attendance.fixtures where key='lesson'),
 (select jsonb_agg(jsonb_build_object('member_id',m.id,'status',
  case when m.position=1 then 'present' else 'absent' end))
 from public.team_members m
 where m.team_id=(select (value::jsonb->>'team_id')::uuid
 from test_attendance.fixtures where key='poraque_team'))
);
select test_attendance.ok((select students=2 and present=1 and absent=1 and justified=0 and unmarked=0
 from public.list_attendance_lessons(null) where id=(select value::uuid from test_attendance.fixtures where key='lesson')),
 'present and absent status saved separately for duo members');
select test_attendance.ok((select count(*)=2 from public.attendance_marks),
 'only two explicit attendance marks exist');
select test_attendance.denied($q$select public.save_attendance_marks(
 (select value::uuid from test_attendance.fixtures where key='lesson'),
 (select jsonb_agg(jsonb_build_object('member_id',m.id,'status','present'))
 from public.team_members m where m.team_id=(select (value::jsonb->>'team_id')::uuid
 from test_attendance.fixtures where key='pitiu_team')))$q$,
 'member from another class cannot be marked');
select test_attendance.denied($q$select public.save_attendance_marks(
 (select value::uuid from test_attendance.fixtures where key='lesson'),
 (select jsonb_agg(jsonb_build_object('member_id',m.id,'status','unknown'))
 from public.team_members m where m.team_id=(select (value::jsonb->>'team_id')::uuid
 from test_attendance.fixtures where key='poraque_team')))$q$,
 'unknown attendance status rejected');
select test_attendance.ok((select count(*)=2 from public.attendance_marks),
 'invalid batch cannot partially alter marks');

select public.save_attendance_marks(
 (select value::uuid from test_attendance.fixtures where key='lesson'),
 (select jsonb_agg(jsonb_build_object('member_id',m.id,'status',
  case when m.position=1 then 'present' else 'justified' end))
 from public.team_members m
 where m.team_id=(select (value::jsonb->>'team_id')::uuid
 from test_attendance.fixtures where key='poraque_team'))
);
select test_attendance.ok((select absent=0 and justified=1 and present=1
 from public.list_attendance_lessons(null) where id=(select value::uuid from test_attendance.fixtures where key='lesson')),
 'administrator can correct an absence to justified');
select test_attendance.denied($q$select public.update_team(
 (select (value::jsonb->>'team_id')::uuid from test_attendance.fixtures where key='poraque_team'),
 'Dupla Aula','Ana Aula','Beto Aula',
 (select id from public.classes where slug='pitiu'))$q$,
 'duo with marked presence cannot be moved to another class');
select test_attendance.ok(
 (select not can_transfer and not can_delete from public.list_teams_admin()
 where id=(select (value::jsonb->>'team_id')::uuid from test_attendance.fixtures where key='poraque_team')),
 'duo marked attendance disables transfer and deletion in the admin list');
select test_attendance.denied($q$select public.delete_team(
 (select (value::jsonb->>'team_id')::uuid from test_attendance.fixtures where key='poraque_team'),
 (select 'EXCLUIR '||(value::jsonb->>'access_code') from test_attendance.fixtures where key='poraque_team'))$q$,
 'attendance records are protected from team deletion');
select test_attendance.ok((select count(*)=2 from public.attendance_marks),
 'historical attendance remains after blocked deletion');
select test_attendance.ok((select count(*)=2 from public.audit_events
 where action='attendance_marks_saved'),
 'each saved attendance batch is audited without logging student names');
rollback;
