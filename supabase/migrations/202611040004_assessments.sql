-- Additive upgrade: existing teams, grades and CTF history are preserved.
alter table public.activities add column revision_of uuid references public.activities(id) on delete set null,
 add column revision integer not null default 1 check(revision>0);
alter table public.questions add column explanation text not null default '' check(length(explanation)<=5000);
alter table public.activity_sessions add column status text not null default 'draft' check(status in ('draft','published','open','closed','archived')),
 add column access_code text not null default upper(encode(extensions.gen_random_bytes(4),'hex')) unique,
 add column time_limit_seconds integer check(time_limit_seconds between 30 and 14400),
 add column allow_backtracking boolean not null default true,
 add column release_results boolean not null default false;
update public.activity_sessions s set status=case when published and (closes_at is null or closes_at>now()) then 'open' when published or exists(select 1 from public.attempts a where a.activity_session_id=s.id) then 'closed' else 'draft' end,
 ctf_enabled=false;
alter table public.attempts add column expired_at timestamptz;
-- Grades never generate CTF events, even for sessions migrated from the old module.
create table app_private.attempt_progress (
 attempt_id uuid primary key references public.attempts(id) on delete cascade,
 answers jsonb not null default '{}', current_question integer not null default 0 check(current_question>=0),
 updated_at timestamptz not null default now()
);
alter table app_private.attempt_progress enable row level security;
create table public.assessment_updates (
 activity_session_id uuid primary key references public.activity_sessions(id) on delete cascade,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.assessment_updates enable row level security;
revoke all on public.assessment_updates from public,anon,authenticated;
grant select on public.assessment_updates to authenticated;
create policy staff_updates on public.assessment_updates for select to authenticated using((select app_private.is_staff()));
create function app_private.notify_assessment() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if tg_table_name='attempts' then sid:=new.activity_session_id;
 elsif tg_table_name='grades' then select activity_session_id into sid from public.attempts where id=new.attempt_id;
 else sid:=new.id; end if;
 insert into public.assessment_updates(activity_session_id) values(sid) on conflict(activity_session_id) do update set updated_at=clock_timestamp();
 return new;
end;
$$;
create trigger assessment_attempt_update after insert or update on public.attempts for each row execute function app_private.notify_assessment();
create trigger assessment_grade_update after insert or update on public.grades for each row execute function app_private.notify_assessment();
create trigger assessment_session_update after insert or update on public.activity_sessions for each row execute function app_private.notify_assessment();
revoke all on function app_private.notify_assessment() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.assessment_updates; end if;
end $$;


-- A teacher also sees the registered-team count update before the first question.
create function app_private.notify_team_registration() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.assessment_updates(activity_session_id)
 select id from public.activity_sessions where status='open' and new.class_id=any(class_ids)
 on conflict(activity_session_id) do update set updated_at=clock_timestamp();
 return new;
end;
$$;
create trigger assessment_team_registered after insert on public.teams for each row execute function app_private.notify_team_registration();
revoke all on function app_private.notify_team_registration() from public,anon,authenticated;

-- Keep the tested foundation writer internal, and add a checked configuration API.
alter function public.save_activity(text,text,uuid[],jsonb,boolean,uuid) set schema app_private;
alter function app_private.save_activity(text,text,uuid[],jsonb,boolean,uuid) rename to foundation_save_activity;
revoke all on function app_private.foundation_save_activity(text,text,uuid[],jsonb,boolean,uuid) from public,anon,authenticated;
create function public.save_assessment(p_title text,p_description text,p_class_ids uuid[],p_questions jsonb,p_settings jsonb default '{}',p_activity_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare aid uuid; q jsonb; pos int:=0;
begin
 perform app_private.require_staff();
 if p_activity_id is not null then
 perform 1 from public.activities where id=p_activity_id for update;
 if not found then raise exception 'Atividade não encontrada'; end if;
 perform 1 from public.activity_sessions where activity_id=p_activity_id for update;
 if exists(select 1 from public.activity_sessions where activity_id=p_activity_id and status<>'draft') or exists(select 1 from public.attempts a join public.activity_sessions s on s.id=a.activity_session_id where s.activity_id=p_activity_id) then raise exception 'Edição bloqueada. Duplique a atividade para criar uma revisão.'; end if;
 update public.activities set locked_at=null where id=p_activity_id;
 end if;
 if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Questões inválidas'; end if;
 for q in select * from jsonb_array_elements(p_questions) loop
 if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 5 then raise exception 'Cada questão deve ter de 2 a 5 alternativas'; end if;
 end loop;
 aid:=app_private.foundation_save_activity(p_title,p_description,p_class_ids,p_questions,false,p_activity_id);
 for q in select * from jsonb_array_elements(p_questions) loop
 pos:=pos+1; update public.questions set explanation=coalesce(q->>'explanation','') where activity_id=aid and position=pos;
 end loop;
 update public.activity_sessions set time_limit_seconds=nullif(p_settings->>'time_limit_seconds','')::integer,
 allow_backtracking=coalesce((p_settings->>'allow_backtracking')::boolean,true),
 release_results=coalesce((p_settings->>'release_results')::boolean,false),ctf_enabled=false where activity_id=aid;
 return aid;
end;
$$;
create function public.save_activity(p_title text,p_description text,p_class_ids uuid[],p_questions jsonb,p_ctf boolean default false,p_activity_id uuid default null) returns uuid
language sql security definer set search_path='' as $$
 select public.save_assessment(p_title,p_description,p_class_ids,p_questions,'{}'::jsonb,p_activity_id);
$$;
create function public.transition_assessment(p_session_id uuid,p_status text,p_closes_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare s public.activity_sessions; aid uuid;
begin
 perform app_private.require_staff();
 select activity_id into aid from public.activity_sessions where id=p_session_id;
 if aid is null then raise exception 'Sessão não encontrada'; end if;
 perform 1 from public.activities where id=aid for update;
 select * into s from public.activity_sessions where id=p_session_id for update;
 if p_status is null or not ((s.status='draft' and p_status='published') or (s.status='published' and p_status in ('draft','open','closed')) or (s.status='open' and p_status='closed') or (s.status='closed' and p_status in ('open','archived')) or (s.status='archived' and p_status='closed') or s.status=p_status) then raise exception 'Transição de estado inválida'; end if;
 if p_status='draft' and exists(select 1 from public.attempts where activity_session_id=s.id) then raise exception 'Atividade com participações não pode voltar a rascunho'; end if;
 if p_status in ('published','open') and not exists(select 1 from public.questions where activity_id=aid) then raise exception 'Adicione questões antes de publicar'; end if;
 if p_status='open' and p_closes_at is not null and p_closes_at<=clock_timestamp() then raise exception 'O prazo deve estar no futuro'; end if;
 update public.activity_sessions set status=p_status,published=p_status='open',
 opens_at=case when p_status='open' then now() else opens_at end,
 closes_at=case when p_status='open' then p_closes_at else closes_at end where id=s.id;
 update public.activities set locked_at=case when p_status='draft' then null else coalesce(locked_at,now()) end where id=aid;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'assessment_transition',s.id,jsonb_build_object('from',s.status,'to',p_status));
end;
$$;
create or replace function public.set_session_publication(p_session_id uuid,p_published boolean,p_closes_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.transition_assessment(p_session_id,case when p_published then 'published' else 'closed' end,p_closes_at); end;
$$;
create function public.duplicate_assessment(p_activity_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.activities; s public.activity_sessions; qs jsonb; aid uuid;
begin
 perform app_private.require_staff();
 select * into a from public.activities where id=p_activity_id for share;
 if a.id is null then raise exception 'Atividade não encontrada'; end if;
 select * into s from public.activity_sessions where activity_id=a.id order by created_at desc limit 1;
 select jsonb_agg(jsonb_build_object('prompt',q.prompt,'kind',q.kind,'points',q.points,'explanation',q.explanation,
 'options',(select jsonb_agg(jsonb_build_object('label',o.label,'is_correct',o.is_correct) order by o.position) from public.question_options o where o.question_id=q.id)) order by q.position) into qs from public.questions q where q.activity_id=a.id;
 aid:=public.save_assessment(left(a.title,145)||' (revisão)',a.description,s.class_ids,qs,jsonb_build_object('time_limit_seconds',s.time_limit_seconds,'allow_backtracking',s.allow_backtracking,'release_results',s.release_results));
 update public.activities set revision_of=a.id,revision=a.revision+1 where id=aid;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'duplicate_assessment',aid,jsonb_build_object('source',a.id));
 return aid;
end;
$$;
create function public.delete_assessment(p_activity_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 perform 1 from public.activities where id=p_activity_id for update;
 if not found then raise exception 'Atividade não encontrada'; end if;
 perform 1 from public.activity_sessions where activity_id=p_activity_id for update;
 if exists(select 1 from public.attempts a join public.activity_sessions s on s.id=a.activity_session_id where s.activity_id=p_activity_id) then raise exception 'Há participações. Arquive a atividade para preservar o histórico.'; end if;
 if exists(select 1 from public.activity_sessions where activity_id=p_activity_id and status='open') then raise exception 'Encerre a atividade antes de excluir'; end if;
 delete from public.activity_sessions where activity_id=p_activity_id;
 delete from public.activities where id=p_activity_id;
 insert into public.audit_events(actor_id,action,target_id) values(auth.uid(),'delete_assessment',p_activity_id);
end;
$$;
create function public.set_result_release(p_session_id uuid,p_release boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 update public.activity_sessions set release_results=p_release where id=p_session_id;
 if not found then raise exception 'Sessão não encontrada'; end if;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'release_assessment_results',p_session_id,jsonb_build_object('release',p_release));
end;
$$;
create or replace function public.public_activity(p_session_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.activity_sessions; a public.activities;
begin
 select * into s from public.activity_sessions where id=p_session_id and status='open' and published and opens_at<=now() and (closes_at is null or closes_at>now());
 if s.id is null then return jsonb_build_object('error','Atividade indisponível ou encerrada.'); end if;
 select * into a from public.activities where id=s.activity_id;
 return jsonb_build_object('id',s.id,'title',a.title,'description',a.description,'class_ids',s.class_ids,'access_code',s.access_code,
 'closes_at',s.closes_at,'time_limit_seconds',s.time_limit_seconds,'allow_backtracking',s.allow_backtracking,
 'questions',(select jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'kind',q.kind,'points',q.points,
 'options',(select jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) order by o.position) from public.question_options o where o.question_id=q.id)) order by q.position) from public.questions q where q.activity_id=a.id));
end;
$$;
create function public.resolve_assessment_code(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not app_private.allow_request('resolve:global',1000,60) then return jsonb_build_object('error','Muitas consultas. Aguarde um minuto.'); end if;
 select id into sid from public.activity_sessions where access_code=upper(btrim(p_code)) and status='open' and (closes_at is null or closes_at>now());
 if sid is null then return jsonb_build_object('error','Código inválido ou atividade encerrada.'); end if;
 return jsonb_build_object('session_id',sid);
end;
$$;
create or replace function public.join_activity(p_token text,p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token); s public.activity_sessions; a public.attempts; n int:=1; deadline timestamptz;
begin
 select * into s from public.activity_sessions where id=p_session_id and status='open' and published and opens_at<=now() and (closes_at is null or closes_at>now()) for share;
 if s.id is null then raise exception 'Atividade indisponível ou encerrada'; end if;
 if not exists(select 1 from public.teams where id=t and class_id=any(s.class_ids)) then raise exception 'Esta atividade não está disponível para sua turma'; end if;
 select * into a from public.attempts where team_id=t and activity_session_id=s.id order by submission_no desc limit 1 for update;
 if a.id is not null and (a.submitted_at is not null or a.expired_at is not null) then
 if not a.retry_available then return jsonb_build_object('attempt_id',a.id,'submitted',a.submitted_at is not null,'expired',a.expired_at is not null); end if;
 update public.attempts set retry_available=false where id=a.id; n:=a.submission_no+1; a.id:=null;
 end if;
 if a.id is null then insert into public.attempts(team_id,activity_session_id,submission_no) values(t,s.id,n) returning * into a; end if;
 if s.time_limit_seconds is not null then deadline:=a.created_at+make_interval(secs=>s.time_limit_seconds); end if;
 insert into app_private.attempt_progress(attempt_id) values(a.id) on conflict do nothing;
 return jsonb_build_object('attempt_id',a.id,'submitted',false,'deadline',deadline,'server_now',clock_timestamp(),
 'progress',(select jsonb_build_object('answers',answers,'current_question',current_question) from app_private.attempt_progress where attempt_id=a.id));
end;
$$;
create function public.save_attempt_progress(p_token text,p_attempt_id uuid,p_answers jsonb,p_current_question integer) returns void language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token); a public.attempts; s public.activity_sessions; item record; previous app_private.attempt_progress; cnt int;
begin
 select * into a from public.attempts where id=p_attempt_id and team_id=t for update;
 if a.id is null or a.submitted_at is not null or a.expired_at is not null then raise exception 'Participação inválida ou concluída'; end if;
 select * into s from public.activity_sessions where id=a.activity_session_id for share;
 if s.status<>'open' or (s.closes_at is not null and s.closes_at<=clock_timestamp()) or (s.time_limit_seconds is not null and a.created_at+make_interval(secs=>s.time_limit_seconds)<=clock_timestamp()) then raise exception 'Atividade ou tempo encerrado'; end if;
 select count(*) into cnt from public.questions where activity_id=s.activity_id;
 if jsonb_typeof(p_answers) is distinct from 'object' or p_current_question not between 0 and cnt-1 then raise exception 'Progresso inválido'; end if;
 for item in select * from jsonb_each_text(p_answers) loop
 if not exists(select 1 from public.question_options o join public.questions q on q.id=o.question_id where q.id=item.key::uuid and q.activity_id=s.activity_id and o.id=item.value::uuid) then raise exception 'Alternativa inválida'; end if;
 end loop;
 select * into previous from app_private.attempt_progress where attempt_id=a.id;
 if not s.allow_backtracking and previous.attempt_id is not null then
 if p_current_question<previous.current_question then raise exception 'Navegação anterior não permitida'; end if;
 if exists(select 1 from public.questions q where q.activity_id=s.activity_id and q.position<=previous.current_question and previous.answers->>q.id::text is distinct from p_answers->>q.id::text) then raise exception 'Respostas anteriores não podem ser alteradas'; end if;
 end if;
 insert into app_private.attempt_progress(attempt_id,answers,current_question) values(a.id,p_answers,p_current_question)
 on conflict(attempt_id) do update set answers=excluded.answers,current_question=excluded.current_question,updated_at=now();
end;
$$;
create or replace function public.submit_attempt(p_token text,p_attempt_id uuid,p_answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token); a public.attempts; s public.activity_sessions; q public.questions; item jsonb; opt public.question_options;
 total int:=0; maximum int:=0; expected int; existing public.grades; saved app_private.attempt_progress;
begin
 select * into a from public.attempts where id=p_attempt_id and team_id=t for update;
 if a.expired_at is not null then raise exception 'Participação expirada. Solicite nova tentativa ao professor'; end if;
 if a.id is null then raise exception 'Participação não encontrada' using errcode='42501'; end if;
 -- Idempotent acknowledgement of an already committed submission; no score disclosure.
 if a.submitted_at is not null then return jsonb_build_object('submitted',true,'attempt_id',a.id,'already_submitted',true); end if;
 select * into s from public.activity_sessions where id=a.activity_session_id and status='open' and published and opens_at<=now() and (closes_at is null or closes_at>clock_timestamp()) for share;
 if s.id is null then raise exception 'Atividade encerrada'; end if;
 if s.time_limit_seconds is not null and a.created_at+make_interval(secs=>s.time_limit_seconds)<=clock_timestamp() then raise exception 'Tempo da avaliação encerrado'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Respostas inválidas'; end if;
 select count(*) into expected from public.questions where activity_id=s.activity_id;
 if jsonb_array_length(p_answers)<>expected or expected=0 then raise exception 'Responda todas as questões'; end if;
 if (select count(distinct x->>'question_id') from jsonb_array_elements(p_answers) x)<>expected then raise exception 'Questões repetidas ou inválidas'; end if;
 select * into saved from app_private.attempt_progress where attempt_id=a.id;
 for item in select * from jsonb_array_elements(p_answers) loop
 select * into q from public.questions where id=(item->>'question_id')::uuid and activity_id=s.activity_id;
 select * into opt from public.question_options where id=(item->>'option_id')::uuid and question_id=q.id;
 if q.id is null or opt.id is null then raise exception 'Questão ou alternativa inválida'; end if;
 if not s.allow_backtracking and q.position<=saved.current_question and saved.answers->>q.id::text is distinct from item->>'option_id' then raise exception 'Resposta anterior não pode ser alterada'; end if;
 insert into public.answers(attempt_id,question_id,option_id) values(a.id,q.id,opt.id);
 maximum:=maximum+q.points; if opt.is_correct then total:=total+q.points; end if;
 end loop;
 insert into public.grades(attempt_id,points,max_points) values(a.id,total,maximum);
 update public.attempts set submitted_at=clock_timestamp() where id=a.id;
 return jsonb_build_object('submitted',true,'attempt_id',a.id);
end;
$$;
create or replace function public.authorize_retry(p_attempt_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 update public.attempts a set retry_available=true where id=p_attempt_id
 and not exists(select 1 from public.attempts newer where newer.team_id=a.team_id and newer.activity_session_id=a.activity_session_id and newer.submission_no>a.submission_no);
 if not found then raise exception 'Selecione a última participação'; end if;
 -- Revoke the old in-progress attempt without inventing a delivery or a grade.
 update public.attempts set expired_at=case when submitted_at is null then clock_timestamp() else expired_at end where id=p_attempt_id;
 insert into public.audit_events(actor_id,action,target_id) values(auth.uid(),'authorize_retry',p_attempt_id);
end;
$$;
create function public.team_result(p_token text,p_attempt_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token); result jsonb;
begin
 select jsonb_build_object('points',g.points,'max_points',g.max_points,'feedback',g.feedback) into result
 from public.attempts a join public.grades g on g.attempt_id=a.id join public.activity_sessions s on s.id=a.activity_session_id
 where a.id=p_attempt_id and a.team_id=t and s.release_results and s.status in ('closed','archived');
 if result is null then return jsonb_build_object('error','Resultado ainda não liberado pelo professor.'); end if;
 return result;
end;
$$;
create function public.assessment_results(p_activity_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.require_staff();
 if not exists(select 1 from public.activities where id=p_activity_id) then raise exception 'Atividade não encontrada'; end if;
 select jsonb_build_object('title',a.title,'sessions',(select jsonb_agg(to_jsonb(s)) from public.activity_sessions s where s.activity_id=a.id),
 'registered_teams',(select count(*) from public.teams t where exists(select 1 from public.activity_sessions s where s.activity_id=a.id and t.class_id=any(s.class_ids))),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('attempt_id',at.id,'team_id',t.id,'public_name',t.public_name,'class_name',c.name,
 'members',(select jsonb_agg(m.full_name order by m.position) from public.team_members m where m.team_id=t.id),
 'started_at',at.created_at,'submitted_at',at.submitted_at,'expired_at',at.expired_at,'submission_no',at.submission_no,'retry_available',at.retry_available,
 'points',g.points,'max_points',g.max_points,'feedback',g.feedback,
 'answers',(select jsonb_agg(jsonb_build_object('question_id',q.id,'prompt',q.prompt,'selected',o.label,'correct',o.is_correct,'explanation',q.explanation) order by q.position)
 from public.answers ans join public.questions q on q.id=ans.question_id join public.question_options o on o.id=ans.option_id where ans.attempt_id=at.id)) order by at.created_at)
 from public.attempts at join public.activity_sessions s on s.id=at.activity_session_id join public.teams t on t.id=at.team_id join public.classes c on c.id=t.class_id left join public.grades g on g.attempt_id=at.id where s.activity_id=a.id),'[]'),
 'question_stats',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'responses',(select count(*) from public.answers where question_id=q.id),
 'correct',(select count(*) from public.answers ans join public.question_options o on o.id=ans.option_id where ans.question_id=q.id and o.is_correct)) order by q.position) from public.questions q where q.activity_id=a.id),'[]')) into result from public.activities a where a.id=p_activity_id;
 return result;
end;
$$;
revoke all on function public.save_assessment(text,text,uuid[],jsonb,jsonb,uuid),public.save_activity(text,text,uuid[],jsonb,boolean,uuid),public.transition_assessment(uuid,text,timestamptz),public.duplicate_assessment(uuid),public.delete_assessment(uuid),public.set_result_release(uuid,boolean),public.resolve_assessment_code(text),public.save_attempt_progress(text,uuid,jsonb,integer),public.team_result(text,uuid),public.assessment_results(uuid) from public,anon,authenticated;
grant execute on function public.save_assessment(text,text,uuid[],jsonb,jsonb,uuid),public.save_activity(text,text,uuid[],jsonb,boolean,uuid),public.transition_assessment(uuid,text,timestamptz),public.duplicate_assessment(uuid),public.delete_assessment(uuid),public.set_result_release(uuid,boolean),public.assessment_results(uuid) to authenticated;
grant execute on function public.resolve_assessment_code(text),public.save_attempt_progress(text,uuid,jsonb,integer),public.team_result(text,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
