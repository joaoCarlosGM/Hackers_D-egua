-- Migration 011 — Prevent students from reading answer keys via browser requests.
-- Additive and safe for existing grades, attempts, attendance and rankings.
-- Apply after 202611050006_weighted_rank.sql.
-- The frontend cannot conceal a response that the server mistakenly exposes.

-- Locked-down tables: teacher/admin reads remain available through the existing
-- authenticated staff policy. Anonymous users get no direct SELECT on any key.
do $$
declare tab text;
begin
  foreach tab in array array[
    'activities','questions','question_options','activity_sessions',
    'attempts','answers','grades'
  ] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public, anon',tab);
    execute format('revoke all on public.%I from authenticated',tab);
    execute format('grant select on public.%I to authenticated',tab);
    execute format('drop policy if exists staff_read on public.%I',tab);
    execute format(
      'create policy staff_read on public.%I for select to authenticated using ((select app_private.is_staff()))',
      tab
    );
  end loop;
end $$;

-- A public session endpoint is intentionally callable by visitors, but it
-- returns ONLY identifiers/text for questions and options, never is_correct,
-- explanation, grades, feedback, or the answer key. Scores are computed in SQL.
create or replace function public.public_activity(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.activity_sessions; a public.activities;
begin
  select * into s from public.activity_sessions
   where id=p_session_id and status='open' and published
     and opens_at<=now() and (closes_at is null or closes_at>now());
  if s.id is null then
    return jsonb_build_object('error','Atividade indisponível ou encerrada.');
  end if;
  select * into a from public.activities where id=s.activity_id;
  return jsonb_build_object(
    'id',s.id, 'title',a.title, 'description',a.description,
    'class_ids',s.class_ids, 'access_code',s.access_code,
    'closes_at',s.closes_at,'time_limit_seconds',s.time_limit_seconds,
    'allow_backtracking',s.allow_backtracking,
    'questions',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',q.id, 'prompt',q.prompt, 'kind',q.kind, 'points',q.points,
          'options',coalesce((
            select jsonb_agg(
              jsonb_build_object('id',o.id,'label',o.label) order by o.position
            ) from public.question_options o where o.question_id=q.id
          ),'[]'::jsonb)
        ) order by q.position
      ) from public.questions q where q.activity_id=a.id
    ),'[]'::jsonb)
  );
end;
$$;

-- The private results RPC is staff-only even when called with a guessed UUID.
revoke all on function public.assessment_results(uuid) from public, anon, authenticated;
grant execute on function public.assessment_results(uuid) to authenticated;
revoke all on function public.public_activity(uuid) from public, anon, authenticated;
grant execute on function public.public_activity(uuid) to anon, authenticated;

notify pgrst,'reload schema';
