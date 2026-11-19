-- Recuperação por módulo: no máximo uma avaliação de 20 questões por módulo.
-- Aplicar após 202611050006_weighted_rank.sql. NÃO aplicar a migration de snapshot histórico.
-- Contagem interna: 20 questões com 1 ponto bruto cada => nota pedagógica 0–10.
-- A recuperação não entra na média legada e oferece até +10 pontos, dentro dos 200.
begin;

alter table public.activity_sessions
  add column module_number smallint check (module_number between 1 and 3),
  add column is_recovery boolean not null default false,
  add column recovery_module text,
  add column recovery_sources uuid[] not null default '{}',
  add constraint recovery_module_valid check (
    (not is_recovery and recovery_module is null and cardinality(recovery_sources)=0)
    or (is_recovery and module_number is not null and recovery_module = ('Módulo ' || module_number::text) and cardinality(recovery_sources) between 1 and 16)
  );
create unique index recovery_one_per_module
  on public.activity_sessions(module_number) where is_recovery;

alter table public.public_leaderboard
  add column recovery_bonus numeric(6,2) not null default 0
  check (recovery_bonus between 0 and 200);

-- A função legada deve ignorar recuperações tanto no numerador como no denominador.
create or replace function app_private.refresh_assessment_band(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare n integer:=0; earned numeric:=0; next_band smallint:=0;
begin
  select count(*)::integer, coalesce(sum(coalesce(best.ratio,0::numeric)),0::numeric)
    into n, earned
  from public.teams t
  join public.activity_sessions s on t.class_id=any(s.class_ids)
    and s.status in ('open','closed','archived') and not s.is_recovery
  left join lateral (
    select max(least(1::numeric,greatest(0::numeric,g.points::numeric/nullif(g.max_points,0)))) ratio
    from public.attempts a join public.grades g on g.attempt_id=a.id
    where a.team_id=t.id and a.activity_session_id=s.id and a.submitted_at is not null
  ) best on true
  where t.id=p_team_id;
  if n>0 then next_band:=least(100,greatest(0,round(20*earned/n)::integer*5))::smallint; end if;
  update public.public_leaderboard set assessment_band=next_band,updated_at=clock_timestamp()
   where team_id=p_team_id and assessment_band is distinct from next_band;
end $$;

-- Elegibilidade: a dupla possui pelo menos uma atividade regular elegível
-- sem entrega válida na mesma turma. O bônus máximo é 10 por módulo.
-- Cada módulo contribui com até 10; módulos distintos podem somar bônus,
-- mas o componente pedagógico total permanece limitado a 200 no frontend.
create or replace function app_private.refresh_recovery_bonus(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare result numeric:=0;
begin
  select coalesce(sum(least(10::numeric, coalesce(r.best_ratio,0::numeric)*10)),0)
  into result
  from public.teams t
  join public.activity_sessions s on t.class_id=any(s.class_ids)
    and s.is_recovery and s.status in ('open','closed','archived')
  join lateral (
    select max(least(1::numeric,greatest(0::numeric,g.points::numeric/nullif(g.max_points,0)))) best_ratio
    from public.attempts a join public.grades g on g.attempt_id=a.id
    where a.activity_session_id=s.id and a.team_id=t.id and a.submitted_at is not null
  ) r on r.best_ratio is not null
  where t.id=p_team_id
    and exists (
      select 1 from public.activity_sessions regular
      where regular.id=any(s.recovery_sources)
        and t.class_id=any(regular.class_ids)
        and not regular.is_recovery
        and regular.status in ('closed','archived')
        and not exists (
          select 1 from public.attempts a join public.grades g on g.attempt_id=a.id
          where a.team_id=t.id and a.activity_session_id=regular.id and a.submitted_at is not null
        )
    );
  update public.public_leaderboard
  set recovery_bonus=least(200::numeric,result),updated_at=clock_timestamp()
  where team_id=p_team_id and recovery_bonus is distinct from least(200::numeric,result);
end $$;

-- Atualiza o bônus com notas, entregas e alterações de sessões;
-- reaproveita gatilhos existentes, preservando seus efeitos legados.
create or replace function app_private.refresh_after_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.submitted_at is distinct from old.submitted_at and new.submitted_at is not null then
   perform app_private.refresh_assessment_band(new.team_id);
   perform app_private.refresh_recovery_bonus(new.team_id);
 end if;
 return new;
end $$;
create or replace function app_private.refresh_after_grade()
returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 select team_id into tid from public.attempts where id=case when tg_op='DELETE' then old.attempt_id else new.attempt_id end;
 if tid is not null then
   perform app_private.refresh_assessment_band(tid);
   perform app_private.refresh_recovery_bonus(tid);
 end if;
 return null;
end $$;
create or replace function app_private.refresh_after_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_classes uuid[]:=array[]::uuid[];new_classes uuid[]:=array[]::uuid[];tid uuid;
begin
 if tg_op<>'INSERT' then old_classes:=old.class_ids; end if;
 if tg_op<>'DELETE' then new_classes:=new.class_ids; end if;
 for tid in select id from public.teams where class_id=any(old_classes) or class_id=any(new_classes) loop
   perform app_private.refresh_assessment_band(tid);
   perform app_private.refresh_recovery_bonus(tid);
 end loop;
 return null;
end $$;

-- Salva rascunho e metadados somente após todas as verificações.
-- Bloqueia revisões que excedam um único conjunto de recuperação por módulo.
create or replace function public.save_assessment(
  p_title text,p_description text,p_class_ids uuid[],p_questions jsonb,
  p_settings jsonb default '{}',p_activity_id uuid default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare aid uuid;q jsonb;pos integer:=0; recovery boolean:=coalesce((p_settings->>'is_recovery')::boolean,false);
module_code text:=nullif(btrim(p_settings->>'recovery_module'),'');
module_no smallint:=nullif(p_settings->>'module_number','')::smallint;
sources uuid[]:=array[]::uuid[];
begin
 perform app_private.require_staff();
 if module_no is null or module_no not between 1 and 3 then raise exception 'Selecione o módulo 1, 2 ou 3'; end if;
 if recovery then
   module_code:='Módulo ' || module_no::text;
   if jsonb_typeof(p_settings->'recovery_sources') is distinct from 'array' then raise exception 'Selecione atividades com faltas elegíveis'; end if;
   select coalesce(array_agg(value::uuid),array[]::uuid[]) into sources
     from jsonb_array_elements_text(p_settings->'recovery_sources') as v(value);
   if cardinality(sources) < 1 or cardinality(sources) > 16 then raise exception 'Selecione entre 1 e 16 atividades do módulo'; end if;
   if (select count(distinct id) from public.activity_sessions where id=any(sources)
        and status in ('closed','archived') and not is_recovery and module_number=module_no and class_ids && p_class_ids) <> cardinality(sources) then
     raise exception 'As atividades vinculadas devem estar encerradas e pertencer às turmas selecionadas';
   end if;
   if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions)<>20 then
     raise exception 'A recuperação exige exatamente 20 questões';
   end if;
   if exists(select 1 from jsonb_array_elements(p_questions) elem where (elem->>'points')::numeric<>1) then
     raise exception 'Cada questão de recuperação deve ter 1 ponto interno (20 pontos equivalem à nota oficial 10)';
   end if;
   -- O índice único é a autoridade final contra duplicação concorrente.
   if exists (
     select 1 from public.activity_sessions s
     where s.is_recovery and s.module_number=module_no
       and (p_activity_id is null or s.activity_id<>p_activity_id)
   ) then raise exception 'Este módulo já possui uma recuperação cadastrada'; end if;
 end if;
 if p_activity_id is not null then
   perform 1 from public.activities where id=p_activity_id for update;
   if not found then raise exception 'Atividade não encontrada'; end if;
   perform 1 from public.activity_sessions where activity_id=p_activity_id for update;
   if exists(select 1 from public.activity_sessions where activity_id=p_activity_id and status<>'draft')
     or exists(select 1 from public.attempts a join public.activity_sessions s on s.id=a.activity_session_id where s.activity_id=p_activity_id)
     then raise exception 'Edição bloqueada. Duplique a atividade para criar uma revisão.'; end if;
   update public.activities set locked_at=null where id=p_activity_id;
 end if;
 if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Questões inválidas'; end if;
 for q in select * from jsonb_array_elements(p_questions) loop
   if jsonb_typeof(q->'options') is distinct from 'array'
     or jsonb_array_length(q->'options') not between 2 and 5 then
     raise exception 'Cada questão deve ter de 2 a 5 alternativas'; end if;
 end loop;
 aid:=app_private.foundation_save_activity(p_title,p_description,p_class_ids,p_questions,false,p_activity_id);
 for q in select * from jsonb_array_elements(p_questions) loop
   pos:=pos+1;
   update public.questions set explanation=coalesce(q->>'explanation','')
    where activity_id=aid and position=pos;
 end loop;
 update public.activity_sessions set
   time_limit_seconds=case when recovery then 1200 else nullif(p_settings->>'time_limit_seconds','')::integer end,
   allow_backtracking=coalesce((p_settings->>'allow_backtracking')::boolean,true),
   release_results=coalesce((p_settings->>'release_results')::boolean,false),
   ctf_enabled=false,module_number=module_no,is_recovery=recovery,recovery_module=case when recovery then module_code else null end,
   recovery_sources=case when recovery then sources else array[]::uuid[] end
 where activity_id=aid;
 return aid;
end $$;


-- Impede acesso à recuperação para duplas sem ausência em uma atividade encerrada.
-- A função de adesão existente cria tentativas na tabela public.attempts.
create or replace function app_private.enforce_recovery_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare sess public.activity_sessions; class_id uuid;
begin
 select * into sess from public.activity_sessions where id=new.activity_session_id;
 if not sess.is_recovery then return new; end if;
 select t.class_id into class_id from public.teams t where t.id=new.team_id;
 if not exists (
   select 1 from public.activity_sessions regular
   where regular.id=any(sess.recovery_sources)
     and class_id=any(regular.class_ids)
     and not regular.is_recovery and regular.module_number=sess.module_number and regular.status in ('closed','archived')
     and not exists (
       select 1 from public.attempts at join public.grades g on g.attempt_id=at.id
       where at.team_id=new.team_id and at.activity_session_id=regular.id
         and at.submitted_at is not null
     )
 ) then
   raise exception 'Recuperação exclusiva para duplas com falta em atividade encerrada';
 end if;
 return new;
end $$;
create trigger verify_recovery_eligibility
before insert on public.attempts
for each row execute function app_private.enforce_recovery_eligibility();
revoke all on function app_private.enforce_recovery_eligibility() from public,anon,authenticated;

-- Uma vez iniciado, impedimos que uma recuperação deixe de ser recuperação por edição de sessão.
-- A nota de recuperação é exibida em escala 0–10 para os próprios alunos.
create or replace function public.team_result(p_token text,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token);result jsonb;
begin
 select jsonb_build_object(
  'points',case when s.is_recovery then round(g.points::numeric*10/nullif(g.max_points,0),2) else g.points end,
  'max_points',case when s.is_recovery then 10 else g.max_points end,
  'feedback',g.feedback) into result
 from public.attempts a join public.grades g on g.attempt_id=a.id
 join public.activity_sessions s on s.id=a.activity_session_id
 where a.id=p_attempt_id and a.team_id=t and s.release_results and s.status in ('closed','archived');
 if result is null then return jsonb_build_object('error','Resultado ainda não liberado pelo professor.'); end if;
 return result;
end $$;

-- Não incluir recuperações na média mesmo quando publicadas.
-- Não reescrevemos nenhum registro histórico de notas.
do $$
declare tid uuid;
begin
 for tid in select id from public.teams loop
   perform app_private.refresh_assessment_band(tid);
   perform app_private.refresh_recovery_bonus(tid);
 end loop;
end $$;

revoke all on function app_private.refresh_recovery_bonus(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
