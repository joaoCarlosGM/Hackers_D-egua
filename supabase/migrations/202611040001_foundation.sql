-- Application tables. Run in order on the EXISTING Supabase project.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.classes (
 id uuid primary key default gen_random_uuid(), name text not null,
 slug text not null unique check (slug in ('poraque','pitiu')),
 created_at timestamptz not null default now()
);
insert into public.classes(name,slug) values ('Poraquê','poraque'),('Pitiú','pitiu')
on conflict(slug) do update set name=excluded.name;

create table public.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','teacher')), created_at timestamptz not null default now()
);
create table public.teams (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id),
 public_name text not null check (length(btrim(public_name)) between 2 and 80),
 access_code text not null unique default upper(encode(extensions.gen_random_bytes(8),'hex')),
 credential_hash text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index teams_class_name_unique on public.teams(class_id,lower(btrim(public_name)));
create index teams_class_idx on public.teams(class_id);
create table public.team_members (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 position smallint not null check(position in (1,2)), full_name text not null check(length(btrim(full_name)) between 3 and 160),
 created_at timestamptz not null default now(), unique(team_id,position)
);
create table public.activities (
 id uuid primary key default gen_random_uuid(), title text not null check(length(btrim(title)) between 3 and 160),
 description text not null default '' check(length(description)<=5000), locked_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.questions (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
 prompt text not null check(length(btrim(prompt)) between 1 and 3000),
 kind text not null check(kind in ('multiple_choice','true_false')),
 points integer not null check(points between 0 and 10000), position integer not null check(position>0),
 created_at timestamptz not null default now(), unique(activity_id,position)
);
create table public.question_options (
 id uuid primary key default gen_random_uuid(), question_id uuid not null references public.questions(id) on delete cascade,
 label text not null check(length(btrim(label)) between 1 and 1000), is_correct boolean not null default false,
 position integer not null check(position between 1 and 8), created_at timestamptz not null default now(), unique(question_id,position)
);
create unique index question_one_correct on public.question_options(question_id) where is_correct;
create table public.activity_sessions (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id),
 class_ids uuid[] not null check(cardinality(class_ids) between 1 and 2),
 published boolean not null default false, ctf_enabled boolean not null default false,
 opens_at timestamptz not null default now(), closes_at timestamptz,
 created_at timestamptz not null default now(), check(closes_at is null or closes_at>opens_at)
);
create index sessions_activity_idx on public.activity_sessions(activity_id);
create table public.attempts (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 activity_session_id uuid not null references public.activity_sessions(id), submission_no integer not null default 1 check(submission_no>0),
 retry_available boolean not null default false, created_at timestamptz not null default now(), submitted_at timestamptz,
 unique(team_id,activity_session_id,submission_no)
);
create index attempts_session_idx on public.attempts(activity_session_id);
create table public.answers (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null references public.attempts(id),
 question_id uuid not null references public.questions(id), option_id uuid not null references public.question_options(id),
 created_at timestamptz not null default now(), unique(attempt_id,question_id)
);
create table public.grades (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null unique references public.attempts(id),
 points integer not null check(points>=0), max_points integer not null check(max_points>=points),
 graded_by uuid references auth.users(id), feedback text not null default '' check(length(feedback)<=5000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ctf_score_events (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 question_id uuid references public.questions(id), attempt_id uuid references public.attempts(id),
 points integer not null check(points between -100000 and 100000), solved_delta integer not null default 0 check(solved_delta in (-1,0,1)),
 reason text not null check(length(btrim(reason)) between 1 and 500), created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index ctf_first_solve on public.ctf_score_events(team_id,question_id) where question_id is not null;
create index ctf_team_idx on public.ctf_score_events(team_id);
-- Deliberately denormalized: Realtime exposes only these sanitized columns.
create table public.public_leaderboard (
 team_id uuid primary key references public.teams(id), class_id uuid not null references public.classes(id),
 public_name text not null, points bigint not null default 0, solved_count bigint not null default 0,
 updated_at timestamptz not null default now()
);
create index leaderboard_order_idx on public.public_leaderboard(points desc,solved_count desc);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id),
 action text not null, target_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_created_idx on public.audit_events(created_at desc);
create table app_private.team_sessions (
 token_hash text primary key, team_id uuid not null references public.teams(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days', created_at timestamptz not null default now()
);
create index team_sessions_team_idx on app_private.team_sessions(team_id);
create table app_private.rate_buckets (
 key text primary key, window_start timestamptz not null default now(), hits integer not null default 1
);

create function app_private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_users where user_id=auth.uid());
$$;
create function app_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_users where user_id=auth.uid() and role='admin');
$$;
create function app_private.require_staff() returns void language plpgsql security definer set search_path='' as $$
begin if not app_private.is_staff() then raise exception 'Acesso administrativo não autorizado' using errcode='42501'; end if; end;
$$;
create function app_private.require_admin() returns void language plpgsql security definer set search_path='' as $$
begin if not app_private.is_admin() then raise exception 'Apenas administradores' using errcode='42501'; end if; end;
$$;
create function app_private.allow_request(p_key text,p_limit int,p_seconds int) returns boolean
language plpgsql security definer set search_path='' as $$
declare n int;
begin
 insert into app_private.rate_buckets as b(key) values(p_key)
 on conflict(key) do update set
 hits=case when b.window_start<=now()-make_interval(secs=>p_seconds) then 1 else b.hits+1 end,
 window_start=case when b.window_start<=now()-make_interval(secs=>p_seconds) then now() else b.window_start end returning hits into n;
 return n<=p_limit;
end;
$$;
create function app_private.team_for_token(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if p_token is null or length(p_token)<>64 then raise exception 'Sessão inválida ou expirada' using errcode='28000'; end if;
 select team_id into t from app_private.team_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now();
 if t is null then raise exception 'Sessão inválida ou expirada' using errcode='28000'; end if;
 -- Serialize against rotation and concurrent participation/submission.
 perform 1 from public.teams where id=t for update;
 -- Rotation may have revoked the session while this transaction waited.
 if not exists(select 1 from app_private.team_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now()) then
 raise exception 'Sessão revogada' using errcode='28000'; end if;
 return t;
end;
$$;
create function app_private.new_session(p_team uuid) returns text language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex');
begin
 delete from app_private.team_sessions where team_id=p_team and expires_at<=now();
 -- Bound active sessions without depending on a cleanup job.
 delete from app_private.team_sessions where token_hash in (select token_hash from app_private.team_sessions where team_id=p_team order by created_at desc offset 9);
 insert into app_private.team_sessions(token_hash,team_id) values(encode(extensions.digest(token,'sha256'),'hex'),p_team);
 return token;
end;
$$;
create function app_private.initialize_rank() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.public_leaderboard(team_id,class_id,public_name) values(new.id,new.class_id,new.public_name); return new; end;
$$;
create trigger team_initial_rank after insert on public.teams for each row execute function app_private.initialize_rank();
create function app_private.update_rank() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.public_leaderboard set points=points+new.points,solved_count=solved_count+new.solved_delta,updated_at=now() where team_id=new.team_id;
 return new;
end;
$$;
create trigger ctf_rank after insert on public.ctf_score_events for each row execute function app_private.update_rank();

-- No direct client mutations, including staff. All writes use checked RPCs.
do $$ declare t text; begin
 foreach t in array array['classes','admin_users','teams','team_members','activities','questions','question_options','activity_sessions','attempts','answers','grades','ctf_score_events','public_leaderboard','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy staff_read on public.%I for select to authenticated using ((select app_private.is_staff()))',t);
 end loop;
end $$;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_staff() to authenticated;
create policy public_classes on public.classes for select to anon,authenticated using(true);
create policy public_rank on public.public_leaderboard for select to anon,authenticated using(true);
grant select on public.classes,public.public_leaderboard to anon;
-- Internal helpers must never be callable as RPCs. Only policy helper is granted.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.is_staff() to authenticated;
-- Private schema tables are defense in depth, never exposed via PostgREST.
alter table app_private.team_sessions enable row level security;
alter table app_private.rate_buckets enable row level security;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
 select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='public_leaderboard') then
 alter publication supabase_realtime add table public.public_leaderboard;
 end if;
end $$;
