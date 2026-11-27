-- CTF 1 Aula 7 — first server-side foundation; NOT a production deployment.
-- Independently authenticated student sessions, teacher-controlled 60m round,
-- per-team server-secret flag verification and immutable submission metadata.
-- Ranking integration is intentionally omitted until explicit final homologation.
begin;

create table public.ctf1_official_rounds (
 id uuid primary key default gen_random_uuid(),
 title text not null default 'CTF 1 — Aula 7',
 class_ids uuid[] not null check(cardinality(class_ids) between 1 and 2),
 state text not null default 'draft' check(state in ('draft','running','ended','audited')),
 mode text not null default 'test' check(mode in ('test','official')),
 duration_seconds integer not null default 3600 check(duration_seconds=3600),
 started_at timestamptz, ends_at timestamptz, closed_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 check ((started_at is null and ends_at is null) or (started_at is not null and ends_at is not null))
);
create index ctf1_official_rounds_dates on public.ctf1_official_rounds(started_at desc);

create table public.ctf1_official_participations (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.ctf1_official_rounds(id),
 team_id uuid not null references public.teams(id),
 excluded_at timestamptz,
 excluded_reason text check(excluded_reason is null or char_length(excluded_reason) between 10 and 500),
 excluded_by uuid references auth.users(id),
 audited_at timestamptz,
 audited_by uuid references auth.users(id),
 score jsonb,
 score_reason text,
 created_at timestamptz not null default clock_timestamp(),
 unique(round_id,team_id),
 check ((excluded_at is null and excluded_reason is null and excluded_by is null)
     or (excluded_at is not null and excluded_reason is not null and excluded_by is not null)),
 check (score is null or jsonb_typeof(score)='object')
);
create index ctf1_official_team_rounds on public.ctf1_official_participations(team_id,round_id);

create table public.ctf1_official_submissions (
 id bigint generated always as identity primary key,
 round_id uuid not null references public.ctf1_official_rounds(id),
 team_id uuid not null references public.teams(id),
 challenge_no smallint not null check(challenge_no between 1 and 3),
 accepted boolean not null,
 submitted_at timestamptz not null default clock_timestamp()
);
create index ctf1_official_submissions_team on public.ctf1_official_submissions(round_id,team_id,challenge_no,submitted_at);

create table public.ctf1_official_writeups (
 round_id uuid not null,
 team_id uuid not null,
 challenge_no smallint not null check(challenge_no between 1 and 3),
 content jsonb not null default '{}'::jsonb,
 saved_at timestamptz not null default clock_timestamp(),
 primary key(round_id,team_id,challenge_no),
 foreign key (round_id,team_id)
   references public.ctf1_official_participations(round_id,team_id),
 check(jsonb_typeof(content)='object' and pg_column_size(content)<6000)
);

create table public.ctf1_official_audit (
 id bigint generated always as identity primary key,
 round_id uuid not null references public.ctf1_official_rounds(id),
 team_id uuid references public.teams(id),
 staff_id uuid references auth.users(id),
 at timestamptz not null default clock_timestamp(),
 kind text not null check(kind in ('round_start','round_end','team_exclude','team_restore','flag_attempt','writeup_saved','graded','terminal_event')),
 detail jsonb not null default '{}'::jsonb check(pg_column_size(detail)<3000)
);
create index ctf1_official_audit_lookup on public.ctf1_official_audit(round_id,team_id,at);

-- Server-only secret, never GRANT to browser roles or RPC returning plaintext.
create table app_private.ctf1_official_secrets (
 round_id uuid primary key references public.ctf1_official_rounds(id),
 secret bytea not null check(octet_length(secret)=32)
);

alter table public.ctf1_official_rounds enable row level security;
alter table public.ctf1_official_participations enable row level security;
alter table public.ctf1_official_submissions enable row level security;
alter table public.ctf1_official_writeups enable row level security;
alter table public.ctf1_official_audit enable row level security;
alter table app_private.ctf1_official_secrets enable row level security;
revoke all on public.ctf1_official_rounds,public.ctf1_official_participations,
 public.ctf1_official_submissions,public.ctf1_official_writeups,public.ctf1_official_audit
 from public,anon,authenticated;
revoke all on app_private.ctf1_official_secrets from public,anon,authenticated;
revoke all on sequence public.ctf1_official_submissions_id_seq,
 public.ctf1_official_audit_id_seq from public,anon,authenticated;

-- HMAC is derived inside a private function. The client never receives the
-- secret. The fixture-generation Edge Function will need a separate privileged
-- path with staff-approved authorization, never access through anon.
create function app_private.ctf1_flag_value(p_round uuid,p_team uuid,p_challenge smallint)
returns text language plpgsql stable security definer set search_path='' as $$
declare key bytea; digest_hex text;
begin
 if p_challenge not between 1 and 3 then raise exception 'Desafio inválido'; end if;
 select secret into key from app_private.ctf1_official_secrets where round_id=p_round;
 if key is null then raise exception 'Rodada inexistente';end if;
 digest_hex:=encode(extensions.hmac(
   convert_to(p_round::text||':'||p_team::text||':'||p_challenge::text,'UTF8'),
   key,'sha256'),'hex');
 if p_challenge=2 then
   -- IPv4 pseudo-public synthetic address, scoped to the team's challenge.
   return 'FLAG{100.'||
     ((get_byte(decode(substr(digest_hex,1,6),'hex'),0))::text)||'.'||
     ((get_byte(decode(substr(digest_hex,1,6),'hex'),1))::text)||'.'||
     ((get_byte(decode(substr(digest_hex,1,6),'hex'),2))::text)||'}';
 end if;
 return 'FLAG{'||(case when p_challenge=1 then 'rastro_' else 'cofre_' end)||
   substr(digest_hex,1,20)||'}';
end; $$;
revoke all on function app_private.ctf1_flag_value(uuid,uuid,smallint) from public,anon,authenticated;

create function public.ctf1_staff_create_round(p_class_ids uuid[],p_title text default 'CTF 1 — Aula 7',p_mode text default 'test',p_team_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; n integer; team_total integer;
begin
 perform app_private.require_staff();
 if p_mode <> 'test' then raise exception 'Modo oficial bloqueado ate homologacao de isolamento da VM';end if;
 if p_class_ids is null or cardinality(p_class_ids) not between 1 and 2
    or (select count(distinct x) from unnest(p_class_ids) x)<>cardinality(p_class_ids)
    or (select count(*) from public.classes where id=any(p_class_ids))<>cardinality(p_class_ids)
 then raise exception 'Selecione uma ou duas turmas válidas' using errcode='22023';end if;
 if p_team_ids is not null then
  team_total:=cardinality(p_team_ids);
  if team_total not between 1 and 30 or
   (select count(distinct x) from unnest(p_team_ids) x)<>team_total or
   (select count(*) from public.teams t where t.id=any(p_team_ids) and t.status='active' and t.class_id=any(p_class_ids))<>team_total
  then raise exception 'Selecione 1 a 30 duplas ativas das turmas escolhidas' using errcode='22023';end if;
 end if;
 if char_length(btrim(coalesce(p_title,''))) not between 5 and 100 then
   raise exception 'Título inválido' using errcode='22023';end if;
 insert into public.ctf1_official_rounds(class_ids,title,created_by,mode)
 values(p_class_ids,btrim(p_title),auth.uid(),p_mode) returning id into rid;
 insert into app_private.ctf1_official_secrets(round_id,secret)
 values(rid,extensions.gen_random_bytes(32));
 insert into public.ctf1_official_participations(round_id,team_id)
 select rid,t.id from public.teams t
 where t.class_id=any(p_class_ids) and t.status='active' and (p_team_ids is null or t.id=any(p_team_ids));
 get diagnostics n=row_count;
 if n=0 then raise exception 'Nenhuma dupla ativa selecionada' using errcode='22023';end if;
 return rid;
end $$;

create function public.ctf1_staff_start_round(p_round uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.ctf1_official_rounds; v_now timestamptz;
begin
 perform app_private.require_staff();
 select * into r from public.ctf1_official_rounds where id=p_round for update;
 if r.id is null or r.state<>'draft' then
  raise exception 'Rodada inexistente ou já iniciada' using errcode='22023';end if;
 v_now:=clock_timestamp();
 update public.ctf1_official_rounds
 set state='running',started_at=v_now,
     ends_at=v_now+interval '60 minutes'
 where id=p_round returning * into r;
 insert into public.ctf1_official_audit(round_id,staff_id,kind)
 values(p_round,auth.uid(),'round_start');
 return jsonb_build_object('id',r.id,'state',r.state,
   'started_at',r.started_at,'ends_at',r.ends_at);
end $$;

create function public.ctf1_staff_end_round(p_round uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.ctf1_official_rounds;
begin
 perform app_private.require_staff();
 select * into r from public.ctf1_official_rounds where id=p_round for update;
 if r.id is null or r.state<>'running' then raise exception 'Rodada não está em andamento';end if;
 update public.ctf1_official_rounds set state='ended',
   closed_at=clock_timestamp(),ends_at=least(ends_at,clock_timestamp())
 where id=p_round;
 insert into public.ctf1_official_audit(round_id,staff_id,kind)
 values(p_round,auth.uid(),'round_end');
end $$;

create function public.ctf1_student_status(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid:=app_private.team_for_token(p_token);
begin
 -- Team token identifies the row; caller cannot request someone else's team.
 return coalesce((select jsonb_agg(jsonb_build_object(
 'round_id',r.id,'title',r.title,
 'state',case when r.state='running' and clock_timestamp()>=r.ends_at then 'ended' else r.state end,'mode',r.mode,
 'started_at',r.started_at,'ends_at',r.ends_at,'mode',r.mode,
 'server_now',clock_timestamp(),'excluded',p.excluded_at is not null)
 order by r.created_at desc)
 from public.ctf1_official_participations p
 join public.ctf1_official_rounds r on r.id=p.round_id
 where p.team_id=tid and r.state<>'draft'), '[]'::jsonb);
end $$;

create function public.ctf1_student_submit_flag(
 p_token text,p_round uuid,p_challenge smallint,p_flag text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid:=app_private.team_for_token(p_token);
 r public.ctf1_official_rounds;
 p public.ctf1_official_participations;
 success boolean;
 n integer;
begin
 if p_challenge not between 1 and 3 or char_length(coalesce(p_flag,''))>140
 then raise exception 'Flag inválida' using errcode='22023';end if;
 select * into r from public.ctf1_official_rounds where id=p_round for share;
 select * into p from public.ctf1_official_participations
 where round_id=p_round and team_id=tid for update;
 if r.id is null or p.id is null or p.excluded_at is not null or
    r.state<>'running' or clock_timestamp()<r.started_at
    or clock_timestamp()>=r.ends_at then
   raise exception 'Rodada não disponível para esta dupla' using errcode='42501';end if;
 if not app_private.allow_request('ctf1:flag:'||tid::text||':'||p_round::text,20,300)
 then raise exception 'Tentativas em excesso. Aguarde.' using errcode='42901';end if;
 success := p_flag=app_private.ctf1_flag_value(p_round,tid,p_challenge);
 insert into public.ctf1_official_submissions(round_id,team_id,challenge_no,accepted)
 values(p_round,tid,p_challenge,success);
 insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(p_round,tid,'flag_attempt',jsonb_build_object('challenge_no',p_challenge,'accepted',success));
 -- No submitted plaintext is stored, even when incorrect.
 select count(distinct challenge_no) into n
 from public.ctf1_official_submissions
 where round_id=p_round and team_id=tid and accepted;
 return jsonb_build_object('accepted',success,'challenge_no',p_challenge,
   'solved_count',n,'server_now',clock_timestamp());
end $$;

create function public.ctf1_student_save_writeup(
 p_token text,p_round uuid,p_challenge smallint,p_content jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare tid uuid:=app_private.team_for_token(p_token);
 r public.ctf1_official_rounds;
 p public.ctf1_official_participations;
begin
 if p_challenge not between 1 and 3 or p_content is null or
    jsonb_typeof(p_content)<>'object' or pg_column_size(p_content)>=5000 then
    raise exception 'Write-up inválido' using errcode='22023';end if;
 select * into r from public.ctf1_official_rounds where id=p_round for share;
 select * into p from public.ctf1_official_participations
 where round_id=p_round and team_id=tid for update;
 if r.id is null or p.id is null or p.excluded_at is not null or
    r.state<>'running' or clock_timestamp()>=r.ends_at
 then raise exception 'Período de escrita encerrado' using errcode='42501';end if;
 insert into public.ctf1_official_writeups(round_id,team_id,challenge_no,content)
 values(p_round,tid,p_challenge,p_content)
 on conflict(round_id,team_id,challenge_no)
 do update set content=excluded.content,saved_at=clock_timestamp();
 insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
 values(p_round,tid,'writeup_saved',jsonb_build_object('challenge_no',p_challenge));
end $$;

create function public.ctf1_staff_exclude(p_round uuid,p_team uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 if length(btrim(coalesce(p_reason,''))) not between 10 and 500
 then raise exception 'Informe motivo com 10 a 500 caracteres';end if;
 update public.ctf1_official_participations
 set excluded_at=clock_timestamp(),excluded_by=auth.uid(),excluded_reason=btrim(p_reason)
 where round_id=p_round and team_id=p_team and excluded_at is null;
 if not found then raise exception 'Participação indisponível';end if;
 insert into public.ctf1_official_audit(round_id,team_id,staff_id,kind,detail)
 values(p_round,p_team,auth.uid(),'team_exclude',jsonb_build_object('reason',btrim(p_reason)));
end $$;

create function public.ctf1_staff_restore(p_round uuid,p_team uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 if length(btrim(coalesce(p_reason,''))) not between 10 and 500
 then raise exception 'Informe motivo com 10 a 500 caracteres';end if;
 update public.ctf1_official_participations
 set excluded_at=null,excluded_by=null,excluded_reason=null
 where round_id=p_round and team_id=p_team and excluded_at is not null;
 if not found then raise exception 'Participação não excluída';end if;
 insert into public.ctf1_official_audit(round_id,team_id,staff_id,kind,detail)
 values(p_round,p_team,auth.uid(),'team_restore',jsonb_build_object('reason',btrim(p_reason)));
end $$;

create function public.ctf1_staff_grade(
 p_round uuid,p_team uuid,p_score jsonb,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare k text; cap int; value_int int; total int:=0; field_count int;
begin
 perform app_private.require_staff();
 if p_score is null or jsonb_typeof(p_score)<>'object'
   or char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000
 then raise exception 'Notas ou justificativa inválidas';end if;
 select count(*) into field_count from jsonb_object_keys(p_score);
 if field_count<>6 then raise exception 'Informe exatamente seis notas';end if;
 for k,cap in select * from (values
  ('mission1',30),('mission2',60),('mission3',80),
  ('writeup1',10),('writeup2',10),('writeup3',10)
 ) as caps(k,max_points) loop
  if not p_score ? k or jsonb_typeof(p_score->k)<>'number'
     or p_score->>k !~ '^[0-9]+$' then raise exception 'Nota inválida em %',k;end if;
  value_int:=(p_score->>k)::integer;
  if value_int<0 or value_int>cap then raise exception 'Nota fora do limite: %',k;end if;
  total:=total+value_int;
 end loop;
 if total>200 then raise exception 'Total acima de 200';end if;
 update public.ctf1_official_participations
 set audited_at=clock_timestamp(),audited_by=auth.uid(),
 score=p_score,score_reason=btrim(p_reason)
 where round_id=p_round and team_id=p_team and excluded_at is null;
 if not found then raise exception 'Participação inexistente ou excluída';end if;
 insert into public.ctf1_official_audit(round_id,team_id,staff_id,kind,detail)
 values(p_round,p_team,auth.uid(),'graded',jsonb_build_object('score',p_score,'total',total,'reason',btrim(p_reason)));
 return total;
end $$;


-- Read-only staff dashboard APIs; no direct grant on sensitive tables.
create function public.ctf1_staff_list_rounds()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',r.id,'title',r.title,'state','mode',r.mode,
 case when r.state='running' and clock_timestamp()>=r.ends_at then 'ended' else r.state end,
 'class_ids',r.class_ids,'started_at',r.started_at,'ends_at',r.ends_at,
 'created_at',r.created_at,'teams',(
   select count(*) from public.ctf1_official_participations p
   where p.round_id=r.id and p.excluded_at is null)
 ) order by r.created_at desc)
 from (select * from public.ctf1_official_rounds order by created_at desc limit 30) r),
 '[]'::jsonb);
end $$;

create function public.ctf1_staff_dashboard(p_round uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.ctf1_official_rounds; teams jsonb;
begin
 perform app_private.require_staff();
 select * into r from public.ctf1_official_rounds where id=p_round;
 if r.id is null then raise exception 'Rodada inexistente' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'team_id',t.id,'public_name',t.public_name,'class_id',t.class_id,
  'status',t.status,'excluded_at',p.excluded_at,'score',p.score,
  'audited_at',p.audited_at,'last_submission',(
   select max(s.submitted_at) from public.ctf1_official_submissions s
   where s.round_id=r.id and s.team_id=t.id),
  'solved',coalesce((
   select jsonb_agg(q.challenge_no order by q.challenge_no) from (
    select distinct challenge_no from public.ctf1_official_submissions
    where round_id=r.id and team_id=t.id and accepted
   ) q), '[]'::jsonb),
  'writeups',coalesce((
   select jsonb_agg(w.challenge_no order by w.challenge_no)
   from public.ctf1_official_writeups w
   where w.round_id=r.id and w.team_id=t.id), '[]'::jsonb)
 ) order by t.public_name), '[]'::jsonb)
 into teams from public.ctf1_official_participations p
 join public.teams t on t.id=p.team_id
 where p.round_id=r.id;
 return jsonb_build_object('round',jsonb_build_object(
  'id',r.id,'title',r.title,'state',
  case when r.state='running' and clock_timestamp()>=r.ends_at then 'ended' else r.state end,
  'started_at',r.started_at,'ends_at',r.ends_at,'server_now',clock_timestamp(),
  'duration_seconds',r.duration_seconds),
  'teams',teams);
end $$;

create function public.ctf1_staff_audit_team(p_round uuid,p_team uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.ctf1_official_participations;
begin
 perform app_private.require_staff();
 select * into p from public.ctf1_official_participations
 where round_id=p_round and team_id=p_team;
 if p.id is null then raise exception 'Dupla não pertence à rodada' using errcode='42501';end if;
 return jsonb_build_object(
  'team_id',p_team,'round_id',p_round,'score',p.score,
  'score_reason',p.score_reason,'audited_at',p.audited_at,
  'excluded_at',p.excluded_at,'excluded_reason',p.excluded_reason,
  'submissions',coalesce((
   select jsonb_agg(jsonb_build_object('challenge',challenge_no,
    'accepted',accepted,'submitted_at',submitted_at) order by submitted_at)
   from public.ctf1_official_submissions where round_id=p_round and team_id=p_team), '[]'::jsonb),
  'writeups',coalesce((
   select jsonb_object_agg(challenge_no::text,content)
   from public.ctf1_official_writeups where round_id=p_round and team_id=p_team), '{}'::jsonb),
  'events',coalesce((
   select jsonb_agg(jsonb_build_object('kind',kind,'at',at,'detail',detail) order by at)
   from (select * from public.ctf1_official_audit
    where round_id=p_round and team_id=p_team order by at limit 1000) a), '[]'::jsonb));
end $$;
-- Test-mode fixture only: browser VM needs per-team real evidence. The browser
-- receives the flags to embed in its local image, therefore this is NOT a
-- cheating-resistant competition design. Official-mode start remains blocked.
create function public.ctf1_student_fixture(p_token text,p_round uuid)
returns jsonb language plpgsql security definer set search_path='' as $ctf1$
declare tid uuid:=app_private.team_for_token(p_token);
 r public.ctf1_official_rounds; p public.ctf1_official_participations;
begin
 select * into r from public.ctf1_official_rounds where id=p_round;
 select * into p from public.ctf1_official_participations
 where round_id=p_round and team_id=tid;
 if r.id is null or p.id is null or p.excluded_at is not null or r.mode<>'test'
    or r.state<>'running' or clock_timestamp()>=r.ends_at then
   raise exception 'Laboratório de teste indisponível para esta dupla' using errcode='42501';
 end if;
 return jsonb_build_object('round_id',p_round,'team_id',tid,'mode','test',
   'first_flag',app_private.ctf1_flag_value(p_round,tid,1::smallint),
   'second_flag',app_private.ctf1_flag_value(p_round,tid,2::smallint),
   'third_flag',app_private.ctf1_flag_value(p_round,tid,3::smallint),
   'ends_at',r.ends_at,'server_now',clock_timestamp());
end $ctf1$;
revoke all on function public.ctf1_student_fixture(text,uuid) from public,anon,authenticated;
grant execute on function public.ctf1_student_fixture(text,uuid) to anon,authenticated;

create function public.ctf1_student_progress(p_token text,p_round uuid)
returns jsonb language plpgsql security definer set search_path='' as $ctf1$
declare tid uuid:=app_private.team_for_token(p_token);
begin
 if not exists(select 1 from public.ctf1_official_participations p
  join public.ctf1_official_rounds r on r.id=p.round_id
  where p.round_id=p_round and p.team_id=tid and p.excluded_at is null and r.mode='test'
  and r.state<>'draft') then raise exception 'Participação indisponível' using errcode='42501';end if;
 return jsonb_build_object(
 'solved',coalesce((select jsonb_agg(challenge_no order by challenge_no) from (
 select distinct challenge_no from public.ctf1_official_submissions
 where round_id=p_round and team_id=tid and accepted) q),'[]'::jsonb),
 'writeups',coalesce((select jsonb_object_agg(challenge_no::text,content)
 from public.ctf1_official_writeups where round_id=p_round and team_id=tid),'{}'::jsonb));
end $ctf1$;
revoke all on function public.ctf1_student_progress(text,uuid) from public,anon,authenticated;
grant execute on function public.ctf1_student_progress(text,uuid) to anon,authenticated;

create function public.ctf1_student_append_commands(
 p_token text,p_round uuid,p_commands jsonb)
returns integer language plpgsql security definer set search_path='' as $ctf1$
declare tid uuid:=app_private.team_for_token(p_token);
 r public.ctf1_official_rounds; p public.ctf1_official_participations;
 item jsonb; command_text text; n integer:=0;
begin
 if p_commands is null or jsonb_typeof(p_commands)<>'array' or
    jsonb_array_length(p_commands)>12 or pg_column_size(p_commands)>6000 then
   raise exception 'Lote de comandos inválido' using errcode='22023';end if;
 select * into r from public.ctf1_official_rounds where id=p_round;
 select * into p from public.ctf1_official_participations
 where round_id=p_round and team_id=tid;
 if r.id is null or p.id is null or p.excluded_at is not null or r.mode<>'test'
  or r.state<>'running' or clock_timestamp()>=r.ends_at then
  raise exception 'Rodada encerrada' using errcode='42501';end if;
 if not app_private.allow_request('ctf1:commands:'||tid::text||':'||p_round::text,30,60)
 then raise exception 'Limite de telemetria' using errcode='42901';end if;
 for item in select value from jsonb_array_elements(p_commands) loop
  if jsonb_typeof(item)<>'string' then raise exception 'Formato de comando inválido';end if;
  command_text:=left(btrim(item#>>'{}'),200);
  if command_text<>'' then
   -- Never persist flags, passwords, hashes or untrusted crypto protocol.
   command_text:=regexp_replace(command_text,'FLAG\\{[^}]*\\}','FLAG{REDACTED}','g');
   command_text:=regexp_replace(command_text,'(-pass[[:space:]]+pass:)[^[:space:]]+','\\1[REDACTED]','gi');
   command_text:=regexp_replace(command_text,'(password|senha|token|credential)=([^[:space:]]+)','\\1=[REDACTED]','gi');
   command_text:=regexp_replace(command_text,'[a-fA-F0-9]{32,}','[HASH REDACTED]','g');
   insert into public.ctf1_official_audit(round_id,team_id,kind,detail)
   values(p_round,tid,'terminal_event',jsonb_build_object('command',command_text));
   n:=n+1;
  end if;
 end loop;
 return n;
end $ctf1$;
revoke all on function public.ctf1_student_append_commands(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ctf1_student_append_commands(text,uuid,jsonb) to anon,authenticated;

-- Restrict all functions to their intended roles.
revoke all on function public.ctf1_staff_create_round(uuid[],text,text,uuid[]),
 public.ctf1_staff_start_round(uuid),public.ctf1_staff_end_round(uuid),
 public.ctf1_student_status(text),
 public.ctf1_student_submit_flag(text,uuid,smallint,text),
 public.ctf1_student_save_writeup(text,uuid,smallint,jsonb),
 public.ctf1_staff_exclude(uuid,uuid,text),public.ctf1_staff_restore(uuid,uuid,text),
 public.ctf1_staff_grade(uuid,uuid,jsonb,text)
 from public,anon,authenticated;
grant execute on function public.ctf1_staff_create_round(uuid[],text,text,uuid[]),
 public.ctf1_staff_start_round(uuid),public.ctf1_staff_end_round(uuid),
 public.ctf1_staff_exclude(uuid,uuid,text),public.ctf1_staff_restore(uuid,uuid,text),
 public.ctf1_staff_grade(uuid,uuid,jsonb,text) to authenticated;
revoke all on function public.ctf1_staff_list_rounds(),
 public.ctf1_staff_dashboard(uuid),public.ctf1_staff_audit_team(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.ctf1_staff_list_rounds(),
 public.ctf1_staff_dashboard(uuid),public.ctf1_staff_audit_team(uuid,uuid)
 to authenticated;
grant execute on function public.ctf1_student_status(text),
 public.ctf1_student_submit_flag(text,uuid,smallint,text),
 public.ctf1_student_save_writeup(text,uuid,smallint,jsonb),
 public.ctf1_student_fixture(text,uuid),public.ctf1_student_progress(text,uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
