\set ON_ERROR_STOP on
begin;
create schema test_staff;
create function test_staff.ok(condition boolean, label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
create function test_staff.denied(statement text, label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then raise notice 'PASS: % (rejected: %)',label,sqlerrm; return; end;
 raise exception 'FAIL: % was allowed',label;
end $$;
grant usage on schema test_staff to anon,authenticated;
grant execute on all functions in schema test_staff to anon,authenticated;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000031','admin@projeto.test'),
 ('00000000-0000-0000-0000-000000000032','professor@projeto.test'),
 ('00000000-0000-0000-0000-000000000033','segundo@projeto.test'),
 ('00000000-0000-0000-0000-000000000034','sem-acesso@projeto.test');
insert into public.admin_users(user_id,role) values
 ('00000000-0000-0000-0000-000000000031','admin');

set local role anon;
select test_staff.denied('select * from public.list_staff_accounts()',
 'anonymous cannot list staff accounts');
select test_staff.denied($q$select public.authorize_staff_account('sem-acesso@projeto.test','admin')$q$,
 'anonymous cannot grant administrative privileges');
select test_staff.denied($q$select public.revoke_staff_account('00000000-0000-0000-0000-000000000031')$q$,
 'anonymous cannot revoke administrative privileges');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000034',true);
select test_staff.denied('select * from public.list_staff_accounts()',
 'ordinary Auth account cannot list authorized staff');
select test_staff.denied($q$select public.authorize_staff_account('sem-acesso@projeto.test','admin')$q$,
 'ordinary Auth account cannot elevate itself');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
select test_staff.ok((select count(*)=1 from public.list_staff_accounts()),
 'admin can list current authorized users');
select test_staff.denied($q$select public.authorize_staff_account('nao-existe@projeto.test','admin')$q$,
 'nonexistent Auth email is rejected without creating account');
select test_staff.denied($q$select public.authorize_staff_account('professor@projeto.test','service_role')$q$,
 'unknown role cannot be granted');
select test_staff.denied($q$select public.authorize_staff_account('admin@projeto.test','teacher')$q$,
 'admin cannot demote itself');

select public.authorize_staff_account(' PROFESSOR@PROJETO.TEST ','teacher');
select test_staff.ok((select role='teacher' from public.admin_users
 where user_id='00000000-0000-0000-0000-000000000032'),
 'existing Auth user is explicitly authorized as teacher using normalized email');
select test_staff.ok((select email='professor@projeto.test' and role='teacher'
 from public.list_staff_accounts() where user_id='00000000-0000-0000-0000-000000000032'),
 'admin sees authorized email and role without privileged Auth key');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000032',true);
select test_staff.denied($q$select public.authorize_staff_account('sem-acesso@projeto.test','admin')$q$,
 'teacher cannot promote another user');
select test_staff.denied($q$select public.revoke_staff_account('00000000-0000-0000-0000-000000000031')$q$,
 'teacher cannot revoke administrator');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
select public.authorize_staff_account('segundo@projeto.test','admin');
select test_staff.ok((select count(*)=2 from public.admin_users where role='admin'),
 'administrator can authorize a second existing Auth user');
select public.authorize_staff_account('segundo@projeto.test','teacher');
select test_staff.ok((select role='teacher' from public.admin_users
 where user_id='00000000-0000-0000-0000-000000000033'),
 'secondary admin can be demoted when another admin remains');
select public.revoke_staff_account('00000000-0000-0000-0000-000000000033');
select test_staff.ok(not exists(select 1 from public.admin_users
 where user_id='00000000-0000-0000-0000-000000000033'),
 'revoke removes staff authorization only');
select test_staff.ok((select count(*)=4 from auth.users),
 'Auth accounts and passwords are untouched');
select test_staff.denied($q$select public.revoke_staff_account('00000000-0000-0000-0000-000000000031')$q$,
 'self-revocation is blocked even as final administrator');
select test_staff.ok((select count(*)=1 from public.admin_users where role='admin'),
 'at least one administrator remains');
select test_staff.ok((select count(*)=4 from public.audit_events
 where action in ('authorize_staff_account','revoke_staff_account')),
 'grants, demotions and revocations are audited');
rollback;
