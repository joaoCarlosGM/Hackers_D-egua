\set ON_ERROR_STOP on
begin;
create schema test_team;
create table test_team.state (key text primary key, value jsonb);
grant usage on schema test_team to anon,authenticated;
grant select,insert,update on test_team.state to anon,authenticated;
create function test_team.ok(result boolean,description text) returns void language plpgsql as $$
begin if result is distinct from true then raise exception 'FAIL: %',description; end if;
 raise notice 'PASS: %',description; end;
$$;
create function test_team.denied(statement text,description text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then raise notice 'PASS: % (rejected: %)',description,sqlerrm; return; end;
 raise exception 'FAIL: % was allowed',description;
end;
$$;
grant execute on all functions in schema test_team to anon,authenticated;
insert into auth.users values ('00000000-0000-0000-0000-000000000011'),
 ('00000000-0000-0000-0000-000000000012'),('00000000-0000-0000-0000-000000000013');
insert into public.admin_users(user_id,role) values
 ('00000000-0000-0000-0000-000000000011','admin'),
 ('00000000-0000-0000-0000-000000000012','teacher');

set local role anon;
insert into test_team.state
 select 'team1',public.register_team((select id from public.classes where slug='poraque'),
 'Dupla Gerenciada','Ana Teste','Beto Teste');
insert into test_team.state
 select 'team2',public.register_team((select id from public.classes where slug='poraque'),
 'Dupla Vazia','Lia Teste','João Teste');
select test_team.ok((select value ? 'team_id' from test_team.state where key='team1'),
 'anonymous enrollment creates one permanent team');
select test_team.denied($q$select * from public.list_teams_admin()$q$,
 'anonymous cannot view members or credential access codes');
select test_team.denied($q$select public.set_team_status(
  (select (value->>'team_id')::uuid from test_team.state where key='team1'),'inactive')$q$,
 'anonymous cannot deactivate a team');
select test_team.denied('update public.teams set status=''inactive''',
 'anonymous cannot modify the team status directly');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',true);
select test_team.denied($q$select * from public.list_teams_admin()$q$,
 'unapproved Auth account cannot read team data');
select test_team.denied($q$select public.update_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),
 'Invasor','Nome Um','Nome Dois',
 (select id from public.classes where slug='pitiu'))$q$,
 'unapproved Auth account cannot update team');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
select test_team.ok((select count(*)=2 from public.list_teams_admin()),
 'teacher can consult two team records with members');
select test_team.denied($q$select public.delete_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team2'),
 'EXCLUIR qualquer')$q$,
 'teacher cannot delete teams');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.update_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),
 'Dupla Corrigida','Ana Corrigida','Beto Corrigido',
 (select id from public.classes where slug='pitiu'));
select test_team.ok(
 (select public_name='Dupla Corrigida' and class_id=(select id from public.classes where slug='pitiu')
 from public.teams where id=(select (value->>'team_id')::uuid from test_team.state where key='team1')),
 'team renaming and transfer preserve original UUID');
select test_team.ok(
 (select count(*)=2 from public.team_members where
  team_id=(select (value->>'team_id')::uuid from test_team.state where key='team1')
  and full_name in ('Ana Corrigida','Beto Corrigido')),
 'exactly two members are corrected atomically');
select test_team.ok(
 (select public_name='Dupla Corrigida' and class_id=(select id from public.classes where slug='pitiu')
 from public.public_leaderboard where team_id=(select (value->>'team_id')::uuid from test_team.state where key='team1')),
 'public ranking mirrors corrected team and class without changing points');
select test_team.ok(
 (select not can_delete is false and can_transfer from public.list_teams_admin() where public_name='Dupla Corrigida'),
 'team with no history is eligible for transfer');
select test_team.denied($q$select public.update_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),
 'Dupla Vazia','Ana Corrigida','Beto Corrigido',
 (select id from public.classes where slug='poraque'))$q$,
 'normalized team name collision is rejected');

set local role anon;
select test_team.denied($q$select public.team_history(
 (select value->>'token' from test_team.state where key='team1'))$q$,
 'transfer revokes old bearer token');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.set_team_status(
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),'inactive');
select test_team.ok(
 (select status='inactive' from public.teams where id=(select (value->>'team_id')::uuid from test_team.state where key='team1')),
 'team is inactive without deleting record');
set local role anon;
select test_team.ok(
 (select public.login_team((select value->>'access_code' from test_team.state where key='team1'),
  (select value->>'credential' from test_team.state where key='team1')) ? 'error'),
 'inactive team cannot log in even with valid credentials');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.set_team_status(
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),'active');
set local role anon;
select test_team.ok(
 (select public.login_team((select value->>'access_code' from test_team.state where key='team1'),
  (select value->>'credential' from test_team.state where key='team1')) ? 'token'),
 'reactivated team can log in with original credential');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.adjust_ctf(gen_random_uuid(),
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),25,
 'Teste CTF local');
select test_team.ok((select not can_transfer and not can_delete
 from public.list_teams_admin() where public_name='Dupla Corrigida'),
 'CTF score permanently blocks transfer and deletion');
select test_team.denied($q$select public.update_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),
 'Dupla Corrigida','Ana Corrigida','Beto Corrigido',
 (select id from public.classes where slug='poraque'))$q$,
 'transfer after CTF scoring is refused');
select test_team.denied($q$select public.delete_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team1'),
 (select 'EXCLUIR '||value->>'access_code' from test_team.state where key='team1'))$q$,
 'team with CTF history cannot be deleted');
select test_team.denied($q$select public.delete_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team2'),'EXCLUIR errado')$q$,
 'typed confirmation is required');
select public.delete_team(
 (select (value->>'team_id')::uuid from test_team.state where key='team2'),
 (select 'EXCLUIR '||(value->>'access_code') from test_team.state where key='team2'));
select test_team.ok(not exists(select 1 from public.teams where
 id=(select (value->>'team_id')::uuid from test_team.state where key='team2')),
 'unlinked team is deleted');
select test_team.ok((select count(*)=2 from public.team_members),
 'delete does not affect members of the team with history');
select test_team.ok((select count(*)=1 and min(points)=25 from public.ctf_score_events),
 'CTF events survive other team deletion');
select test_team.ok((select points=25 from public.public_leaderboard where
 team_id=(select (value->>'team_id')::uuid from test_team.state where key='team1')),
 'historical leaderboard points are preserved');
select test_team.ok(exists(select 1 from public.audit_events where
 action='delete_team' and target_id=(select (value->>'team_id')::uuid from test_team.state where key='team2')),
 'deleted team remains traceable in private audit');
select test_team.ok((select count(distinct action)=4 from public.audit_events where
 action in ('update_team','deactivate_team','reactivate_team','delete_team')),
 'edit, deactivate, reactivate and delete are all audited');
set constraints all immediate;
rollback;
