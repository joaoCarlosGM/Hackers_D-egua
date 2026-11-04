create function public.save_activity(p_title text,p_description text,p_class_ids uuid[],p_questions jsonb,p_ctf boolean default false,p_activity_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare aid uuid; q jsonb; o jsonb; qid uuid; pos int:=0; opos int; kind text; correct int;
begin
 perform app_private.require_staff();
 if p_class_ids is null or cardinality(p_class_ids) not between 1 and 2 or (select count(*) from public.classes where id=any(p_class_ids))<>cardinality(p_class_ids) then raise exception 'Selecione uma ou duas turmas válidas'; end if;
 if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) not between 1 and 100 then raise exception 'Informe de 1 a 100 questões'; end if;
 if p_activity_id is null then
 insert into public.activities(title,description,created_by) values(btrim(p_title),p_description,auth.uid()) returning id into aid;
 insert into public.activity_sessions(activity_id,class_ids,ctf_enabled) values(aid,p_class_ids,p_ctf);
 else
 aid:=p_activity_id;
 perform 1 from public.activities where id=aid for update;
 if not found then raise exception 'Atividade não encontrada'; end if;
 -- Published content stays immutable, even after unpublishing; history must survive.
 if exists(select 1 from public.activities where id=aid and locked_at is not null) then raise exception 'Atividade publicada ou com participações não pode ser editada. Crie uma nova atividade.'; end if;
 update public.activities set title=btrim(p_title),description=p_description,updated_at=now() where id=aid;
 update public.activity_sessions set class_ids=p_class_ids,ctf_enabled=p_ctf where activity_id=aid;
 delete from public.questions where activity_id=aid;
 end if;
 for q in select * from jsonb_array_elements(p_questions) loop
 pos:=pos+1; kind:=q->>'kind';
 if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 8 then raise exception 'Informe de 2 a 8 alternativas por questão'; end if;
 if kind='true_false' and (jsonb_array_length(q->'options')<>2 or q->'options'->0->>'label'<>'Verdadeiro' or q->'options'->1->>'label'<>'Falso') then raise exception 'V/F exige as opções Verdadeiro e Falso'; end if;
 select count(*) into correct from jsonb_array_elements(q->'options') x where (x->>'is_correct')::boolean is true;
 if correct<>1 then raise exception 'Marque exatamente uma alternativa correta'; end if;
 insert into public.questions(activity_id,prompt,kind,points,position) values(aid,btrim(q->>'prompt'),kind,(q->>'points')::int,pos) returning id into qid;
 opos:=0;
 for o in select * from jsonb_array_elements(q->'options') loop
 opos:=opos+1;
 insert into public.question_options(question_id,label,is_correct,position) values(qid,btrim(o->>'label'),coalesce((o->>'is_correct')::boolean,false),opos);
 end loop;
 end loop;
 insert into public.audit_events(actor_id,action,target_id) values(auth.uid(),'save_activity',aid);
 return aid;
end;
$$;
create function public.set_session_publication(p_session_id uuid,p_published boolean,p_closes_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare aid uuid;
begin
 perform app_private.require_staff();
 select activity_id into aid from public.activity_sessions where id=p_session_id;
 if aid is null then raise exception 'Sessão não encontrada'; end if;
 -- Same lock as save_activity prevents publication racing a draft edit.
 perform 1 from public.activities where id=aid for update;
 if not exists(select 1 from public.questions where activity_id=aid) then raise exception 'Atividade sem questões'; end if;
 if p_published then update public.activities set locked_at=coalesce(locked_at,now()) where id=aid; end if;
 update public.activity_sessions set published=p_published,closes_at=p_closes_at where id=p_session_id;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'set_publication',p_session_id,jsonb_build_object('published',p_published,'closes_at',p_closes_at));
end;
$$;
create function public.adjust_grade(p_attempt_id uuid,p_points int,p_feedback text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 update public.grades set points=p_points,feedback=p_feedback,graded_by=auth.uid(),updated_at=now() where attempt_id=p_attempt_id;
 if not found then raise exception 'Nota não encontrada'; end if;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'adjust_grade',p_attempt_id,jsonb_build_object('points',p_points));
 -- Pedagogical corrections intentionally do not change the CTF score.
end;
$$;
create function public.adjust_ctf(p_event_id uuid,p_team_id uuid,p_points int,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 insert into public.ctf_score_events(id,team_id,points,reason,created_by) values(p_event_id,p_team_id,p_points,btrim(p_reason),auth.uid()) on conflict(id) do nothing;
 if found then insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'adjust_ctf',p_team_id,jsonb_build_object('event_id',p_event_id,'points',p_points)); end if;
end;
$$;
revoke all on function public.save_activity(text,text,uuid[],jsonb,boolean,uuid),public.set_session_publication(uuid,boolean,timestamptz),public.adjust_grade(uuid,int,text),public.adjust_ctf(uuid,uuid,int,text) from public,anon,authenticated;
grant execute on function public.save_activity(text,text,uuid[],jsonb,boolean,uuid),public.set_session_publication(uuid,boolean,timestamptz),public.adjust_grade(uuid,int,text),public.adjust_ctf(uuid,uuid,int,text) to authenticated;

-- Database-level safeguards also protect privileged imports.
alter table public.question_options add constraint option_question_unique unique(id,question_id);
alter table public.answers add constraint answer_option_question_fk foreign key(option_id,question_id) references public.question_options(id,question_id);
create function app_private.require_two_members() returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 if tg_table_name='teams' then tid:=new.id; else tid:=coalesce(new.team_id,old.team_id); end if;
 if exists(select 1 from public.teams where id=tid) and (select count(*) from public.team_members where team_id=tid)<>2 then raise exception 'A dupla deve ter exatamente dois integrantes'; end if;
 if tg_table_name='team_members' then
 if tg_op='UPDATE' and old.team_id<>new.team_id then
 if exists(select 1 from public.teams where id=old.team_id) and (select count(*) from public.team_members where team_id=old.team_id)<>2 then raise exception 'A dupla original deve manter dois integrantes'; end if;
 end if;
 end if;
 return null;
end;
$$;
create constraint trigger teams_two_members after insert or update on public.teams deferrable initially deferred for each row execute function app_private.require_two_members();
create constraint trigger members_two after insert or update or delete on public.team_members deferrable initially deferred for each row execute function app_private.require_two_members();
create function app_private.valid_session_classes() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.classes where id=any(new.class_ids))<>cardinality(new.class_ids) then raise exception 'Turmas inválidas ou repetidas'; end if;
 return new;
end;
$$;
create trigger valid_session_classes before insert or update on public.activity_sessions for each row execute function app_private.valid_session_classes();
revoke all on function app_private.require_two_members(),app_private.valid_session_classes() from public,anon,authenticated;
