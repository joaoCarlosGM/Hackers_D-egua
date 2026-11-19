-- DIAGNÓSTICO SOMENTE LEITURA (execute no Supabase SQL Editor ANTES das migrations)
-- Não cria, altera nem exclui tabelas ou notas.
select now() as checked_at, current_database() as database_name,
       to_regclass('public.activity_sessions') is not null as has_assessment_sessions,
       to_regclass('public.public_leaderboard') is not null as has_leaderboard,
       to_regclass('public.ctf_score_events') is not null as has_ctf_events,
       to_regprocedure('app_private.refresh_assessment_band(uuid)') is not null as has_legacy_ranking;
-- Use o painel Supabase > Database > Migrations para conferir a versão aplicada.
-- A tabela interna de migrations pode variar de versão e não é necessária para o diagnóstico.
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='activity_sessions'
order by ordinal_position;
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='public_leaderboard'
order by ordinal_position;
select count(*) as total_sessions, count(distinct activity_id) as distinct_activities
from public.activity_sessions;
select a.title,s.status,s.class_ids,a.revision_of,s.id as session_id
from public.activity_sessions s join public.activities a on a.id=s.activity_id
order by s.created_at;
select count(*) as existing_ctf_events,
       sum(points) as sum_ctf_points,
       count(*) filter(where points < 0) as negative_adjustments
from public.ctf_score_events;
