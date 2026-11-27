-- Distinguish pedagogical designation from browser laboratory execution mode.
-- The VM still uses mode='test'; never pretend this is an isolated official engine.
begin;
alter table public.ctf1_official_rounds
 add column assessment_kind text not null default 'test'
 constraint ctf1_official_rounds_assessment_kind_check
 check (assessment_kind in ('test','official'));

create function public.ctf1_staff_create_labeled_round(
 p_class_ids uuid[],p_title text,p_assessment_kind text)
returns uuid language plpgsql security definer set search_path='' as $create$
declare rid uuid;
begin
 perform app_private.require_staff();
 if p_assessment_kind is null or p_assessment_kind not in ('test','official') then
  raise exception 'Classificação inválida: teste ou oficial' using errcode='22023';
 end if;
 if cardinality(p_class_ids)<>1 then
  raise exception 'Selecione exatamente uma turma' using errcode='22023';
 end if;
 -- Reuse existing enrollment and unique per-round secrets without touching older rounds.
 rid:=public.ctf1_staff_create_round(p_class_ids,p_title,'test',null);
 update public.ctf1_official_rounds
 set assessment_kind=p_assessment_kind
 where id=rid;
 return rid;
end $create$;

create function public.ctf1_staff_classify_round(
 p_round uuid,p_assessment_kind text)
returns void language plpgsql security definer set search_path='' as $classify$
declare r public.ctf1_official_rounds;
begin
 perform app_private.require_staff();
 if p_assessment_kind is null or p_assessment_kind not in ('test','official') then
  raise exception 'Classificação inválida' using errcode='22023';
 end if;
 select * into r from public.ctf1_official_rounds where id=p_round for update;
 if r.id is null or r.state='discarded' then
  raise exception 'Rodada inexistente ou descartada' using errcode='42501';
 end if;
 if r.state='running' and clock_timestamp()<r.ends_at then
  raise exception 'Não é permitido alterar o tipo durante uma rodada ativa' using errcode='42501';
 end if;
 if r.assessment_kind=p_assessment_kind then return; end if;
 update public.ctf1_official_rounds set assessment_kind=p_assessment_kind where id=p_round;
 insert into public.ctf1_official_audit(round_id,staff_id,kind,detail)
 values(p_round,auth.uid(),'round_classification',
  jsonb_build_object('previous',r.assessment_kind,'current',p_assessment_kind));
end $classify$;

alter table public.ctf1_official_audit
 drop constraint if exists ctf1_official_audit_kind_check;
alter table public.ctf1_official_audit
 add constraint ctf1_official_audit_kind_check
 check(kind in ('round_start','round_end','team_exclude','team_restore',
 'flag_attempt','writeup_saved','graded','terminal_event',
 'round_discard','round_extend','round_classification'));

-- Return the pedagogical kind alongside the unchanged technical mode.
create or replace function public.ctf1_staff_list_rounds()
returns jsonb language plpgsql stable security definer set search_path='' as $rounds$
begin
 perform app_private.require_staff();
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'title',r.title,'state',
  case when r.state='running' and clock_timestamp()>=r.ends_at then 'ended' else r.state end,
  'mode',r.mode,'assessment_kind',r.assessment_kind,
  'class_ids',r.class_ids,'started_at',r.started_at,
  'ends_at',r.ends_at,'created_at',r.created_at,'teams',(
    select count(*) from public.ctf1_official_participations p
    where p.round_id=r.id and p.excluded_at is null)
 ) order by r.created_at desc)
 from (select * from public.ctf1_official_rounds
 where state<>'discarded' order by created_at desc limit 30) r),'[]'::jsonb);
end $rounds$;

create or replace function public.ctf1_student_status(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $status$
declare tid uuid:=app_private.team_for_token(p_token);
begin
 return coalesce((select jsonb_agg(jsonb_build_object(
 'round_id',r.id,'title',r.title,
 'state',case when r.state='running' and clock_timestamp()>=r.ends_at then 'ended' else r.state end,
 'mode',r.mode,'assessment_kind',r.assessment_kind,
 'started_at',r.started_at,'ends_at',r.ends_at,
 'server_now',clock_timestamp(),'excluded',p.excluded_at is not null)
 order by r.created_at desc)
 from public.ctf1_official_participations p
 join public.ctf1_official_rounds r on r.id=p.round_id
 where p.team_id=tid and r.state not in ('draft','discarded')),'[]'::jsonb);
end $status$;

revoke all on function public.ctf1_staff_create_labeled_round(uuid[],text,text),
 public.ctf1_staff_classify_round(uuid,text) from public,anon,authenticated;
grant execute on function public.ctf1_staff_create_labeled_round(uuid[],text,text),
 public.ctf1_staff_classify_round(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
