-- Additive upgrade. No seed replay, data deletion, or changes to migrations 001–004.
alter table public.classes
 add column status text not null default 'active' check(status in ('active','archived')),
 add column updated_at timestamptz not null default now();
alter table public.classes drop constraint classes_slug_check;
alter table public.classes add constraint classes_slug_format_check
 check(length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
create index activity_sessions_classes_idx on public.activity_sessions using gin(class_ids);

-- Class metadata remains publicly readable for historical ranking labels.
-- Private students, grades, answers, and histories retain their existing RLS.
-- All class writes remain revoked for browser roles, including staff.
create function public.list_classes_admin(p_offset integer default 0,p_limit integer default 500) returns table (
 id uuid, name text, slug text, status text, team_count bigint,
 attempt_count bigint, activity_count bigint, can_delete boolean
) language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'Paginação inválida'; end if;
 return query
 select c.id,c.name,c.slug,c.status,
 (select count(*) from public.teams t where t.class_id=c.id),
 (select count(*) from public.attempts a join public.teams t on t.id=a.team_id where t.class_id=c.id),
 (select count(distinct s.activity_id) from public.activity_sessions s where s.class_ids @> array[c.id]),
 not exists(select 1 from public.teams t where t.class_id=c.id)
 and not exists(select 1 from public.activity_sessions s where s.class_ids @> array[c.id])
 and not exists(select 1 from public.public_leaderboard r where r.class_id=c.id)
 from public.classes c order by c.status,c.name,c.id offset p_offset limit p_limit;
end;
$$;
create function public.create_class(p_name text,p_slug text) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; label text:=btrim(p_name); code text:=lower(btrim(p_slug));
begin
 perform app_private.require_admin();
 if label is null or length(label) not between 1 and 120 then raise exception 'Informe um nome de turma com até 120 caracteres'; end if;
 if code is null or length(code) not between 1 and 80 or code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Identificador inválido: use letras sem acento, números e hífens'; end if;
 begin
 insert into public.classes(name,slug) values(label,code) returning id into cid;
 exception when unique_violation then raise exception 'Este identificador de turma já existe' using errcode='23505'; end;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'create_class',cid,jsonb_build_object('name',label,'slug',code));
 return cid;
end;
$$;
create function public.rename_class(p_class_id uuid,p_name text) returns void language plpgsql security definer set search_path='' as $$
declare c public.classes; label text:=btrim(p_name);
begin
 perform app_private.require_admin();
 if label is null or length(label) not between 1 and 120 then raise exception 'Informe um nome de turma com até 120 caracteres'; end if;
 select * into c from public.classes where id=p_class_id for update;
 if c.id is null then raise exception 'Turma não encontrada'; end if;
 if c.name=label then return; end if;
 update public.classes set name=label,updated_at=clock_timestamp() where id=c.id;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'rename_class',c.id,jsonb_build_object('old_name',c.name,'name',label));
end;
$$;
create function public.set_class_status(p_class_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare c public.classes;
begin
 perform app_private.require_admin();
 if p_status is null or p_status not in ('active','archived') then raise exception 'Estado da turma inválido'; end if;
 -- FOR UPDATE serializes archiving/deleting with enrollment and activity associations.
 select * into c from public.classes where id=p_class_id for update;
 if c.id is null then raise exception 'Turma não encontrada'; end if;
 if c.status=p_status then return; end if;
 update public.classes set status=p_status,updated_at=clock_timestamp() where id=c.id;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),case when p_status='archived' then 'archive_class' else 'reactivate_class' end,c.id,jsonb_build_object('from',c.status,'to',p_status));
end;
$$;
create function public.delete_class(p_class_id uuid,p_confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare c public.classes;
begin
 perform app_private.require_admin();
 select * into c from public.classes where id=p_class_id for update;
 if c.id is null then raise exception 'Turma não encontrada'; end if;
 if p_confirmation is distinct from 'EXCLUIR '||c.slug then raise exception 'Confirmação de exclusão inválida'; end if;
 if exists(select 1 from public.teams where class_id=c.id)
 or exists(select 1 from public.attempts a join public.teams t on t.id=a.team_id where t.class_id=c.id)
 or exists(select 1 from public.activity_sessions s where s.class_ids @> array[c.id])
 or exists(select 1 from public.public_leaderboard where class_id=c.id) then
 raise exception 'Turma possui duplas, participações ou atividades vinculadas. Arquive para preservar o histórico.' using errcode='23503';
 end if;
 -- No CASCADE: any additional foreign-key dependency must also block deletion.
 delete from public.classes where id=c.id;
 insert into public.audit_events(actor_id,action,target_id,details) values(auth.uid(),'delete_class',c.id,jsonb_build_object('name',c.name,'slug',c.slug,'status',c.status));
end;
$$;

-- Enrollment is checked before bcrypt work, and again for any privileged direct insert.
alter function public.register_team(uuid,text,text,text) set schema app_private;
alter function app_private.register_team(uuid,text,text,text) rename to foundation_register_team;
revoke all on function app_private.foundation_register_team(uuid,text,text,text) from public,anon,authenticated;
create function public.register_team(p_class_id uuid,p_public_name text,p_member1 text,p_member2 text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.classes where id=p_class_id and status='active' for share;
 if not found then return jsonb_build_object('error','Turma indisponível ou arquivada. Escolha uma turma ativa.'); end if;
 return app_private.foundation_register_team(p_class_id,p_public_name,p_member1,p_member2);
end;
$$;
create function app_private.require_active_class() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.classes where id=new.class_id and status='active' for share;
 if not found then raise exception 'Não é permitido cadastrar duplas em turmas arquivadas ou inexistentes'; end if;
 return new;
end;
$$;
create trigger team_requires_active_class before insert on public.teams for each row execute function app_private.require_active_class();

-- UUID arrays have no FK. Lock every referenced class before validating to prevent
-- concurrent class deletion from leaving a newly created activity with dangling IDs.
create or replace function app_private.valid_session_classes() returns trigger language plpgsql security definer set search_path='' as $$
declare linked int;
begin
 perform 1 from public.classes where id=any(new.class_ids) order by id for key share;
 get diagnostics linked=row_count;
 if linked<>cardinality(new.class_ids) then raise exception 'Turmas inválidas ou repetidas'; end if;
 return new;
end;
$$;
revoke all on function app_private.require_active_class(),app_private.valid_session_classes() from public,anon,authenticated;
revoke all on function public.list_classes_admin(integer,integer),public.create_class(text,text),public.rename_class(uuid,text),public.set_class_status(uuid,text),public.delete_class(uuid,text),public.register_team(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.list_classes_admin(integer,integer),public.create_class(text,text),public.rename_class(uuid,text),public.set_class_status(uuid,text),public.delete_class(uuid,text) to authenticated;
grant execute on function public.register_team(uuid,text,text,text) to anon,authenticated;
notify pgrst,'reload schema';
