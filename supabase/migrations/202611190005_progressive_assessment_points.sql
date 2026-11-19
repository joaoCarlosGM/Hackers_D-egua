-- Pontuação progressiva: 16 avaliações regulares × 12,5 pontos = 200.
-- O aproveitamento arredondado (assessment_band) multiplica somente
-- a parcela do curso já aplicada: 200 × (n/16) × (band/100).
-- Arquivadas, recuperações, rascunhos e avaliações não iniciadas são excluídas.
-- Mantém notas, respostas e pontos CTF inalterados.
begin;

alter table public.public_leaderboard
  add column assessment_points numeric(6,2) not null default 0
  check (assessment_points between 0 and 200);

create or replace function app_private.refresh_assessment_band(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  n integer:=0;
  earned numeric:=0;
  next_band smallint:=0;
  next_points numeric(6,2):=0;
begin
  select count(*)::integer,
         coalesce(sum(coalesce(best.ratio,0::numeric)),0::numeric)
    into n,earned
  from public.teams t
  join public.activity_sessions s
    on t.class_id=any(s.class_ids)
   and s.status in ('open','closed')
   and not s.is_recovery
  left join lateral (
    select max(least(1::numeric,greatest(0::numeric,
               g.points::numeric/nullif(g.max_points,0)))) ratio
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
  -- Aproveitamento arredondado (faixas de 5%) aplicado somente à fração
  -- de avaliações regulares já realizadas: (200 × n/16 × band/100).
  next_points:=round(least(200::numeric,greatest(0::numeric,n::numeric * next_band::numeric / 8)),2);
  update public.public_leaderboard
    set assessment_band=next_band,
        assessment_points=next_points,
        updated_at=clock_timestamp()
  where team_id=p_team_id
    and (assessment_band is distinct from next_band
      or assessment_points is distinct from next_points);
end $$;

-- Preenche a nova coluna usando exclusivamente notas existentes.
do $$
declare tid uuid;
begin
  for tid in select id from public.teams loop
    perform app_private.refresh_assessment_band(tid);
  end loop;
end $$;

revoke all on function app_private.refresh_assessment_band(uuid)
  from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
