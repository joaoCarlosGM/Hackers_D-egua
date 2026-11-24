-- Revisão Pré-CTF: APENAS professor/admin; Linux emulado no navegador.
-- Telemetria é originada no navegador, não substitui auditoria confiável do CTF oficial.
-- Nenhuma alteração em ranking, grades, ctf_score_events ou RPCs de pontuação.
create table if not exists public.ctf_review_teacher_runs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete restrict,
  title text not null default 'Revisão Pré-CTF — demonstração',
  started_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  writeup jsonb not null default '{}'::jsonb,
  constraint writeup_object check(jsonb_typeof(writeup)='object' and pg_column_size(writeup)<20000)
);
create index if not exists ctf_review_teacher_runs_owner on public.ctf_review_teacher_runs(teacher_id,started_at desc);

create table if not exists public.ctf_review_teacher_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.ctf_review_teacher_runs(id) on delete restrict,
  at timestamptz not null default clock_timestamp(),
  kind text not null check(kind in ('vm_boot','vm_ready','lab_setup','command','output','challenge','writeup','vm_stop','error')),
  detail text not null default '' check(char_length(detail)<=3000)
);
create index if not exists ctf_review_teacher_events_replay on public.ctf_review_teacher_events(run_id,id);

alter table public.ctf_review_teacher_runs enable row level security;
alter table public.ctf_review_teacher_events enable row level security;
revoke all on public.ctf_review_teacher_runs,public.ctf_review_teacher_events from public,anon,authenticated;
revoke all on sequence public.ctf_review_teacher_events_id_seq from public,anon,authenticated;

create or replace function public.ctf_teacher_review_authorized()
returns boolean
language sql stable security definer
set search_path=''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.admin_users a
    where a.user_id=auth.uid() and a.role in ('admin','teacher')
  );
$$;
revoke all on function public.ctf_teacher_review_authorized() from public,anon,authenticated;
-- Somente funções abaixo chamam este auxiliar.

create or replace function public.ctf_teacher_review_start()
returns uuid language plpgsql security definer set search_path=''
as $$
declare rid uuid;
begin
 if not public.ctf_teacher_review_authorized() then
   raise exception 'Professor não autorizado' using errcode='42501';
 end if;
 insert into public.ctf_review_teacher_runs(teacher_id) values (auth.uid()) returning id into rid;
 return rid;
end;
$$;

create or replace function public.ctf_teacher_review_append(p_run uuid,p_events jsonb)
returns integer language plpgsql security definer set search_path=''
as $$
declare item jsonb; k text; d text; n integer:=0;
begin
 if not public.ctf_teacher_review_authorized() or not exists(
    select 1 from public.ctf_review_teacher_runs where id=p_run and teacher_id=auth.uid() and closed_at is null
 ) then raise exception 'Sessão indisponível' using errcode='42501'; end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>25
    or pg_column_size(p_events)>65000 then
    raise exception 'Lote inválido (máximo 25 eventos e 65 kB)' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(p_events) loop
   k:=item->>'kind';d:=coalesce(item->>'detail','');
   if k not in ('vm_boot','vm_ready','lab_setup','command','output','challenge','writeup','vm_stop','error')
      or char_length(d)>3000 then raise exception 'Evento inválido' using errcode='22023';end if;
   insert into public.ctf_review_teacher_events(run_id,kind,detail) values (p_run,k,d);
   n:=n+1;
 end loop;
 return n;
end;
$$;

create or replace function public.ctf_teacher_review_writeup(p_run uuid,p_writeup jsonb)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.ctf_teacher_review_authorized() then raise exception 'Não autorizado' using errcode='42501';end if;
 if jsonb_typeof(p_writeup)<>'object' or pg_column_size(p_writeup)>18000
  then raise exception 'Write-up inválido' using errcode='22023';end if;
 update public.ctf_review_teacher_runs set writeup=p_writeup
 where id=p_run and teacher_id=auth.uid() and closed_at is null;
 if not found then raise exception 'Sessão não encontrada' using errcode='42501';end if;
end;
$$;

create or replace function public.ctf_teacher_review_close(p_run uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.ctf_teacher_review_authorized() then raise exception 'Não autorizado' using errcode='42501';end if;
 update public.ctf_review_teacher_runs set closed_at=clock_timestamp()
 where id=p_run and teacher_id=auth.uid() and closed_at is null;
 if not found then raise exception 'Sessão não encontrada ou já encerrada' using errcode='42501';end if;
end;
$$;

create or replace function public.ctf_teacher_review_history()
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if not public.ctf_teacher_review_authorized() then raise exception 'Não autorizado' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc)
  from (select id,title,started_at,closed_at,writeup from public.ctf_review_teacher_runs
  where teacher_id=auth.uid() order by started_at desc limit 40) r),'[]'::jsonb);
end;
$$;

create or replace function public.ctf_teacher_review_report(p_run uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.ctf_review_teacher_runs; ev jsonb;
begin
 if not public.ctf_teacher_review_authorized() then raise exception 'Não autorizado' using errcode='42501';end if;
 select * into r from public.ctf_review_teacher_runs
 where id=p_run and teacher_id=auth.uid();
 if not found then raise exception 'Sessão não encontrada' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'at',at,'kind',kind,'detail',detail) order by id),'[]'::jsonb)
 into ev from (select id,at,kind,detail from public.ctf_review_teacher_events
 where run_id=p_run order by id limit 2000) events;
 return jsonb_build_object('run',jsonb_build_object('id',r.id,'title',r.title,
 'started_at',r.started_at,'closed_at',r.closed_at,'writeup',r.writeup),
 'events',ev,'truncated',(
 select count(*)>2000 from public.ctf_review_teacher_events where run_id=p_run
 ));
end;
$$;

do $do$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select,insert,update on public.ctf_review_teacher_runs,public.ctf_review_teacher_events to service_role;
    grant usage,select on sequence public.ctf_review_teacher_events_id_seq to service_role;
  end if;
end $do$;

revoke all on function public.ctf_teacher_review_start() from public,anon,authenticated;
revoke all on function public.ctf_teacher_review_append(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ctf_teacher_review_writeup(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ctf_teacher_review_close(uuid) from public,anon,authenticated;
revoke all on function public.ctf_teacher_review_history() from public,anon,authenticated;
revoke all on function public.ctf_teacher_review_report(uuid) from public,anon,authenticated;

grant execute on function public.ctf_teacher_review_start() to authenticated;
grant execute on function public.ctf_teacher_review_append(uuid,jsonb) to authenticated;
grant execute on function public.ctf_teacher_review_writeup(uuid,jsonb) to authenticated;
grant execute on function public.ctf_teacher_review_close(uuid) to authenticated;
grant execute on function public.ctf_teacher_review_history() to authenticated;
grant execute on function public.ctf_teacher_review_report(uuid) to authenticated;
notify pgrst,'reload schema';