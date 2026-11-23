-- Revisão Pré-CTF, SEM PONTUAÇÃO. Objetos exclusivos, sem triggers no ranking.
-- Não executar testes nem scripts de reset no Supabase remoto.
create table if not exists public.ctf_review_catalog (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(btrim(title)) between 3 and 160),
 description text not null default '' check (char_length(description)<=5000),
 duration_seconds integer not null default 3600 check(duration_seconds between 300 and 7200),
 class_ids uuid[] not null check(cardinality(class_ids) between 1 and 20),
 challenges jsonb not null check(jsonb_typeof(challenges)='array' and jsonb_array_length(challenges)=4),
 status text not null default 'draft' check(status in ('draft','published','running','paused','closed','archived')),
 started_at timestamptz,
 deadline_at timestamptz,
 paused_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 constraint ctf_review_paired_start check (
   (status in ('draft','published') and started_at is null)
   or (status in ('running','paused','closed','archived'))
 )
);
create index if not exists ctf_review_catalog_status_idx on public.ctf_review_catalog(status,created_at desc);

create table if not exists public.ctf_review_sessions (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references public.ctf_review_catalog(id) on delete restrict,
 team_id uuid references public.teams(id) on delete restrict,
 staff_id uuid references auth.users(id) on delete set null,
 team_name text not null check (char_length(team_name) between 2 and 160),
 started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 solved_ids smallint[] not null default '{}'::smallint[],
 writeups jsonb not null default '{}'::jsonb check(jsonb_typeof(writeups)='object'),
 updated_at timestamptz not null default clock_timestamp(),
 constraint ctf_review_participant check (num_nonnulls(team_id,staff_id)=1),
 constraint ctf_review_solved_len check (cardinality(solved_ids)<=4)
);
create unique index if not exists ctf_review_team_once on public.ctf_review_sessions(review_id,team_id) where team_id is not null;
create unique index if not exists ctf_review_staff_once on public.ctf_review_sessions(review_id,staff_id) where staff_id is not null;
create index if not exists ctf_review_sessions_review_idx on public.ctf_review_sessions(review_id,updated_at desc);

create table if not exists public.ctf_review_events (
 id bigint generated always as identity primary key,
 session_id uuid not null references public.ctf_review_sessions(id) on delete restrict,
 occurred_at timestamptz not null default clock_timestamp(),
 event_type text not null check(char_length(event_type) between 2 and 60),
 payload jsonb not null default '{}'::jsonb check (pg_column_size(payload)<=25000)
);
create index if not exists ctf_review_events_replay on public.ctf_review_events(session_id,id);

alter table public.ctf_review_catalog enable row level security;
alter table public.ctf_review_sessions enable row level security;
alter table public.ctf_review_events enable row level security;
revoke all on public.ctf_review_catalog,public.ctf_review_sessions,public.ctf_review_events from public,anon,authenticated;
do $do$
begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant select,insert,update,delete on public.ctf_review_catalog,public.ctf_review_sessions,public.ctf_review_events to service_role;
  grant usage,select on sequence public.ctf_review_events_id_seq to service_role;
 end if;
end
$do$;

-- Alunos veem somente revisões destinadas à turma da própria sessão ativa.
create or replace function public.ctf_review_visible(p_team_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 tid uuid:=app_private.team_for_token(p_team_token);
 cid uuid;
begin
 select class_id into cid from public.teams where id=tid and status='active';
 if cid is null then raise exception 'Dupla desativada' using errcode='42501'; end if;
 return coalesce(
  (select jsonb_agg(
   jsonb_build_object('id',r.id,'title',r.title,'description',r.description,
   'duration_seconds',r.duration_seconds,'status',r.status,
   'started_at',r.started_at,'deadline_at',r.deadline_at,'paused_at',r.paused_at,
   'challenges',r.challenges) order by r.created_at desc)
   from public.ctf_review_catalog r
   where r.status in ('published','running','paused') and cid=any(r.class_ids)),
   '[]'::jsonb
 );
end;
$$;
revoke all on function public.ctf_review_visible(text) from public,anon,authenticated;
grant execute on function public.ctf_review_visible(text) to anon,authenticated;

-- Join idempotente por dupla: o professor não escolhe o team_id do aluno.
create or replace function public.ctf_review_enter(p_team_token text,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 tid uuid:=app_private.team_for_token(p_team_token);
 teamrow public.teams;
 reviewrow public.ctf_review_catalog;
 sid uuid;
begin
 select * into teamrow from public.teams where id=tid and status='active';
 if not found then raise exception 'Dupla inativa' using errcode='42501'; end if;
 select * into reviewrow from public.ctf_review_catalog where id=p_review_id for update;
 if not found or reviewrow.status<>'running' or reviewrow.deadline_at<=clock_timestamp()
    or not teamrow.class_id=any(reviewrow.class_ids) then
    raise exception 'Revisão indisponível para sua turma' using errcode='42501';
 end if;
 select id into sid from public.ctf_review_sessions
 where review_id=p_review_id and team_id=tid;
 if sid is null then
   insert into public.ctf_review_sessions(review_id,team_id,team_name)
   values(p_review_id,tid,teamrow.public_name) returning id into sid;
 end if;
 return jsonb_build_object('session_id',sid,'team_id',tid,'team_name',teamrow.public_name,
   'review_id',p_review_id);
end;
$$;
revoke all on function public.ctf_review_enter(text,uuid) from public,anon,authenticated;
grant execute on function public.ctf_review_enter(text,uuid) to anon,authenticated;

comment on table public.ctf_review_catalog is 'Catálogo de revisão pré-CTF: nenhuma pontuação, nenhuma referência a ranking.';
comment on table public.ctf_review_sessions is 'Progresso e write-ups formativos por dupla, separados das avaliações oficiais.';
comment on table public.ctf_review_events is 'Eventos técnicos da execução isolada para auditoria, sem nota.';
notify pgrst,'reload schema';
