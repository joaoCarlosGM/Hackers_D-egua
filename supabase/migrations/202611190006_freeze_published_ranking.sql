-- Congelamento explícito do ranking histórico publicado e progressão futura.
-- Referência: captura do ranking fornecida pela coordenação (19 duplas ativas).
-- NÃO altera notas, entregas, presenças, tempo ou pontos dos CTFs.
-- A pontuação pedagógica oficial é legacy_assessment_points + future_activity_points
-- + recovery_bonus, limitada a 200 pontos. Não somar assessment_points de novo.
begin;

create table app_private.ranking_baseline_sessions (
  session_id uuid primary key references public.activity_sessions(id) on delete restrict,
  frozen_at timestamptz not null default clock_timestamp()
);
revoke all on app_private.ranking_baseline_sessions from public,anon,authenticated;

-- Proteção contra reaplicação acidental e mudanças de composição das sessões congeladas.
do $$
declare valid_count integer; active_count integer;
begin
  select count(*) into valid_count from public.activity_sessions
   where not is_recovery and status in ('open','closed') and module_number=1;
  if valid_count<>3 then
    raise exception 'Esperadas 3 atividades válidas do Módulo 1, encontradas %: revisar antes de congelar',valid_count;
  end if;
  select count(*) into active_count from public.teams t
   join public.public_leaderboard l on l.team_id=t.id
   where t.status='active' and l.is_visible;
  if active_count<>19 then
    raise exception 'Esperadas 19 duplas visíveis para o marco histórico, encontradas %',active_count;
  end if;
end $$;

insert into app_private.ranking_baseline_sessions(session_id)
select id from public.activity_sessions
where not is_recovery and status in ('open','closed') and module_number=1;

alter table public.public_leaderboard
  add column legacy_assessment_points numeric(6,2) not null default 0
      check (legacy_assessment_points between 0 and 200),
  add column future_activity_points numeric(6,2) not null default 0
      check (future_activity_points between 0 and 200);

-- Valores aprovados na captura: não inferir a partir da média recalculada.
-- O bloco valida todos os nomes, proíbe empates de identificação e extras visíveis.
do $$
declare matched_count integer; missing_count integer;
begin
  with historic(name, score) as (
    values
      ('Boitatá',120),('BotoByte',120),('Carimboot',120),
      ('divas',120),('Paysandu',120),('Pororoca',120),
      ('Erro 404',110),('fulaninhos',110),('Mapinguari',110),('Momonga^2',110),
      ('anavi',100),('equipe Neon',90),('Mambanegra',90),
      ('anonymous',80),('Everlong',70),('BruVi',60),
      ('Mingau do careca',40),('Wasabi',40),('Poderosas',20)
  )
  select count(*) into matched_count
  from historic h join public.teams t on t.public_name=h.name
  join public.public_leaderboard l on l.team_id=t.id
  where t.status='active' and l.is_visible;
  if matched_count<>19 then raise exception
    'Ranking histórico incompleto: % das 19 duplas reconhecidas',matched_count; end if;
  with historic(name) as (
    values ('Boitatá'),('BotoByte'),('Carimboot'),('divas'),('Paysandu'),
      ('Pororoca'),('Erro 404'),('fulaninhos'),('Mapinguari'),('Momonga^2'),
      ('anavi'),('equipe Neon'),('Mambanegra'),('anonymous'),('Everlong'),
      ('BruVi'),('Mingau do careca'),('Wasabi'),('Poderosas')
  )
  select count(*) into missing_count
  from public.public_leaderboard l join public.teams t on t.id=l.team_id
  where l.is_visible and t.status='active'
    and not exists(select 1 from historic h where h.name=t.public_name);
  if missing_count<>0 then raise exception '% duplas visíveis fora do marco histórico',missing_count; end if;
end $$;

with historic(name,score) as (
 values ('Boitatá',120),('BotoByte',120),('Carimboot',120),
      ('divas',120),('Paysandu',120),('Pororoca',120),
      ('Erro 404',110),('fulaninhos',110),('Mapinguari',110),('Momonga^2',110),
      ('anavi',100),('equipe Neon',90),('Mambanegra',90),
      ('anonymous',80),('Everlong',70),('BruVi',60),
      ('Mingau do careca',40),('Wasabi',40),('Poderosas',20)
)
update public.public_leaderboard l
set legacy_assessment_points=h.score
from public.teams t join historic h on h.name=t.public_name
where l.team_id=t.id and t.status='active' and l.is_visible;

-- Acúmulo SOMENTE de atividades regulares posteriores ao marco.
-- Cada sessão adiciona até 12,5 pontos conforme o percentual da melhor
-- tentativa entregue, arredondado em faixas de 5%, sem penalizar o histórico.
create function app_private.refresh_future_activity_points(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  earned numeric:=0;
  new_points numeric(6,2):=0;
begin
  select coalesce(sum(
    (round(least(1::numeric,greatest(0::numeric,coalesce(best.ratio,0)))*20)::integer * 5) / 8.0
  ),0) into earned
  from public.teams t
  join public.activity_sessions s on t.class_id=any(s.class_ids)
    and s.status in ('open','closed')
    and not s.is_recovery
    and not exists (
      select 1 from app_private.ranking_baseline_sessions b where b.session_id=s.id
    )
  left join lateral (
    select max(least(1::numeric,greatest(0::numeric,
      g.points::numeric/nullif(g.max_points,0)))) ratio
    from public.attempts a join public.grades g on g.attempt_id=a.id
    where a.team_id=t.id and a.activity_session_id=s.id and a.submitted_at is not null
  ) best on true
  where t.id=p_team_id;
  new_points:=round(least(200::numeric,greatest(0::numeric,earned)),2);
  update public.public_leaderboard
  set future_activity_points=new_points,updated_at=clock_timestamp()
  where team_id=p_team_id and future_activity_points is distinct from new_points;
end $$;
revoke all on function app_private.refresh_future_activity_points(uuid) from public,anon,authenticated;

-- Liga o cálculo aos gatilhos já existentes sem desativar a média acadêmica.
create or replace function app_private.refresh_after_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.submitted_at is distinct from old.submitted_at and new.submitted_at is not null then
    perform app_private.refresh_assessment_band(new.team_id);
    perform app_private.refresh_future_activity_points(new.team_id);
    perform app_private.refresh_recovery_bonus(new.team_id);
  end if;
  return new;
end $$;

create or replace function app_private.refresh_after_grade()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
  select team_id into tid from public.attempts
    where id=case when tg_op='DELETE' then old.attempt_id else new.attempt_id end;
  if tid is not null then
    perform app_private.refresh_assessment_band(tid);
    perform app_private.refresh_future_activity_points(tid);
    perform app_private.refresh_recovery_bonus(tid);
  end if;
  return null;
end $$;

create or replace function app_private.refresh_after_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_classes uuid[]:=array[]::uuid[];
        new_classes uuid[]:=array[]::uuid[];
        tid uuid;
begin
  if tg_op<>'INSERT' then old_classes:=old.class_ids; end if;
  if tg_op<>'DELETE' then new_classes:=new.class_ids; end if;
  for tid in select id from public.teams
    where class_id=any(old_classes) or class_id=any(new_classes)
  loop
    perform app_private.refresh_assessment_band(tid);
    perform app_private.refresh_future_activity_points(tid);
    perform app_private.refresh_recovery_bonus(tid);
  end loop;
  return null;
end $$;

-- Inclui recálculo ao criar uma nova dupla: histórico = 0; atividades antigas
-- congeladas jamais reaparecem como pontuação nova.
do $$
declare tid uuid;
begin
  for tid in select id from public.teams loop
    perform app_private.refresh_future_activity_points(tid);
  end loop;
end $$;

revoke all on function app_private.refresh_after_submission() from public,anon,authenticated;
revoke all on function app_private.refresh_after_grade() from public,anon,authenticated;
revoke all on function app_private.refresh_after_session() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
