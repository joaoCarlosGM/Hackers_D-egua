-- Each write-up is a final delivery, whether its flag is correct or not.
-- Server-side timing: first command (fallback round start), then previous delivery.
begin;
alter table public.ctf1_official_writeups
 add column if not exists flag_accepted boolean,
 add column if not exists started_at timestamptz,
 add column if not exists elapsed_seconds integer;
-- Preserve existing documents; reconstruct known correct flags without inventing missing timings.
update public.ctf1_official_writeups w
 set flag_accepted=exists(
  select 1 from public.ctf1_official_submissions s
  where s.round_id=w.round_id and s.team_id=w.team_id
   and s.challenge_no=w.challenge_no and s.accepted
 )
 where w.flag_accepted is null;

create or replace function public.ctf1_student_complete_challenge(
 p_token text,p_round uuid,p_challenge smallint,p_flag text,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $ctf$
declare
 tid uuid:=app_private.team_for_token(p_token);
 r public.ctf1_official_rounds;
 p public.ctf1_official_participations;
 k integer; done integer[]:=array[]::integer[];
 correct boolean; started timestamptz; now_at timestamptz:=clock_timestamp();
 seconds_taken integer;
begin
 if p_challenge not between 1 and 3 or char_length(btrim(coalesce(p_flag,''))) not between 1 and 140
  or p_content is null or jsonb_typeof(p_content)<>'object' or pg_column_size(p_content)>=5000
 then raise exception 'Entrega inválida' using errcode='22023';end if;
 if jsonb_typeof(p_content->'command')<>'string'
  or jsonb_typeof(p_content->'reason')<>'string'
  or jsonb_typeof(p_content->'evidence')<>'string'
  or length(btrim(coalesce(p_content->>'command','')))=0
  or length(btrim(coalesce(p_content->>'reason','')))=0
  or length(btrim(coalesce(p_content->>'evidence','')))=0
 then raise exception 'Preencha todos os campos do write-up' using errcode='22023';end if;
 select * into r from public.ctf1_official_rounds where id=p_round for share;
 select * into p from public.ctf1_official_participations
  where round_id=p_round and team_id=tid for update;
 if r.id is null or p.id is null or p.excluded_at is not null or r.mode<>'test'
  or r.state<>'running' or now_at<r.started_at or now_at>=r.ends_at
 then raise exception 'Rodada não disponível' using errcode='42501';end if;
 select coalesce(array_agg(challenge_no order by challenge_no),array[]::integer[])
  into done from public.ctf1_official_writeups
  where round_id=p_round and team_id=tid;
 if p_challenge=any(done) then
  raise exception 'Desafio já entregue; não pode ser refeito' using errcode='23505';end if;
 if p_challenge<>coalesce((select min(n) from generate_series(1,3) n where not (n=any(done))),4)
 then raise exception 'Entregue o desafio anterior primeiro' using errcode='42501';end if;
 if not app_private.allow_request('ctf1:flag:'||tid::text||':'||p_round::text,20,300)
 then raise exception 'Tentativas em excesso' using errcode='42901';end if;
 if p_challenge=1 then
  select coalesce(min(a.at),r.started_at) into started
   from public.ctf1_official_audit a
   where a.round_id=p_round and a.team_id=tid and a.kind='terminal_event'
     and a.at<=now_at;
 else
  select saved_at into started from public.ctf1_official_writeups
   where round_id=p_round and team_id=tid and challenge_no=p_challenge-1;
 end if;
 started:=coalesce(started,r.started_at);
 seconds_taken:=greatest(0,floor(extract(epoch from now_at-started))::integer);
 correct:=p_flag=app_private.ctf1_flag_value(p_round,tid,p_challenge);
 insert into public.ctf1_official_submissions(round_id,team_id,challenge_no,accepted,submitted_at)
 values(p_round,tid,p_challenge,correct,now_at);
 insert into public.ctf1_official_writeups(round_id,team_id,challenge_no,content,saved_at,flag_accepted,started_at,elapsed_seconds)
 values(p_round,tid,p_challenge,p_content,now_at,correct,started,seconds_taken);
 insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(p_round,tid,'flag_attempt',jsonb_build_object('challenge_no',p_challenge,'accepted',correct));
 insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(p_round,tid,'writeup_saved',jsonb_build_object(
  'challenge_no',p_challenge,'completed',true,'flag_accepted',correct,'elapsed_seconds',seconds_taken));
 done:=array_append(done,p_challenge);
 return jsonb_build_object('accepted',correct,'completed',to_jsonb(done),
  'next_challenge',case when p_challenge=3 then null else p_challenge+1 end,
  'elapsed_seconds',seconds_taken);
end $ctf$;

create or replace function public.ctf1_student_progress(p_token text,p_round uuid)
returns jsonb language plpgsql security definer set search_path='' as $ctf$
declare tid uuid:=app_private.team_for_token(p_token);
begin
 if not exists(select 1 from public.ctf1_official_participations p
  join public.ctf1_official_rounds r on r.id=p.round_id
  where p.round_id=p_round and p.team_id=tid and p.excluded_at is null and r.mode='test'
    and r.state<>'draft') then raise exception 'Participação indisponível' using errcode='42501';end if;
 return jsonb_build_object(
  'completed',coalesce((select jsonb_agg(challenge_no order by challenge_no)
   from public.ctf1_official_writeups where round_id=p_round and team_id=tid),'[]'::jsonb),
  'solved',coalesce((select jsonb_agg(challenge_no order by challenge_no)
   from public.ctf1_official_writeups where round_id=p_round and team_id=tid
     and flag_accepted=true),'[]'::jsonb),
  'writeups',coalesce((select jsonb_object_agg(challenge_no::text,content)
   from public.ctf1_official_writeups where round_id=p_round and team_id=tid),'{}'::jsonb)
 );
end $ctf$;

-- Staff-only compact progress used beside the existing dashboard, no ranking writes.
create or replace function public.ctf1_staff_challenge_results(p_round uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $staff$
begin
 perform app_private.require_staff();
 if not exists(select 1 from public.ctf1_official_rounds where id=p_round)
 then raise exception 'Rodada inexistente' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'team_id',p.team_id,
  'delivered',coalesce((select jsonb_agg(w.challenge_no order by w.challenge_no)
     from public.ctf1_official_writeups w where w.round_id=p_round and w.team_id=p.team_id),'[]'::jsonb),
  'correct',coalesce((select jsonb_agg(w.challenge_no order by w.challenge_no)
     from public.ctf1_official_writeups w where w.round_id=p_round and w.team_id=p.team_id
       and w.flag_accepted=true),'[]'::jsonb),
  'challenge_times',coalesce((select jsonb_agg(jsonb_build_object(
   'challenge',w.challenge_no,'seconds',w.elapsed_seconds,'started_at',w.started_at,'submitted_at',w.saved_at,
   'flag_accepted',w.flag_accepted) order by w.challenge_no)
    from public.ctf1_official_writeups w where w.round_id=p_round and w.team_id=p.team_id),'[]'::jsonb),
  'total_seconds',(select case when count(*)=3
     then greatest(0,floor(extract(epoch from max(w.saved_at)-min(w.started_at)))::integer)
     else null end
    from public.ctf1_official_writeups w where w.round_id=p_round and w.team_id=p.team_id)
  ) order by p.team_id)
  from public.ctf1_official_participations p where p.round_id=p_round),'[]'::jsonb);
end $staff$;
revoke all on function public.ctf1_staff_challenge_results(uuid) from public,anon,authenticated;
grant execute on function public.ctf1_staff_challenge_results(uuid) to authenticated;
revoke all on function public.ctf1_student_complete_challenge(text,uuid,smallint,text,jsonb) from public,anon,authenticated;
grant execute on function public.ctf1_student_complete_challenge(text,uuid,smallint,text,jsonb) to anon,authenticated;
revoke all on function public.ctf1_student_progress(text,uuid) from public,anon,authenticated;
grant execute on function public.ctf1_student_progress(text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
