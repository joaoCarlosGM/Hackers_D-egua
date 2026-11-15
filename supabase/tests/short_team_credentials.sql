\set ON_ERROR_STOP on
begin;
create schema test_short;
create table test_short.state (key text primary key, value jsonb);
grant usage on schema test_short to anon,authenticated;
grant select,insert,update on test_short.state to anon,authenticated;
create function test_short.ok(value boolean, label text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end;
$$;
create function test_short.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then raise notice 'PASS: % denied',label; return; end;
 raise exception 'FAIL: % permitted',label;
end;
$$;
grant execute on all functions in schema test_short to anon,authenticated;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000081','admin-short@test.invalid'),
 ('00000000-0000-0000-0000-000000000082','teacher-short@test.invalid'),
 ('00000000-0000-0000-0000-000000000083','ordinary-short@test.invalid');
insert into public.admin_users(user_id,role) values
 ('00000000-0000-0000-0000-000000000081','admin'),
 ('00000000-0000-0000-0000-000000000082','teacher');

set local role anon;
insert into test_short.state select 'team1',public.register_team(
 (select id from public.classes where slug='poraque'),'Dupla Kali','Aluna Kali','Aluno Kali');
insert into test_short.state select 'team2',public.register_team(
 (select id from public.classes where slug='pitiu'),'Dupla Legada','Ana Legada','Beto Legado');
select test_short.ok(
 (select length(value->>'access_code')=16 and length(value->>'credential')=48
 from test_short.state where key='team1'), 'existing registration remains legacy-compatible');
select test_short.ok(
 (select public.login_team(
  (select value->>'access_code' from test_short.state where key='team2'),
  (select value->>'credential' from test_short.state where key='team2')) ? 'token'),
 'legacy duo can still sign in');

select test_short.denied($q$select public.rotate_team_credential(
 (select (value->>'team_id')::uuid from test_short.state where key='team1'))$q$,
 'anonymous cannot issue a new credential');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000082',true);
select test_short.denied($q$select public.rotate_team_credential(
 (select (value->>'team_id')::uuid from test_short.state where key='team1'))$q$,
 'teacher cannot issue credentials');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000083',true);
select test_short.denied($q$select public.rotate_team_credential(
 (select (value->>'team_id')::uuid from test_short.state where key='team1'))$q$,
 'ordinary Supabase user cannot issue credentials');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select public.adjust_ctf(gen_random_uuid(),
 (select (value->>'team_id')::uuid from test_short.state where key='team1'),
 42,'Pontos anteriores às credenciais curtas');
insert into test_short.state select 'new1',public.rotate_team_credential(
 (select (value->>'team_id')::uuid from test_short.state where key='team1'));
select test_short.ok(
 (select length(value->>'access_code')=8 and length(value->>'credential')=12
   and (value->>'access_code') ~ '^[A-HJ-NP-Z2-9]{8}$'
   and (value->>'credential') ~ '^[A-HJ-NP-Z2-9]{12}$'
 from test_short.state where key='new1'),
 'short credentials use a non-ambiguous alphabet and fixed lengths');
select test_short.ok(
 (select credential_hash <> (select value->>'credential' from test_short.state where key='new1')
 from public.teams where id=(select (value->>'team_id')::uuid from test_short.state where key='team1')),
 'secret never stored in plaintext');
select test_short.ok(
 (select points=42 from public.public_leaderboard
 where team_id=(select (value->>'team_id')::uuid from test_short.state where key='team1')),
 'issuing credentials does not alter the historic scoreboard');
select test_short.ok(
 (select not exists(select 1 from public.audit_events e
 where e.action='rotate_team_credential'
 and e.details::text like '%' || (select value->>'credential' from test_short.state where key='new1') || '%')),
 'private code does not appear in audit details');

set local role anon;
select test_short.ok(
 (select public.login_team(
  (select value->>'access_code' from test_short.state where key='team1'),
  (select value->>'credential' from test_short.state where key='team1')) ? 'error'),
 'previous long login revoked only for rotated team');
select test_short.denied($q$select public.team_history(
 (select value->>'token' from test_short.state where key='team1'))$q$,
 'old bearer token revoked on rotation');
select test_short.ok(
 (select public.login_team(
  (select value->>'access_code' from test_short.state where key='new1'),
  (select value->>'credential' from test_short.state where key='new1')) ? 'token'),
 'new eight/twelve character duo credentials work');
select test_short.ok(
 (select public.login_team(
  lower((select value->>'access_code' from test_short.state where key='new1')),
  lower((select value->>'credential' from test_short.state where key='new1'))) ? 'token'),
 'short credentials are case-insensitive to help Live Boot typing');
select test_short.ok(
 (select public.login_team(
  (select value->>'access_code' from test_short.state where key='team2'),
  (select value->>'credential' from test_short.state where key='team2')) ? 'token'),
 'other duo retains legacy credentials unchanged');
select test_short.ok(
 (select public.team_history(
  (select value->>'token' from test_short.state where key='team2')) ? 'team'),
 'other duo session is not revoked');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select public.set_team_status(
 (select (value->>'team_id')::uuid from test_short.state where key='team1'),'inactive');
set local role anon;
select test_short.ok(
 (select public.login_team(
  (select value->>'access_code' from test_short.state where key='new1'),
  (select value->>'credential' from test_short.state where key='new1')) ? 'error'),
 'inactive duo remains locked even with correct short credentials');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select public.set_team_status(
 (select (value->>'team_id')::uuid from test_short.state where key='team1'),'active');
select test_short.ok(
 (select count(*)=1 from public.ctf_score_events
 where team_id=(select (value->>'team_id')::uuid from test_short.state where key='team1')),
 'CTF event history remains intact');
rollback;
