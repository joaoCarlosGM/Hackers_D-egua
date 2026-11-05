-- Run manually AFTER creating the intended user's account in Supabase Auth.
-- Replace the placeholder with that existing user's UUID. Never run on every signup.
do $$
declare first_admin uuid := '68638b86-2bc4-41ad-9b9c-11baf2769c48';
begin
 if not exists(select 1 from auth.users where id=first_admin) then raise exception 'UUID inexistente em auth.users'; end if;
 insert into public.admin_users(user_id,role) values(first_admin,'admin')
 on conflict(user_id) do update set role=excluded.role;
 insert into public.audit_events(actor_id,action,target_id) values(first_admin,'bootstrap_admin',first_admin);
end $$;
