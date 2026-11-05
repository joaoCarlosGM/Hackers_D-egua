-- Gerenciamento aditivo de duplas: exige migrations 001–005.
-- Não executar em projeto remoto antes de revisar; não apaga dados existentes.
alter table public.teams
 add column status text not null default 'active'
 check (status in ('active','inactive'));

-- Somente integrantes e dados administrativos não sensíveis; nenhum hash ou token é exposto.
create function public.list_teams_admin(p_offset integer default 0,p_limit integer default 500)
returns table (
 id uuid, public_name text, class_id uuid, access_code text, status text,
 member1 text, member2 text, attempt_count bigint, ctf_event_count bigint,
 can_transfer boolean, can_delete boolean
) language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then
  raise exception 'Paginação inválida';
 end if;
 return query
 select t.id,t.public_name,t.class_id,t.access_code,t.status,
   (select m.full_name from public.team_members m where m.team_id=t.id and m.position=1),
   (select m.full_name from public.team_members m where m.team_id=t.id and m.position=2),
   (select count(*) from public.attempts a where a.team_id=t.id),
   (select count(*) from public.ctf_score_events e where e.team_id=t.id),
   not exists(select 1 from public.attempts a where a.team_id=t.id)
     and not exists(select 1 from public.ctf_score_events e where e.team_id=t.id)
     and not exists(select 1 from public.public_leaderboard r where r.team_id=t.id and (r.points<>0 or r.solved_count<>0)),
   not exists(select 1 from public.attempts a where a.team_id=t.id)
     and not exists(select 1 from public.ctf_score_events e where e.team_id=t.id)
     and not exists(select 1 from public.public_leaderboard r where r.team_id=t.id and (r.points<>0 or r.solved_count<>0))
 from public.teams t
 order by t.public_name,t.id offset p_offset limit p_limit;
end;
$$;

-- Edição atômica de nome público e dos dois integrantes; transferência somente sem histórico.
create function public.update_team(
 p_team_id uuid,p_public_name text,p_member1 text,p_member2 text,p_class_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare t public.teams; label text:=btrim(p_public_name);
 first_name text:=btrim(p_member1); second_name text:=btrim(p_member2);
 moving boolean;
begin
 perform app_private.require_admin();
 select * into t from public.teams where id=p_team_id for update;
 if t.id is null then raise exception 'Dupla não encontrada'; end if;
 if label is null or length(label) not between 2 and 80 or
    first_name is null or length(first_name) not between 3 and 160 or
    second_name is null or length(second_name) not between 3 and 160 then
  raise exception 'Informe o apelido (2–80 caracteres) e os dois nomes completos (3–160 caracteres)';
 end if;
 if p_class_id is null then raise exception 'Selecione a turma'; end if;
 moving := p_class_id<>t.class_id;
 if moving then
  perform 1 from public.classes where id=p_class_id and status='active' for share;
  if not found then raise exception 'A turma de destino não existe ou está arquivada'; end if;
  if exists(select 1 from public.attempts where team_id=t.id)
     or exists(select 1 from public.ctf_score_events where team_id=t.id)
     or exists(select 1 from public.public_leaderboard where team_id=t.id and (points<>0 or solved_count<>0)) then
    raise exception 'A dupla possui histórico de atividades ou CTF; não é possível transferi-la. Preserve os registros anteriores.';
  end if;
 end if;
 -- O índice único (turma, apelido normalizado) protege contra colisões.
 update public.teams
  set public_name=label,class_id=p_class_id,updated_at=clock_timestamp()
  where id=t.id;
 update public.team_members set full_name=case position when 1 then first_name else second_name end
  where team_id=t.id;
 if (select count(*) from public.team_members where team_id=t.id)<>2 then
  raise exception 'Cadastro incompleto: a dupla precisa ter dois integrantes';
 end if;
 update public.public_leaderboard
  set public_name=label,class_id=p_class_id,updated_at=clock_timestamp()
  where team_id=t.id;
 if moving then
  -- Troca de turma encerra sessões de acesso existentes, não altera credenciais permanentes.
  delete from app_private.team_sessions where team_id=t.id;
 end if;
 insert into public.audit_events(actor_id,action,target_id,details)
  values(auth.uid(),'update_team',t.id,
   jsonb_build_object('old_class_id',t.class_id,'new_class_id',p_class_id,
    'public_name_changed',t.public_name is distinct from label,
    'members_updated',true,'sessions_revoked',moving));
 -- Não gravar os nomes pessoais dos integrantes nos detalhes de auditoria.
end;
$$;

-- Bloquear login e qualquer bearer anterior quando a dupla está inativa.
create or replace function app_private.team_for_token(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if p_token is null or length(p_token)<>64 then
  raise exception 'Sessão inválida ou expirada' using errcode='28000';
 end if;
 select team_id into t from app_private.team_sessions
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now();
 if t is null then raise exception 'Sessão inválida ou expirada' using errcode='28000'; end if;
 perform 1 from public.teams where id=t and status='active' for update;
 if not found then raise exception 'Dupla desativada ou inexistente' using errcode='42501'; end if;
 if not exists(select 1 from app_private.team_sessions
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now()) then
  raise exception 'Sessão revogada' using errcode='28000';
 end if;
 return t;
end;
$$;

create or replace function public.login_team(p_access_code text,p_credential text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.teams; code text:=upper(btrim(p_access_code));
begin
 if not app_private.allow_request('login:global',1000,60) then
  return jsonb_build_object('error','Muitas tentativas. Aguarde um minuto.');
 end if;
 if code is null or length(code)<>16 or p_credential is null or length(p_credential)<>48 then
  return jsonb_build_object('error','Código ou credencial inválidos.');
 end if;
 select * into t from public.teams where access_code=code for update;
 if not app_private.allow_request('login:'||coalesce(t.id::text,'unknown'),10,900) then
  return jsonb_build_object('error','Muitas tentativas. Aguarde 15 minutos ou procure o administrador.');
 end if;
 if t.id is null then
  perform extensions.crypt(p_credential,extensions.gen_salt('bf',10));
  return jsonb_build_object('error','Código ou credencial inválidos.');
 end if;
 if extensions.crypt(p_credential,t.credential_hash)<>t.credential_hash then
  return jsonb_build_object('error','Código ou credencial inválidos.');
 end if;
 if t.status='inactive' then
  return jsonb_build_object('error','Esta dupla foi desativada. Procure a administração.');
 end if;
 return jsonb_build_object('team_id',t.id,'public_name',t.public_name,
  'class_id',t.class_id,'access_code',t.access_code,'token',app_private.new_session(t.id));
end;
$$;

create function public.set_team_status(p_team_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.teams;
begin
 perform app_private.require_admin();
 if p_status is null or p_status not in ('active','inactive') then
  raise exception 'Estado da dupla inválido';
 end if;
 select * into t from public.teams where id=p_team_id for update;
 if t.id is null then raise exception 'Dupla não encontrada'; end if;
 if t.status=p_status then return; end if;
 update public.teams set status=p_status,updated_at=clock_timestamp() where id=t.id;
 if p_status='inactive' then
  delete from app_private.team_sessions where team_id=t.id;
 end if;
 insert into public.audit_events(actor_id,action,target_id,details)
  values(auth.uid(),case when p_status='inactive' then 'deactivate_team' else 'reactivate_team' end,
   t.id,jsonb_build_object('previous_status',t.status,'new_status',p_status));
end;
$$;

-- Exclusão apenas de cadastro sem tentativas, notas ou pontuação CTF.
create function public.delete_team(p_team_id uuid,p_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.teams;
begin
 perform app_private.require_admin();
 select * into t from public.teams where id=p_team_id for update;
 if t.id is null then raise exception 'Dupla não encontrada'; end if;
 if p_confirmation is distinct from 'EXCLUIR '||t.access_code then
  raise exception 'Confirmação de exclusão inválida';
 end if;
 if exists(select 1 from public.attempts where team_id=t.id)
   or exists(select 1 from public.ctf_score_events where team_id=t.id)
   or exists(select 1 from public.public_leaderboard
             where team_id=t.id and (points<>0 or solved_count<>0)) then
  raise exception 'Dupla possui atividades, notas ou pontos CTF. Desative para preservar o histórico.' using errcode='23503';
 end if;
 delete from public.public_leaderboard where team_id=t.id;
 -- Cascata restrita a integrantes e tokens; nenhuma participação pode existir.
 delete from public.teams where id=t.id;
 insert into public.audit_events(actor_id,action,target_id,details)
  values(auth.uid(),'delete_team',t.id,
   jsonb_build_object('public_name',t.public_name,'class_id',t.class_id,'access_code',t.access_code));
end;
$$;

revoke all on function public.list_teams_admin(integer,integer),
 public.update_team(uuid,text,text,text,uuid),public.set_team_status(uuid,text),
 public.delete_team(uuid,text) from public,anon,authenticated;
grant execute on function public.list_teams_admin(integer,integer) to authenticated;
grant execute on function public.update_team(uuid,text,text,text,uuid),
 public.set_team_status(uuid,text),public.delete_team(uuid,text) to authenticated;
-- Auth RPCs existentes continuam limitadas aos respectivos papéis.
notify pgrst,'reload schema';
