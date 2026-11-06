-- Migration 010: CTF 80%, avaliações 20%, sem exposição de notas privadas.
-- Depende de 009: 202611050005_hide_inactive_ranking.sql.
-- Ranking público é composto no frontend a partir de pontos CTF e do agregado
-- de avaliações em faixas de 5%; nenhuma nota individual é publicada.
-- Esta migration não apaga entregas, notas, presenças ou pontos já existentes.

alter table public.public_leaderboard
 add column assessment_band smallint not null default 0
 check (assessment_band between 0 and 100 and assessment_band % 5 = 0);

-- Uma atividade conta uma só vez. Para cada dupla, usamos a melhor nota
-- ENTRE AS TENTATIVAS EFETIVAMENTE ENTREGUES daquela sessão.
-- Não entregar uma atividade elegível equivale a zero nessa atividade.
-- Rascunhos e atividades apenas publicadas ainda não entram no denominador.
-- Agregado arredondado a 5 pontos percentuais para não divulgar notas exatas.
create function app_private.refresh_assessment_band(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  n integer := 0;
  earned numeric := 0;
  next_band smallint := 0;
begin
  select count(*)::integer, coalesce(sum(coalesce(best.ratio, 0::numeric)),0::numeric)
  into n, earned
  from public.teams t
  join public.activity_sessions s
    on t.class_id = any(s.class_ids)
   and s.status in ('open','closed','archived')
  left join lateral (
    select max(least(1::numeric,
                      greatest(0::numeric,
                        g.points::numeric / nullif(g.max_points,0)))) as ratio
    from public.attempts a
    join public.grades g on g.attempt_id=a.id
    where a.team_id=t.id
      and a.activity_session_id=s.id
      and a.submitted_at is not null
  ) best on true
  where t.id=p_team_id;

  if n > 0 then
    next_band:=least(100,greatest(0,round(20 * earned / n)::integer * 5))::smallint;
  end if;

  update public.public_leaderboard
  set assessment_band=next_band,updated_at=clock_timestamp()
  where team_id=p_team_id and assessment_band is distinct from next_band;
end;
$$;

-- A entrega grava a nota antes de marcar submitted_at; este gatilho garante
-- que a classificação só mude após COMMIT da entrega.
create function app_private.refresh_after_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.submitted_at is distinct from old.submitted_at and new.submitted_at is not null then
   perform app_private.refresh_assessment_band(new.team_id);
 end if;
 return new;
end;
$$;
create trigger assessment_ranking_submission
 after update of submitted_at on public.attempts for each row
 execute function app_private.refresh_after_submission();

-- Correções pedagógicas repercutem no bônus, nunca criam eventos CTF.
create function app_private.refresh_after_grade()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 select a.team_id into tid from public.attempts a
 where a.id=case when tg_op='DELETE' then old.attempt_id else new.attempt_id end;
 if tid is not null then
   perform app_private.refresh_assessment_band(tid);
 end if;
 return null;
end;
$$;
create trigger assessment_ranking_grade
 after insert or update or delete on public.grades for each row
 execute function app_private.refresh_after_grade();

-- Ao abrir/encerrar/arquivar uma atividade, todos os integrantes da(s)
-- turma(s) recebem novo denominador. A atualização ocorre em transação.
create function app_private.refresh_after_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare previous_classes uuid[]:=array[]::uuid[];
        current_classes uuid[]:=array[]::uuid[];
        previous_status text:=null;
        current_status text:=null;
        tid uuid;
begin
 if tg_op <> 'INSERT' then
   previous_classes:=old.class_ids;
   previous_status:=old.status;
 end if;
 if tg_op <> 'DELETE' then
   current_classes:=new.class_ids;
   current_status:=new.status;
 end if;
 if previous_classes is distinct from current_classes
     or previous_status is distinct from current_status then
   for tid in
     select t.id from public.teams t
     where t.class_id=any(previous_classes)
        or t.class_id=any(current_classes)
   loop
     perform app_private.refresh_assessment_band(tid);
   end loop;
 end if;
 return null;
end;
$$;
create trigger assessment_ranking_session
 after insert or update of status,class_ids or delete on public.activity_sessions
 for each row execute function app_private.refresh_after_session();

-- Inclui entregas e notas já existentes, sem reprocessar ou duplicar CTF.
do $$
declare tid uuid;
begin
 for tid in select id from public.teams loop
   perform app_private.refresh_assessment_band(tid);
 end loop;
end;
$$;

revoke all on function app_private.refresh_assessment_band(uuid),
 app_private.refresh_after_submission(), app_private.refresh_after_grade(),
 app_private.refresh_after_session() from public,anon,authenticated;

notify pgrst,'reload schema';
