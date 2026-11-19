-- Atividades arquivadas deixam de integrar a pontuação pedagógica.
-- Preserva notas, tentativas, respostas e pontos CTF históricos.
-- Aplicar após 202611190001_module_recovery.sql e 202611190003_module_capacity.sql.
begin;

-- Cada sessão regular elegível vale uma vez, inclusive ausência como zero.
-- Arquivadas não entram nem no denominador nem no numerador.
create or replace function app_private.refresh_assessment_band(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  n integer := 0;
  earned numeric := 0;
  next_band smallint := 0;
begin
  select count(*)::integer, coalesce(sum(coalesce(best.ratio,0::numeric)),0::numeric)
    into n, earned
  from public.teams t
  join public.activity_sessions s
    on t.class_id=any(s.class_ids)
   and s.status in ('open','closed')
   and not s.is_recovery
  left join lateral (
    select max(least(1::numeric,greatest(0::numeric,
                 g.points::numeric/nullif(g.max_points,0)))) as ratio
    from public.attempts a
    join public.grades g on g.attempt_id=a.id
    where a.team_id=t.id
      and a.activity_session_id=s.id
      and a.submitted_at is not null
  ) best on true
  where t.id=p_team_id;

  if n>0 then
    next_band:=least(100,greatest(0,round(20*earned/n)::integer*5))::smallint;
  end if;
  update public.public_leaderboard
  set assessment_band=next_band, updated_at=clock_timestamp()
  where team_id=p_team_id and assessment_band is distinct from next_band;
end $$;

-- A ausência em avaliação arquivada não dá elegibilidade à recuperação
-- e a própria recuperação arquivada deixa de gerar bônus.
create or replace function app_private.refresh_recovery_bonus(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare result numeric := 0;
begin
  select coalesce(sum(least(10::numeric,coalesce(r.best_ratio,0::numeric)*10)),0)
    into result
  from public.teams t
  join public.activity_sessions s
    on t.class_id=any(s.class_ids)
   and s.is_recovery and s.status in ('open','closed')
  join lateral (
    select max(least(1::numeric,greatest(0::numeric,
                 g.points::numeric/nullif(g.max_points,0)))) best_ratio
    from public.attempts a
    join public.grades g on g.attempt_id=a.id
    where a.activity_session_id=s.id
      and a.team_id=t.id
      and a.submitted_at is not null
  ) r on r.best_ratio is not null
  where t.id=p_team_id
    and exists (
      select 1 from public.activity_sessions regular
      where regular.id=any(s.recovery_sources)
        and t.class_id=any(regular.class_ids)
        and not regular.is_recovery
        and regular.module_number=s.module_number
        and regular.status='closed'
        and not exists (
          select 1 from public.attempts a
          join public.grades g on g.attempt_id=a.id
          where a.team_id=t.id
            and a.activity_session_id=regular.id
            and a.submitted_at is not null
        )
    );
  update public.public_leaderboard
  set recovery_bonus=least(30::numeric,result), updated_at=clock_timestamp()
  where team_id=p_team_id and recovery_bonus is distinct from least(30::numeric,result);
end $$;

-- Defesa no servidor: somente faltas em sessões regulares encerradas,
-- dentro do mesmo módulo e turma, podem autorizar uma recuperação.
create or replace function app_private.enforce_recovery_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare sess public.activity_sessions; team_class uuid;
begin
  select * into sess from public.activity_sessions where id=new.activity_session_id;
  if not coalesce(sess.is_recovery,false) then return new; end if;
  select t.class_id into team_class from public.teams t where t.id=new.team_id;
  if not exists (
    select 1 from public.activity_sessions regular
    where regular.id=any(sess.recovery_sources)
      and team_class=any(regular.class_ids)
      and not regular.is_recovery
      and regular.module_number=sess.module_number
      and regular.status='closed'
      and not exists (
        select 1 from public.attempts a
        join public.grades g on g.attempt_id=a.id
        where a.team_id=new.team_id
          and a.activity_session_id=regular.id
          and a.submitted_at is not null
      )
  ) then
    raise exception 'Recuperação exige falta em atividade regular encerrada do mesmo módulo';
  end if;
  return new;
end $$;

-- Uma atividade arquivada não ocupa uma das 6/5/5 vagas oficiais.
-- Ao desarquivar, o limite é novamente validado (impede ultrapassar vagas).
create or replace function app_private.enforce_module_activity_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  max_regular integer;
  regular_total integer;
  is_revision boolean;
begin
  if new.is_recovery then
    if new.module_number is null then
      raise exception 'Informe o módulo da recuperação';
    end if;
    return new;
  end if;
  if new.module_number is null or new.status='archived' then return new; end if;

  select a.revision_of is not null into is_revision
  from public.activities a where a.id=new.activity_id;
  if coalesce(is_revision,false) then return new; end if;

  perform pg_advisory_xact_lock(614140, new.module_number::integer);
  max_regular:=case new.module_number when 1 then 6 else 5 end;

  select count(*) into regular_total
  from public.activity_sessions s
  join public.activities a on a.id=s.activity_id
  where s.module_number=new.module_number
    and not s.is_recovery
    and s.status<>'archived'
    and a.revision_of is null
    and s.id<>new.id;

  if regular_total>=max_regular then
    raise exception 'Módulo % já possui o limite de % atividades regulares',new.module_number,max_regular;
  end if;
  return new;
end $$;

drop trigger if exists enforce_regular_module_capacity on public.activity_sessions;
create trigger enforce_regular_module_capacity
before insert or update of module_number,is_recovery,status on public.activity_sessions
for each row execute function app_private.enforce_module_activity_capacity();

-- Mantém a regra também nas alterações de nota/sessão já cobertas pelos
-- gatilhos assessment_ranking_grade/submission/session existentes.
do $$
declare tid uuid;
begin
  for tid in select id from public.teams loop
    perform app_private.refresh_assessment_band(tid);
    perform app_private.refresh_recovery_bonus(tid);
  end loop;
end $$;

revoke all on function app_private.enforce_recovery_eligibility() from public,anon,authenticated;
revoke all on function app_private.enforce_module_activity_capacity() from public,anon,authenticated;
revoke all on function app_private.refresh_assessment_band(uuid) from public,anon,authenticated;
revoke all on function app_private.refresh_recovery_bonus(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
