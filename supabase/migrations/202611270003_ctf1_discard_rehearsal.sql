-- Reversible-looking archive semantics: discarding a rehearsal does not delete
-- submitted flags, write-ups, audit history, or any score.
begin;
alter table public.ctf1_official_rounds
 drop constraint if exists ctf1_official_rounds_state_check;
alter table public.ctf1_official_rounds
 add constraint ctf1_official_rounds_state_check
 check (state in ('draft','running','ended','audited','discarded'));
alter table public.ctf1_official_rounds
 add column discarded_at timestamptz,
 add column discarded_by uuid references auth.users(id),
 add column discarded_reason text;
alter table public.ctf1_official_audit
 drop constraint if exists ctf1_official_audit_kind_check;
alter table public.ctf1_official_audit
 add constraint ctf1_official_audit_kind_check
 check (kind in ('round_start','round_end','team_exclude','team_restore',
  'flag_attempt','writeup_saved','graded','terminal_event','round_discard'));

create function public.ctf1_staff_discard_round(p_round uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $discard$
declare r public.ctf1_official_rounds;
begin
 perform app_private.require_staff();
 if length(btrim(coalesce(p_reason,''))) not between 10 and 500
 then raise exception 'Informe um motivo entre 10 e 500 caracteres' using errcode='22023';end if;
 select * into r from public.ctf1_official_rounds where id=p_round for update;
 if r.id is null or r.mode<>'test' or r.state='discarded' then
  raise exception 'Somente rodadas de teste existentes podem ser descartadas uma vez' using errcode='22023';
 end if;
 if r.state not in ('draft','running','ended') then
  raise exception 'Rodada auditada ou oficial não pode ser descartada' using errcode='42501';
 end if;
 update public.ctf1_official_rounds
 set state='discarded',discarded_at=clock_timestamp(),discarded_by=auth.uid(),
 discarded_reason=btrim(p_reason),
 closed_at=coalesce(closed_at,clock_timestamp()),
 ends_at=case when ends_at is not null then least(ends_at,clock_timestamp()) else null end
 where id=p_round;
 insert into public.ctf1_official_audit(round_id,staff_id,kind,detail)
 values(p_round,auth.uid(),'round_discard',jsonb_build_object(
 'previous_state',r.state,'reason',btrim(p_reason)));
end $discard$;
revoke all on function public.ctf1_staff_discard_round(uuid,text) from public,anon,authenticated;
grant execute on function public.ctf1_staff_discard_round(uuid,text) to authenticated;

-- Keep discarded rounds queryable by identifier for staff forensic access,
-- but remove from main round selector, student list and scoring preview.
create or replace function public.ctf1_staff_list_rounds()
returns jsonb language plpgsql stable security definer set search_path='' as $discard$
begin
 perform app_private.require_staff();
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',r.id,'title',r.title,'state',
 case when r.state='running' and clock_timestamp()>=r.ends_at then 'ended' else r.state end,
 'mode',r.mode,'class_ids',r.class_ids,'started_at',r.started_at,
 'ends_at',r.ends_at,'created_at',r.created_at,'teams',(
   select count(*) from public.ctf1_official_participations p
   where p.round_id=r.id and p.excluded_at is null)
 ) order by r.created_at desc)
 from (select * from public.ctf1_official_rounds
 where state<>'discarded' order by created_at desc limit 30) r),
 '[]'::jsonb);
end $discard$;

create or replace function public.ctf1_student_status(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $discard$
declare tid uuid:=app_private.team_for_token(p_token);
begin
 return coalesce((select jsonb_agg(jsonb_build_object(
 'round_id',r.id,'title',r.title,
 'state',case when r.state='running' and clock_timestamp()>=r.ends_at then 'ended' else r.state end,
 'mode',r.mode,'started_at',r.started_at,'ends_at',r.ends_at,
 'server_now',clock_timestamp(),'excluded',p.excluded_at is not null)
 order by r.created_at desc)
 from public.ctf1_official_participations p
 join public.ctf1_official_rounds r on r.id=p.round_id
 where p.team_id=tid and r.state not in ('draft','discarded')), '[]'::jsonb);
end $discard$;

notify pgrst,'reload schema';
commit;
