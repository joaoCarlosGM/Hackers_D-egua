-- Admin-only, read-only activity projection. Does not update the round,
-- student session, timer, student flags, write-ups or rankings.
begin;
create or replace function public.ctf1_staff_dashboard(p_round uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $monitor$
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
  -- Read previously persisted telemetry, including ongoing sessions opened
  -- before this migration. This proves receipt of commands, not VM liveness.
  'first_activity_at',(
    select min(a.at) from public.ctf1_official_audit a
    where a.round_id=r.id and a.team_id=t.id
      and a.kind in ('terminal_event','flag_attempt','writeup_saved')),
  'last_activity_at',(
    select max(a.at) from public.ctf1_official_audit a
    where a.round_id=r.id and a.team_id=t.id
      and a.kind in ('terminal_event','flag_attempt','writeup_saved')),
  'mission_opened_at',(
    select min(a.at) from public.ctf1_official_audit a
    where a.round_id=r.id and a.team_id=t.id and a.kind='terminal_event'
      and lower(btrim(a.detail->>'command')) ~ '^cat[[:space:]]+(\\./)?missao[.]txt([[:space:]]|$)'),
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
  'duration_seconds',r.duration_seconds),'teams',teams);
end $monitor$;
revoke all on function public.ctf1_staff_dashboard(uuid) from public,anon,authenticated;
grant execute on function public.ctf1_staff_dashboard(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
