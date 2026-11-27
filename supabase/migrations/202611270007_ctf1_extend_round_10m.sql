-- Staff-controlled ten-minute extension of a running CTF 1 round.
-- Does not change started_at, duration_seconds, student sessions or grades.
begin;

alter table public.ctf1_official_audit
 drop constraint if exists ctf1_official_audit_kind_check;
alter table public.ctf1_official_audit
 add constraint ctf1_official_audit_kind_check
 check (kind in (
   'round_start','round_end','team_exclude','team_restore',
   'flag_attempt','writeup_saved','graded','terminal_event',
   'round_discard','round_extend'
 ));

create function public.ctf1_staff_extend_round_10m(p_round uuid)
returns jsonb
language plpgsql security definer set search_path='' as $extend$
declare
 r public.ctf1_official_rounds;
 previous_end timestamptz;
 new_end timestamptz;
 now_at timestamptz;
begin
 perform app_private.require_staff();

 -- Serialize repeated clicks so none can overwrite the other's extension.
 select * into r from public.ctf1_official_rounds where id=p_round for update;
 now_at:=clock_timestamp();
 if r.id is null or r.state<>'running' or r.mode<>'test'
    or r.discarded_at is not null
    or r.started_at is null or r.ends_at is null or now_at>=r.ends_at
 then
  raise exception 'Somente rodadas de teste em andamento podem receber +10 minutos'
   using errcode='42501';
 end if;

 -- 60 minutes normal + at most 60 minutes of extension.
 if r.ends_at + interval '10 minutes' > r.started_at + interval '120 minutes'
 then
  raise exception 'Limite de 60 minutos extras atingido' using errcode='22023';
 end if;
 previous_end:=r.ends_at;
 new_end:=r.ends_at+interval '10 minutes';
 update public.ctf1_official_rounds
 set ends_at=new_end
 where id=r.id;

 insert into public.ctf1_official_audit(round_id,staff_id,kind,detail)
 values(r.id,auth.uid(),'round_extend',jsonb_build_object(
  'minutes',10,'previous_ends_at',previous_end,'new_ends_at',new_end));

 return jsonb_build_object(
  'round_id',r.id,'minutes_added',10,
  'previous_ends_at',previous_end,'new_ends_at',new_end,
  'server_now',now_at);
end $extend$;

revoke all on function public.ctf1_staff_extend_round_10m(uuid)
 from public,anon,authenticated;
grant execute on function public.ctf1_staff_extend_round_10m(uuid)
 to authenticated;

notify pgrst,'reload schema';
commit;
