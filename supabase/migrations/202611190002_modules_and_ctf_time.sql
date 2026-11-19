-- Três módulos pedagógicos e desempate pelo tempo de CTF.
-- Dependência: 202611190001_module_recovery.sql.
-- Não atribui módulo a avaliações antigas automaticamente.
begin;

alter table public.ctf_score_events
  add column ctf_module smallint check (ctf_module between 1 and 3),
  add column resolution_seconds integer check (resolution_seconds between 1 and 86400),
  add constraint ctf_module_time_pair check (
    (ctf_module is null and resolution_seconds is null)
    or (ctf_module is not null and resolution_seconds is not null)
  );
create unique index ctf_one_result_per_team_module
  on public.ctf_score_events(team_id,ctf_module) where ctf_module is not null;

alter table public.public_leaderboard
  add column ctf_elapsed_seconds bigint check (ctf_elapsed_seconds is null or ctf_elapsed_seconds >= 0);

-- Atribuição explícita, também para atividades antigas já encerradas;
-- não muda notas nem aproveitamentos por si só.
create function public.assign_assessment_module(p_session_id uuid,p_module smallint)
returns void language plpgsql security definer set search_path='' as $$
declare s public.activity_sessions;
begin
 perform app_private.require_staff();
 if p_module not between 1 and 3 then raise exception 'Módulo deve ser 1, 2 ou 3'; end if;
 select * into s from public.activity_sessions where id=p_session_id for update;
 if s.id is null then raise exception 'Atividade não encontrada'; end if;
 if s.is_recovery and s.module_number is distinct from p_module then
   raise exception 'Recuperação não pode ser movida entre módulos';
 end if;
 if exists (select 1 from public.activity_sessions r
   where r.is_recovery and s.id=any(r.recovery_sources) and r.module_number<>p_module) then
   raise exception 'Atividade vinculada a uma recuperação de outro módulo';
 end if;
 update public.activity_sessions set module_number=p_module where id=s.id;
 insert into public.audit_events(actor_id,action,target_id,details)
 values(auth.uid(),'assign_assessment_module',s.id,
   jsonb_build_object('previous',s.module_number,'current',p_module));
end $$;
revoke all on function public.assign_assessment_module(uuid,smallint) from public,anon,authenticated;
grant execute on function public.assign_assessment_module(uuid,smallint) to authenticated;

-- Tempo é metadado de desempate, não converte segundos em pontos.
create function app_private.sync_ctf_elapsed()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 tid:=case when tg_op='DELETE' then old.team_id else new.team_id end;
 update public.public_leaderboard r
 set ctf_elapsed_seconds=(
   select sum(e.resolution_seconds)::bigint
   from public.ctf_score_events e
   where e.team_id=tid and e.ctf_module is not null and e.points>0
 ), updated_at=clock_timestamp()
 where r.team_id=tid;
 return null;
end $$;
create trigger ctf_module_time_sync
after insert or update or delete on public.ctf_score_events
for each row execute function app_private.sync_ctf_elapsed();

create function public.record_module_ctf(
 p_event_id uuid,p_team_id uuid,p_module smallint,p_points integer,
 p_elapsed_seconds integer,p_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare limit_points integer;
begin
 perform app_private.require_admin();
 if p_module not between 1 and 3 then raise exception 'Módulo CTF deve ser 1, 2 ou 3'; end if;
 limit_points:=case p_module when 1 then 200 when 2 then 250 else 350 end;
 if p_points not between 0 and limit_points then
   raise exception 'Pontuação acima do máximo deste CTF (% pontos)',limit_points;
 end if;
 if p_elapsed_seconds not between 1 and 86400 then
   raise exception 'Informe tempo de resolução válido em segundos (1–86400)';
 end if;
 if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Justificativa obrigatória'; end if;
 perform 1 from public.teams where id=p_team_id for update;
 if not found then raise exception 'Dupla inexistente'; end if;
 insert into public.ctf_score_events(id,team_id,points,reason,created_by,ctf_module,resolution_seconds)
 values(p_event_id,p_team_id,p_points,btrim(p_reason),auth.uid(),p_module,p_elapsed_seconds);
 insert into public.audit_events(actor_id,action,target_id,details)
 values(auth.uid(),'record_module_ctf',p_team_id,
   jsonb_build_object('event_id',p_event_id,'module',p_module,'points',p_points,'seconds',p_elapsed_seconds));
end $$;
revoke all on function public.record_module_ctf(uuid,uuid,smallint,integer,integer,text)
 from public,anon,authenticated;
grant execute on function public.record_module_ctf(uuid,uuid,smallint,integer,integer,text)
 to authenticated;

-- Evita registrar novos pontos CTF fora dos três módulos pela interface legada.
revoke execute on function public.adjust_ctf(uuid,uuid,int,text) from authenticated;
revoke all on function app_private.sync_ctf_elapsed() from public,anon,authenticated;

-- Nenhum evento histórico sem tempo terá duração inventada.
notify pgrst,'reload schema';
commit;
