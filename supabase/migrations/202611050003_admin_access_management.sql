-- Gestão de acessos da equipe pedagógica: criar conta em Supabase Auth NÃO concede privilégios.
-- Aditiva, não altera dados ou papéis existentes. Requer migrations anteriores.
-- Todas as operações são SERIALIZADAS para impedir revogação do último administrador.

create function public.list_staff_accounts(
  p_offset integer default 0,
  p_limit integer default 200
) returns table (
  user_id uuid,
  email text,
  role text,
  granted_at timestamptz
)
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_admin();
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Paginação inválida';
  end if;
  return query
    select s.user_id, u.email::text, s.role, s.created_at
    from public.admin_users s
    join auth.users u on u.id = s.user_id
    order by s.created_at, s.user_id
    offset p_offset limit p_limit;
end;
$$;

-- Vincula EXCLUSIVAMENTE uma conta Auth preexistente ao perfil admin ou teacher.
-- Nunca cria Auth users, senhas, convites ou elevação automática.
create function public.authorize_staff_account(
  p_email text,
  p_role text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  normalized_email text := lower(btrim(p_email));
  target_id uuid;
  previous_role text;
begin
  perform app_private.require_admin();
  perform pg_catalog.pg_advisory_xact_lock(71263, 18055);

  if normalized_email is null or length(normalized_email) not between 5 and 320
     or position('@' in normalized_email) <= 1 then
    raise exception 'Informe um e-mail válido de uma conta já cadastrada no Supabase Auth';
  end if;
  if p_role is null or p_role not in ('admin', 'teacher') then
    raise exception 'Perfil inválido: use admin ou teacher';
  end if;

  -- Verificar correspondência única para não autorizar um usuário ambíguo.
  if (select count(*) from auth.users u where lower(u.email) = normalized_email) <> 1 then
    raise exception 'Conta não encontrada ou ambígua no Supabase Auth. Crie ou convide a conta no Dashboard primeiro.';
  end if;
  select u.id into target_id
  from auth.users u where lower(u.email) = normalized_email;

  select s.role into previous_role
  from public.admin_users s where s.user_id = target_id for update;

  -- O administrador não pode retirar seu próprio privilégio.
  if target_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Não é permitido rebaixar a própria conta de administrador';
  end if;

  -- Lock serializado + contagem no mesmo snapshot: nunca permitir 0 admins.
  if previous_role = 'admin' and p_role = 'teacher'
    and (select count(*) from public.admin_users where role = 'admin') <= 1 then
    raise exception 'Não é possível rebaixar o último administrador';
  end if;

  insert into public.admin_users(user_id, role)
    values(target_id, p_role)
  on conflict(user_id) do update set role = excluded.role;

  if previous_role is distinct from p_role then
    insert into public.audit_events(actor_id, action, target_id, details)
    values(auth.uid(), 'authorize_staff_account', target_id,
      jsonb_build_object('old_role', previous_role, 'new_role', p_role));
  end if;
  return target_id;
end;
$$;

create function public.revoke_staff_account(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare previous_role text;
begin
  perform app_private.require_admin();
  perform pg_catalog.pg_advisory_xact_lock(71263, 18055);
  if p_user_id is null then raise exception 'Informe uma conta'; end if;
  if p_user_id = auth.uid() then
    raise exception 'Não é permitido remover a própria autorização';
  end if;
  select role into previous_role from public.admin_users
    where user_id = p_user_id for update;
  if previous_role is null then raise exception 'Conta não está autorizada'; end if;
  if previous_role = 'admin'
    and (select count(*) from public.admin_users where role = 'admin') <= 1 then
    raise exception 'Não é possível remover o último administrador';
  end if;

  delete from public.admin_users where user_id = p_user_id;
  insert into public.audit_events(actor_id, action, target_id, details)
    values(auth.uid(), 'revoke_staff_account', p_user_id,
      jsonb_build_object('old_role', previous_role));
end;
$$;

revoke all on function public.list_staff_accounts(integer,integer),
  public.authorize_staff_account(text,text),
  public.revoke_staff_account(uuid) from public, anon, authenticated;
grant execute on function public.list_staff_accounts(integer,integer),
  public.authorize_staff_account(text,text),
  public.revoke_staff_account(uuid) to authenticated;

notify pgrst, 'reload schema';
