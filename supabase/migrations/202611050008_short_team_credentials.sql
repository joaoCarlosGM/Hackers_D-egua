-- Migration 012: novas credenciais curtas para login de duplas no Live Boot.
-- Somente o administrador emite; cada dupla conserva UUID, notas, CTF e presenças.
-- Credenciais antigas (código de 16 hex + segredo de 48 hex) continuam válidas
-- até que o administrador as redefina individualmente.
-- Executar após 011. Não rodar migrations antigas nem testes no Supabase remoto.

create function app_private.generate_team_code(p_length integer)
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text := '';
  i integer;
begin
  if p_length not in (8,12) then
    raise exception 'Comprimento de credencial não autorizado';
  end if;
  bytes := extensions.gen_random_bytes(p_length);
  for i in 0..p_length - 1 loop
    result := result || substr(alphabet, get_byte(bytes,i) % 32 + 1, 1);
  end loop;
  return result;
end;
$$;
revoke all on function app_private.generate_team_code(integer) from public,anon,authenticated;

create or replace function public.rotate_team_credential(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  new_code text;
  new_secret text;
  chosen boolean := false;
  attempt integer;
begin
  perform app_private.require_admin();
  select * into t from public.teams where id=p_team_id for update;
  if t.id is null then
    raise exception 'Dupla não encontrada';
  end if;

  -- Identificador de 8 caracteres (40 bits); segredo de 12 (60 bits).
  -- Alfabeto sem I/O/0/1 para facilitar a digitação no Live Boot.
  new_secret := app_private.generate_team_code(12);
  for attempt in 1..8 loop
    new_code := app_private.generate_team_code(8);
    begin
      update public.teams
         set access_code = new_code,
             credential_hash = extensions.crypt(new_secret,extensions.gen_salt('bf',10)),
             updated_at = clock_timestamp()
       where id=t.id;
      chosen := true;
      exit;
    exception when unique_violation then
      -- Código público colidiu com outra dupla. Gerar outro sem tocar a dupla concorrente.
      chosen := false;
    end;
  end loop;
  if not chosen then
    raise exception 'Não foi possível emitir um código único. Tente novamente.';
  end if;

  -- Somente as sessões desta dupla são revogadas. Outras duplas permanecem conectadas.
  delete from app_private.team_sessions where team_id=t.id;
  delete from app_private.rate_buckets where key = 'login:' || t.id::text;

  -- Auditoria sem registrar código, segredo ou hash.
  insert into public.audit_events(actor_id,action,target_id,details)
    values(auth.uid(),'rotate_team_credential',t.id,
      jsonb_build_object('short_format',true,'sessions_revoked',true));
  -- O segredo aparece somente nesta resposta, não é persistido em texto puro.
  return jsonb_build_object('access_code',new_code,'credential',new_secret);
end;
$$;

create or replace function public.login_team(p_access_code text,p_credential text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  code text := upper(btrim(p_access_code));
  secret text := case when length(btrim(p_credential))=12
                 then upper(btrim(p_credential)) else p_credential end;
  short_format boolean;
begin
  if not app_private.allow_request('login:global',1000,60) then
    return jsonb_build_object('error','Muitas tentativas. Aguarde um minuto.');
  end if;
  short_format := coalesce(code ~ '^[A-HJ-NP-Z2-9]{8}$'
                    and secret ~ '^[A-HJ-NP-Z2-9]{12}$',false);
  -- Conserva as credenciais legadas de 16 e 48 caracteres para quem não foi migrado.
  if not short_format and not
     (coalesce(code ~ '^[0-9A-F]{16}$',false)
      and coalesce(p_credential ~ '^[0-9a-f]{48}$',false)) then
    return jsonb_build_object('error','Código ou credencial inválidos.');
  end if;
  select * into t from public.teams where access_code=code for update;
  if not app_private.allow_request('login:'||coalesce(t.id::text,'unknown'),10,900) then
    return jsonb_build_object('error','Muitas tentativas. Aguarde 15 minutos ou procure o administrador.');
  end if;
  if t.id is null then
    perform extensions.crypt(secret,extensions.gen_salt('bf',10));
    return jsonb_build_object('error','Código ou credencial inválidos.');
  end if;
  if extensions.crypt(secret,t.credential_hash)<>t.credential_hash then
    return jsonb_build_object('error','Código ou credencial inválidos.');
  end if;
  if t.status='inactive' then
    return jsonb_build_object('error','Esta dupla foi desativada. Procure a administração.');
  end if;
  return jsonb_build_object(
    'team_id',t.id,'public_name',t.public_name,
    'class_id',t.class_id,'access_code',t.access_code,
    'token',app_private.new_session(t.id));
end;
$$;

-- O painel usa uma RPC nova: se esta migration não tiver sido aplicada,
-- a emissão falha sem acionar a antiga rotina que gera segredo longo.
create function public.issue_short_team_credential(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $
begin
  perform app_private.require_admin();
  return public.rotate_team_credential(p_team_id);
end;
$;

revoke all on function public.issue_short_team_credential(uuid),
  public.rotate_team_credential(uuid),
  public.login_team(text,text) from public,anon,authenticated;
grant execute on function public.issue_short_team_credential(uuid) to authenticated;
grant execute on function public.rotate_team_credential(uuid) to authenticated;
grant execute on function public.login_team(text,text) to anon,authenticated;
notify pgrst, 'reload schema';
