-- Bootstrap MANUAL do primeiro administrador (uma vez, depois de criar a conta em Supabase Auth).
-- Se ja existir um admin, use a nova aba Usuarios e permissoes no site.
-- Nunca rode automaticamente em signup. Substitua apenas o e-mail no bloco abaixo.
do $$
declare
 first_admin_email text := 'SUBSTITUA_PELO_EMAIL_DA_CONTA';
 first_admin uuid;
begin
 if first_admin_email = 'SUBSTITUA_PELO_EMAIL_DA_CONTA'
   or length(btrim(first_admin_email)) < 5 then
  raise exception 'Substitua o e-mail de exemplo pelo e-mail da conta que voce criou em Authentication > Users';
 end if;
 if exists(select 1 from public.admin_users where role = 'admin') then
  raise exception 'Ja existe administrador: use a aba Usuarios e permissoes no site para adicionar novos acessos';
 end if;
 if (select count(*) from auth.users where lower(email) = lower(btrim(first_admin_email))) <> 1 then
  raise exception 'Conta nao encontrada ou ambigua no Supabase Auth';
 end if;
 select id into first_admin from auth.users
 where lower(email) = lower(btrim(first_admin_email));
 insert into public.admin_users(user_id,role) values(first_admin,'admin');
 insert into public.audit_events(actor_id,action,target_id,details)
 values(first_admin,'bootstrap_admin',first_admin,jsonb_build_object('provisioning','manual'));
end $$;
