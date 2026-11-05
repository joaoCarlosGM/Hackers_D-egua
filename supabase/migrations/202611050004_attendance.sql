-- Migration aditiva 008: chamada por aula e por integrante da dupla.
-- Executar após 202611050003_admin_access_management.sql.
-- Não altera presenças, notas, turmas, equipes ou pontuação existentes.

create table public.attendance_lessons (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references public.classes(id) on delete restrict,
 title text not null check(length(btrim(title)) between 3 and 160),
 lesson_date date not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique (class_id, lesson_date, title)
);
create index attendance_lessons_class_date_idx on public.attendance_lessons(class_id,lesson_date desc);

create table public.attendance_marks (
 lesson_id uuid not null references public.attendance_lessons(id) on delete restrict,
 member_id uuid not null references public.team_members(id) on delete restrict,
 status text not null check(status in ('present','absent','justified')),
 marked_by uuid not null references auth.users(id),
 marked_at timestamptz not null default now(),
 primary key(lesson_id,member_id)
);
create index attendance_marks_member_idx on public.attendance_marks(member_id);

alter table public.attendance_lessons enable row level security;
alter table public.attendance_marks enable row level security;
revoke all on public.attendance_lessons, public.attendance_marks from public, anon, authenticated;
grant select on public.attendance_lessons, public.attendance_marks to authenticated;
create policy staff_read on public.attendance_lessons for select to authenticated
 using((select app_private.is_staff()));
create policy staff_read on public.attendance_marks for select to authenticated
 using((select app_private.is_staff()));
-- Sem acesso anônimo ou escritas diretas; todas as alterações por RPC autorizada.

create function public.create_attendance_lesson(
 p_class_id uuid, p_title text, p_lesson_date date
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; normalized_title text:=btrim(p_title);
begin
 perform app_private.require_admin();
 if p_class_id is null or p_lesson_date is null then
  raise exception 'Informe turma e data da aula';
 end if;
 if normalized_title is null or length(normalized_title) not between 3 and 160 then
  raise exception 'O título da aula deve ter entre 3 e 160 caracteres';
 end if;
 perform 1 from public.classes where id=p_class_id and status='active' for share;
 if not found then raise exception 'A turma não existe ou está arquivada'; end if;
 insert into public.attendance_lessons(class_id,title,lesson_date,created_by)
 values(p_class_id,normalized_title,p_lesson_date,auth.uid())
 on conflict(class_id,lesson_date,title) do nothing returning id into result;
 if result is null then
  raise exception 'Já existe uma aula com esse nome e data nesta turma';
 end if;
 insert into public.audit_events(actor_id,action,target_id,details)
 values(auth.uid(),'attendance_lesson_created',result,
   jsonb_build_object('class_id',p_class_id,'lesson_date',p_lesson_date));
 return result;
end;
$$;

create function public.list_attendance_lessons(p_class_id uuid default null)
returns table(
 id uuid, class_id uuid, class_name text, title text, lesson_date date,
 students bigint, present bigint, absent bigint, justified bigint, unmarked bigint
) language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 return query
 select l.id,l.class_id,c.name,l.title,l.lesson_date,
   stats.students,stats.present,stats.absent,stats.justified,
   stats.students-stats.present-stats.absent-stats.justified
 from public.attendance_lessons l
 join public.classes c on c.id=l.class_id
 cross join lateral (
   select count(*)::bigint students,
    count(*) filter(where a.status='present')::bigint present,
    count(*) filter(where a.status='absent')::bigint absent,
    count(*) filter(where a.status='justified')::bigint justified
   from public.teams t
   join public.team_members m on m.team_id=t.id
   left join public.attendance_marks a on a.member_id=m.id and a.lesson_id=l.id
   where t.class_id=l.class_id
 ) stats
 where p_class_id is null or l.class_id=p_class_id
 order by l.lesson_date desc,l.title,l.id;
end;
$$;

create function public.list_attendance_roster(p_lesson_id uuid)
returns table(
 member_id uuid, team_id uuid, public_name text, full_name text,
 member_position smallint, status text
) language plpgsql stable security definer set search_path='' as $$
declare lesson_class uuid;
begin
 perform app_private.require_staff();
 select l.class_id into lesson_class from public.attendance_lessons l where l.id=p_lesson_id;
 if lesson_class is null then raise exception 'Aula não encontrada'; end if;
 return query
 select m.id,t.id,t.public_name,m.full_name,m.position,a.status
 from public.teams t
 join public.team_members m on m.team_id=t.id
 left join public.attendance_marks a on a.lesson_id=p_lesson_id and a.member_id=m.id
 where t.class_id=lesson_class
 order by t.public_name,t.id,m.position;
end;
$$;

-- Salva lote atômico. "null" remove uma marcação incorreta;
-- ausência de marcação NUNCA é tratada como falta.
create function public.save_attendance_marks(p_lesson_id uuid,p_entries jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
 lesson_class uuid; entry jsonb; entry_id uuid; entry_status text;
 seen uuid[]:=array[]::uuid[]; affected integer:=0;
begin
 perform app_private.require_admin();
 select class_id into lesson_class from public.attendance_lessons
 where id=p_lesson_id for update;
 if lesson_class is null then raise exception 'Aula não encontrada'; end if;
 if p_entries is null or jsonb_typeof(p_entries)<>'array' then
  raise exception 'Envie a lista de presença em formato de array';
 end if;
 if jsonb_array_length(p_entries)>1000 then
  raise exception 'O lote excedeu 1000 alunos';
 end if;
 for entry in select value from jsonb_array_elements(p_entries)
 loop
  if jsonb_typeof(entry)<>'object' or not(entry ? 'member_id') then
   raise exception 'Registro de presença inválido';
  end if;
  entry_id := (entry->>'member_id')::uuid;
  entry_status := entry->>'status';
  if entry_id is null or entry_id=any(seen) then
   raise exception 'Identificador ausente ou duplicado na chamada';
  end if;
  seen:=array_append(seen,entry_id);
  perform 1 from public.team_members m
   join public.teams t on t.id=m.team_id
   where m.id=entry_id and t.class_id=lesson_class;
  if not found then raise exception 'Aluno não pertence à turma desta aula'; end if;
  if entry_status is null then
   delete from public.attendance_marks where lesson_id=p_lesson_id and member_id=entry_id;
  elsif entry_status in ('present','absent','justified') then
   insert into public.attendance_marks(lesson_id,member_id,status,marked_by)
   values(p_lesson_id,entry_id,entry_status,auth.uid())
   on conflict(lesson_id,member_id) do update
    set status=excluded.status, marked_by=excluded.marked_by, marked_at=now();
  else
   raise exception 'Estado de presença inválido';
  end if;
  affected:=affected+1;
 end loop;
 insert into public.audit_events(actor_id,action,target_id,details)
 values(auth.uid(),'attendance_marks_saved',p_lesson_id,
    jsonb_build_object('class_id',lesson_class,'rows_submitted',affected));
end;
$$;

-- Uma dupla que já tem presenças registradas não pode ser movida para
-- outra turma, nem excluída, pois isso destruiria o vínculo histórico.
create function app_private.prevent_attendance_transfer()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.class_id is distinct from old.class_id
  and exists(
   select 1 from public.attendance_marks am
   join public.team_members m on m.id=am.member_id
   where m.team_id=old.id
  ) then
  raise exception 'Transferência bloqueada: há presenças registradas nesta turma';
 end if;
 return new;
end;
$$;
create trigger prevent_attendance_transfer
 before update of class_id on public.teams
 for each row execute function app_private.prevent_attendance_transfer();

-- Alinha a habilitação dos botões do Gerenciar Duplas à proteção do banco.
create or replace function public.list_teams_admin(p_offset integer default 0,p_limit integer default 500)
returns table (
 id uuid, public_name text, class_id uuid, access_code text, status text,
 member1 text, member2 text, attempt_count bigint, ctf_event_count bigint,
 can_transfer boolean, can_delete boolean
) language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_staff();
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then
  raise exception 'Paginação inválida';
 end if;
 return query
 select t.id,t.public_name,t.class_id,t.access_code,t.status,
   (select m.full_name from public.team_members m where m.team_id=t.id and m.position=1),
   (select m.full_name from public.team_members m where m.team_id=t.id and m.position=2),
   (select count(*) from public.attempts a where a.team_id=t.id),
   (select count(*) from public.ctf_score_events e where e.team_id=t.id),
   not exists(select 1 from public.attempts a where a.team_id=t.id)
     and not exists(select 1 from public.ctf_score_events e where e.team_id=t.id)
     and not exists(select 1 from public.public_leaderboard r where r.team_id=t.id and (r.points<>0 or r.solved_count<>0))
     and not exists(select 1 from public.attendance_marks am join public.team_members m on m.id=am.member_id where m.team_id=t.id),
   not exists(select 1 from public.attempts a where a.team_id=t.id)
     and not exists(select 1 from public.ctf_score_events e where e.team_id=t.id)
     and not exists(select 1 from public.public_leaderboard r where r.team_id=t.id and (r.points<>0 or r.solved_count<>0))
     and not exists(select 1 from public.attendance_marks am join public.team_members m on m.id=am.member_id where m.team_id=t.id)
 from public.teams t
 order by t.public_name,t.id offset p_offset limit p_limit;
end;
$$;


revoke all on function public.create_attendance_lesson(uuid,text,date),
 public.list_attendance_lessons(uuid),
 public.list_attendance_roster(uuid),
 public.save_attendance_marks(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_attendance_lesson(uuid,text,date),
 public.list_attendance_lessons(uuid),
 public.list_attendance_roster(uuid),
 public.save_attendance_marks(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
