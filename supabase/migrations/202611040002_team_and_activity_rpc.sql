-- Anonymous users have EXECUTE only on a small, bounded public API.
create function public.register_team(p_class_id uuid,p_public_name text,p_member1 text,p_member2 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.teams; secret text; token text;
begin
 if not app_private.allow_request('register:global',100,3600) then return jsonb_build_object('error','Limite de cadastros atingido. Tente mais tarde.'); end if;
 if not exists(select 1 from public.classes where id=p_class_id) or
 p_public_name is null or length(btrim(p_public_name)) not between 2 and 80 or
 p_member1 is null or length(btrim(p_member1)) not between 3 and 160 or
 p_member2 is null or length(btrim(p_member2)) not between 3 and 160 then
 return jsonb_build_object('error','Informe a turma, o nome da dupla e os dois nomes completos.'); end if;
 -- Random private credential: 192 bits, shown once, never stored in plaintext.
 secret:=encode(extensions.gen_random_bytes(24),'hex');
 begin
 insert into public.teams(class_id,public_name,credential_hash) values(p_class_id,btrim(p_public_name),extensions.crypt(secret,extensions.gen_salt('bf',10))) returning * into t;
 exception when unique_violation then return jsonb_build_object('error','Este nome de dupla já existe nesta turma. Entre com suas credenciais.'); end;
 insert into public.team_members(team_id,position,full_name) values(t.id,1,btrim(p_member1)),(t.id,2,btrim(p_member2));
 token:=app_private.new_session(t.id);
 return jsonb_build_object('team_id',t.id,'public_name',t.public_name,'class_id',t.class_id,'access_code',t.access_code,'credential',secret,'token',token);
end;
$$;
create function public.login_team(p_access_code text,p_credential text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.teams; code text:=upper(btrim(p_access_code));
begin
 if not app_private.allow_request('login:global',1000,60) then return jsonb_build_object('error','Muitas tentativas. Aguarde um minuto.'); end if;
 if code is null or length(code)<>16 or p_credential is null or length(p_credential)<>48 then return jsonb_build_object('error','Código ou credencial inválidos.'); end if;
 -- Use a bounded key: unknown codes share one bucket (cannot grow table unbounded).
 select * into t from public.teams where access_code=code for update;
 if not app_private.allow_request('login:'||coalesce(t.id::text,'unknown'),10,900) then return jsonb_build_object('error','Muitas tentativas. Aguarde 15 minutos ou procure o administrador.'); end if;
 if t.id is null then
 perform extensions.crypt(p_credential,extensions.gen_salt('bf',10));
 return jsonb_build_object('error','Código ou credencial inválidos.');
 end if;
 if extensions.crypt(p_credential,t.credential_hash)<>t.credential_hash then return jsonb_build_object('error','Código ou credencial inválidos.'); end if;
 return jsonb_build_object('team_id',t.id,'public_name',t.public_name,'class_id',t.class_id,'access_code',t.access_code,'token',app_private.new_session(t.id));
end;
$$;
create function public.logout_team(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin delete from app_private.team_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex'); end;
$$;
create function public.team_history(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token);
begin
 return jsonb_build_object('team',(select jsonb_build_object('team_id',id,'class_id',class_id,'public_name',public_name,'access_code',access_code) from public.teams where id=t),
 'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'activity_session_id',a.activity_session_id,'title',act.title,'submitted_at',a.submitted_at,'submission_no',a.submission_no) order by a.created_at desc)
 from public.attempts a join public.activity_sessions s on s.id=a.activity_session_id join public.activities act on act.id=s.activity_id where a.team_id=t),'[]'));
 -- Grades and student full names remain available only to staff.
end;
$$;
create function public.public_activity(p_session_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.activity_sessions; act public.activities;
begin
 select * into s from public.activity_sessions where id=p_session_id and published and opens_at<=now() and (closes_at is null or closes_at>now());
 if s.id is null then return jsonb_build_object('error','Atividade indisponível ou encerrada.'); end if;
 select * into act from public.activities where id=s.activity_id;
 return jsonb_build_object('id',s.id,'title',act.title,'description',act.description,'class_ids',s.class_ids,'closes_at',s.closes_at,
 'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'kind',q.kind,'points',q.points,
 'options',(select jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) order by o.position) from public.question_options o where o.question_id=q.id)) order by q.position)
 from public.questions q where q.activity_id=act.id),'[]'));
end;
$$;
create function public.join_activity(p_token text,p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token); s public.activity_sessions; a public.attempts; n int:=1;
begin
 select * into s from public.activity_sessions where id=p_session_id and published and opens_at<=now() and (closes_at is null or closes_at>now()) for share;
 if s.id is null then raise exception 'Atividade indisponível ou encerrada'; end if;
 if not exists(select 1 from public.teams where id=t and class_id=any(s.class_ids)) then raise exception 'Esta atividade não está disponível para sua turma'; end if;
 select * into a from public.attempts where team_id=t and activity_session_id=s.id order by submission_no desc limit 1 for update;
 if a.id is not null then
 if a.submitted_at is null then return jsonb_build_object('attempt_id',a.id); end if;
 if not a.retry_available then return jsonb_build_object('error','Entrega já registrada. Uma nova entrega exige autorização administrativa.'); end if;
 update public.attempts set retry_available=false where id=a.id; n:=a.submission_no+1;
 end if;
 insert into public.attempts(team_id,activity_session_id,submission_no) values(t,s.id,n) returning * into a;
 return jsonb_build_object('attempt_id',a.id);
end;
$$;
create function public.submit_attempt(p_token text,p_attempt_id uuid,p_answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=app_private.team_for_token(p_token); a public.attempts; s public.activity_sessions; q public.questions;
 item jsonb; opt public.question_options; total int:=0; maximum int:=0; correct_count int:=0; expected int;
begin
 select * into a from public.attempts where id=p_attempt_id and team_id=t for update;
 if a.id is null then raise exception 'Participação não encontrada' using errcode='42501'; end if;
 if a.submitted_at is not null then return jsonb_build_object('error','Esta entrega já foi registrada.'); end if;
 select * into s from public.activity_sessions where id=a.activity_session_id and published and opens_at<=now() and (closes_at is null or closes_at>now()) for share;
 if s.id is null then raise exception 'Atividade encerrada'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Respostas inválidas'; end if;
 select count(*) into expected from public.questions where activity_id=s.activity_id;
 if jsonb_array_length(p_answers)<>expected or expected=0 then raise exception 'Responda todas as questões'; end if;
 if (select count(distinct x->>'question_id') from jsonb_array_elements(p_answers) x)<>expected then raise exception 'Questões repetidas ou inválidas'; end if;
 for item in select * from jsonb_array_elements(p_answers) loop
 select * into q from public.questions where id=(item->>'question_id')::uuid and activity_id=s.activity_id;
 select * into opt from public.question_options where id=(item->>'option_id')::uuid and question_id=q.id;
 if q.id is null or opt.id is null then raise exception 'Questão ou alternativa inválida'; end if;
 insert into public.answers(attempt_id,question_id,option_id) values(a.id,q.id,opt.id);
 maximum:=maximum+q.points;
 if opt.is_correct then
 total:=total+q.points; correct_count:=correct_count+1;
 if s.ctf_enabled then
 insert into public.ctf_score_events(team_id,question_id,attempt_id,points,solved_delta,reason)
 values(t,q.id,a.id,q.points,1,'Primeira resolução correta em sessão CTF') on conflict(team_id,question_id) where question_id is not null do nothing;
 end if;
 end if;
 end loop;
 insert into public.grades(attempt_id,points,max_points) values(a.id,total,maximum);
 update public.attempts set submitted_at=now() where id=a.id;
 return jsonb_build_object('submitted',true,'attempt_id',a.id);
end;
$$;
create function public.rotate_team_credential(p_team_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare secret text:=encode(extensions.gen_random_bytes(24),'hex'); code text;
begin
 perform app_private.require_admin();
 update public.teams set credential_hash=extensions.crypt(secret,extensions.gen_salt('bf',10)),updated_at=now() where id=p_team_id returning access_code into code;
 if code is null then raise exception 'Dupla não encontrada'; end if;
 delete from app_private.team_sessions where team_id=p_team_id;
 delete from app_private.rate_buckets where key='login:'||p_team_id::text;
 insert into public.audit_events(actor_id,action,target_id) values(auth.uid(),'rotate_team_credential',p_team_id);
 return jsonb_build_object('access_code',code,'credential',secret);
end;
$$;
create function public.authorize_retry(p_attempt_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 update public.attempts a set retry_available=true where id=p_attempt_id and submitted_at is not null
 and not exists(select 1 from public.attempts newer where newer.team_id=a.team_id and newer.activity_session_id=a.activity_session_id and newer.submission_no>a.submission_no);
 if not found then raise exception 'Selecione a última entrega concluída'; end if;
 insert into public.audit_events(actor_id,action,target_id) values(auth.uid(),'authorize_retry',p_attempt_id);
end;
$$;

-- Deny the default PUBLIC EXECUTE granted to new functions.
revoke all on function public.register_team(uuid,text,text,text),public.login_team(text,text),public.logout_team(text),public.team_history(text),public.public_activity(uuid),public.join_activity(text,uuid),public.submit_attempt(text,uuid,jsonb),public.rotate_team_credential(uuid),public.authorize_retry(uuid) from public,anon,authenticated;
grant execute on function public.register_team(uuid,text,text,text),public.login_team(text,text),public.logout_team(text),public.team_history(text),public.public_activity(uuid),public.join_activity(text,uuid),public.submit_attempt(text,uuid,jsonb) to anon,authenticated;
grant execute on function public.rotate_team_credential(uuid),public.authorize_retry(uuid) to authenticated;
