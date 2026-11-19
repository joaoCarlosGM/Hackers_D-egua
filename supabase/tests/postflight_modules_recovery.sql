-- VALIDAÇÃO PÓS-MIGRATION: SOMENTE LEITURA
-- Executar depois de 202611190001, 002 e 003.
-- Interrompe com erro se faltar schema ou houver módulos fora do limite.
do $$
declare
  module_count int;
  module_limit int;
  bad_count int;
begin
  if not exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='activity_sessions'
         and column_name='module_number') then
    raise exception 'Falha: activity_sessions.module_number ausente';
  end if;
  if not exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='activity_sessions'
         and column_name='recovery_sources') then
    raise exception 'Falha: recovery_sources ausente';
  end if;
  if not exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='public_leaderboard'
         and column_name='recovery_bonus') then
    raise exception 'Falha: recovery_bonus ausente';
  end if;
  if not exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='public_leaderboard'
         and column_name='ctf_elapsed_seconds') then
    raise exception 'Falha: ctf_elapsed_seconds ausente';
  end if;
  if to_regprocedure('public.record_module_ctf(uuid,uuid,smallint,integer,integer,text)') is null then
    raise exception 'Falha: record_module_ctf não implantada';
  end if;
  for module_count in 1..3 loop
    module_limit:=case module_count when 1 then 6 else 5 end;
    select count(*) into bad_count
    from public.activity_sessions s join public.activities a on a.id=s.activity_id
    where s.module_number=module_count and not s.is_recovery and a.revision_of is null;
    if bad_count > module_limit then
      raise exception 'Falha: módulo % tem % atividades regulares (limite %)',module_count,bad_count,module_limit;
    end if;
    select count(*) into bad_count from public.activity_sessions s
    where s.module_number=module_count and s.is_recovery;
    if bad_count > 1 then raise exception 'Falha: módulo % possui mais de uma recuperação',module_count; end if;
  end loop;
  if exists(select 1 from public.activity_sessions where not is_recovery and module_number is null) then
    raise exception 'Falha: há atividades não classificadas';
  end if;
  if exists(select 1 from public.ctf_score_events where ctf_module is not null and resolution_seconds is null) then
    raise exception 'Falha: CTF com módulo sem tempo';
  end if;
  if exists(select 1 from public.ctf_score_events where ctf_module=1 and points not between 0 and 200
       union all select 1 from public.ctf_score_events where ctf_module=2 and points not between 0 and 250
       union all select 1 from public.ctf_score_events where ctf_module=3 and points not between 0 and 350) then
    raise exception 'Falha: pontuação de CTF acima do limite do módulo';
  end if;
  if exists(select 1 from public.public_leaderboard where recovery_bonus not between 0 and 30) then
    raise exception 'Falha: bônus de recuperação acima de 30';
  end if;
  raise notice 'OK: módulos 6/5/5, uma recuperação por módulo, pontuação e tempos validados';
end $$;

select s.module_number as modulo,
       count(*) filter (where not s.is_recovery and a.revision_of is null) as regulares,
       count(*) filter (where s.is_recovery) as recuperacoes,
       count(*) filter (where a.revision_of is not null) as revisoes
from public.activity_sessions s join public.activities a on a.id=s.activity_id
group by s.module_number order by s.module_number;
select ctf_module as modulo, count(*) as ctf_lancados,
       count(*) filter(where resolution_seconds is not null) as com_tempo,
       min(resolution_seconds) as melhor_tempo_segundos
from public.ctf_score_events where ctf_module is not null
group by ctf_module order by ctf_module;
