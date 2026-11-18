-- Preserva o placar exibido antes da revisão do ranking.
-- Executar somente após backup e conferência dos 19 nomes da turma.
-- Não altera grades, attempts nem ctf_score_events.
-- Novas atividades somam a pontuação real obtida; atividades anteriores
-- não são recalculadas para reduzir o histórico.
begin;

alter table public.public_leaderboard
  add column historical_score integer,
  add column ctf_baseline bigint not null default 0,
  add column future_activity_points numeric not null default 0,
  add column score_cutoff timestamptz not null default clock_timestamp();

-- Congela o total atual de CTF para que ele não seja somado duas vezes.
update public.public_leaderboard
set ctf_baseline = points,
    score_cutoff = clock_timestamp();

-- Valores históricos extraídos do ranking anterior enviado pela equipe.
-- A coluna histórica é atribuída pela identidade da dupla, nunca pela posição.
create temporary table ranking_historical_snapshot (
  public_name text primary key,
  score integer not null check(score >= 0)
) on commit drop;
insert into ranking_historical_snapshot(public_name,score) values
  ('Boitatá',150),('BotoByte',150),('Carimbot',150),
  ('divas',150),('Paysandu',150),('Pororoca',150),
  ('fulaninhos',140),('Mapinguari',140),
  ('anavi',130),('Erro 404',130),('Momonga^2',130),
  ('anonymous',110),('equipe Neon',110),('Mambanegra',110),
  ('Everlong',90),('BruVi',80),
  ('Mingau do careca',50),('Wasabi',50),('Poderosas',30);

-- Falhar sem persistir nada se o snapshot não identificar todas as duplas
-- de modo unívoco. Isto impede atribuir pontos a uma dupla errada.
do $$
declare n integer;
begin
  select count(*) into n
  from ranking_historical_snapshot snap
  join public.teams t on lower(btrim(t.public_name))=lower(btrim(snap.public_name));
  if n <> 19 then
    raise exception 'Snapshot histórico incompleto/ambíguo: % correspondências, esperadas 19. Verifique nomes antes da aplicação.', n;
  end if;
  if exists (
    select 1 from ranking_historical_snapshot snap
    left join public.teams t on lower(btrim(t.public_name))=lower(btrim(snap.public_name))
    group by snap.public_name having count(t.id) <> 1
  ) then
    raise exception 'Nome histórico ausente ou repetido em turmas diferentes. Faça correspondência por team_id antes da aplicação.';
  end if;
end $$;

update public.public_leaderboard r
set historical_score = snap.score
from public.teams t, ranking_historical_snapshot snap
where t.id=r.team_id
  and lower(btrim(t.public_name))=lower(btrim(snap.public_name));

-- Duplas novas iniciam em zero. Duplas antigas não presentes no snapshot
-- continuam com fallback de exibição até que sua referência seja validada.
alter table public.public_leaderboard
  alter column historical_score set default 0;

create function app_private.refresh_future_activity_points(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare next_points numeric;
begin
  select coalesce(sum(best.score),0)
    into next_points
  from public.public_leaderboard r
  join public.teams t on t.id=r.team_id
  join public.activities act on act.created_at > r.score_cutoff
  join lateral (
    select max(g.points) as score
    from public.activity_sessions sess
    join public.attempts at on at.activity_session_id=sess.id
    join public.grades g on g.attempt_id=at.id
    where sess.activity_id=act.id
      and t.class_id=any(sess.class_ids)
      and at.team_id=t.id
      and at.submitted_at is not null
      and sess.status in ('open','closed','archived')
  ) best on best.score is not null
  where r.team_id=p_team_id;
  update public.public_leaderboard
  set future_activity_points=next_points,updated_at=clock_timestamp()
  where team_id=p_team_id and future_activity_points is distinct from next_points;
end $$;

create function app_private.refresh_future_after_grade()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
  select team_id into tid from public.attempts
  where id=case when tg_op='DELETE' then old.attempt_id else new.attempt_id end;
  if tid is not null then perform app_private.refresh_future_activity_points(tid); end if;
  return null;
end $$;
create trigger ranking_future_grade
after insert or update or delete on public.grades
for each row execute function app_private.refresh_future_after_grade();

create function app_private.refresh_future_after_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.submitted_at is distinct from old.submitted_at then
    perform app_private.refresh_future_activity_points(new.team_id);
  end if;
  return new;
end $$;
create trigger ranking_future_submission
after update of submitted_at on public.attempts
for each row execute function app_private.refresh_future_after_submission();

-- Arquivar/restaurar não subtrai histórico. Uma nova sessão elegível é
-- reavaliada após mudança de status, sem tocar nas entregas originais.
create function app_private.refresh_future_after_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid; previous_classes uuid[]:=array[]::uuid[]; current_classes uuid[]:=array[]::uuid[];
begin
  if tg_op <> 'INSERT' then previous_classes:=old.class_ids; end if;
  if tg_op <> 'DELETE' then current_classes:=new.class_ids; end if;
  for tid in select id from public.teams
    where class_id=any(previous_classes) or class_id=any(current_classes)
  loop
    perform app_private.refresh_future_activity_points(tid);
  end loop;
  return null;
end $$;
create trigger ranking_future_session
after insert or update of status,class_ids or delete on public.activity_sessions
for each row execute function app_private.refresh_future_after_session();

revoke all on function app_private.refresh_future_activity_points(uuid),
  app_private.refresh_future_after_grade(),
  app_private.refresh_future_after_submission(),
  app_private.refresh_future_after_session()
from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
