-- Apply only after the active test round is complete. No existing data is deleted.
-- Atomic flag validation + write-up submission, sequential advancement, replay protection.
begin;
create or replace function public.ctf1_student_complete_challenge(
 p_token text,p_round uuid,p_challenge smallint,p_flag text,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $ctf$
declare
 tid uuid:=app_private.team_for_token(p_token);
 r public.ctf1_official_rounds;
 p public.ctf1_official_participations;
 k integer; completed integer[]:=array[]::integer[]; success boolean;
begin
 if p_challenge not between 1 and 3 or char_length(btrim(coalesce(p_flag,''))) not between 1 and 140
   or p_content is null or jsonb_typeof(p_content)<>'object' or pg_column_size(p_content)>=5000
 then raise exception 'Entrega inválida' using errcode='22023'; end if;
 if jsonb_typeof(p_content->'command')<>'string' or
    jsonb_typeof(p_content->'reason')<>'string' or
    jsonb_typeof(p_content->'evidence')<>'string' or
    length(btrim(coalesce(p_content->>'command','')))=0 or
    length(btrim(coalesce(p_content->>'reason','')))=0 or
    length(btrim(coalesce(p_content->>'evidence','')))=0
 then raise exception 'Preencha todos os campos do write-up' using errcode='22023'; end if;

 select * into r from public.ctf1_official_rounds where id=p_round for share;
 select * into p from public.ctf1_official_participations
 where round_id=p_round and team_id=tid for update;
 if r.id is null or p.id is null or p.excluded_at is not null or r.mode<>'test'
  or r.state<>'running' or clock_timestamp()<r.started_at or clock_timestamp()>=r.ends_at
 then raise exception 'Rodada indisponível' using errcode='42501'; end if;

 for k in 1..3 loop
   if exists(select 1 from public.ctf1_official_submissions s
      where s.round_id=p_round and s.team_id=tid and s.challenge_no=k and s.accepted)
    and exists(select 1 from public.ctf1_official_writeups w
      where w.round_id=p_round and w.team_id=tid and w.challenge_no=k
      and length(btrim(coalesce(w.content->>'command','')))>0
      and length(btrim(coalesce(w.content->>'reason','')))>0
      and length(btrim(coalesce(w.content->>'evidence','')))>0)
   then completed:=array_append(completed,k); end if;
 end loop;
 if p_challenge=any(completed) then
   raise exception 'Desafio já entregue; não pode ser resolvido novamente' using errcode='23505';
 end if;
 if p_challenge<>coalesce((select min(n) from generate_series(1,3) n
   where not n=any(completed)),4)
 then raise exception 'Conclua o desafio anterior primeiro' using errcode='42501'; end if;
 if not app_private.allow_request('ctf1:flag:'||tid::text||':'||p_round::text,20,300)
 then raise exception 'Tentativas em excesso. Aguarde.' using errcode='42901';end if;

 success:=p_flag=app_private.ctf1_flag_value(p_round,tid,p_challenge);
 insert into public.ctf1_official_submissions(round_id,team_id,challenge_no,accepted)
 values(p_round,tid,p_challenge,success);
 insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(p_round,tid,'flag_attempt',jsonb_build_object('challenge_no',p_challenge,'accepted',success));
 if not success then
   return jsonb_build_object('accepted',false,'completed',to_jsonb(completed),'next_challenge',p_challenge);
 end if;

 insert into public.ctf1_official_writeups(round_id,team_id,challenge_no,content)
 values(p_round,tid,p_challenge,p_content)
 on conflict(round_id,team_id,challenge_no)
 do update set content=excluded.content,saved_at=clock_timestamp();
 insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(p_round,tid,'challenge_completed',jsonb_build_object('challenge_no',p_challenge));
 completed:=array_append(completed,p_challenge);
 return jsonb_build_object('accepted',true,'completed',to_jsonb(completed),
   'next_challenge',case when p_challenge=3 then null else p_challenge+1 end);
end $ctf$;
revoke all on function public.ctf1_student_complete_challenge(text,uuid,smallint,text,jsonb) from public,anon,authenticated;
grant execute on function public.ctf1_student_complete_challenge(text,uuid,smallint,text,jsonb) to anon,authenticated;
-- Legacy split endpoints must no longer bypass sequential finalization.
revoke execute on function public.ctf1_student_submit_flag(text,uuid,smallint,text) from anon,authenticated;
revoke execute on function public.ctf1_student_save_writeup(text,uuid,smallint,jsonb) from anon,authenticated;
notify pgrst,'reload schema';
commit;
