set role anon;
do $$ declare previous jsonb; recovered jsonb; begin
 select registration into previous from test_persistence.state;
 recovered:=public.login_team(previous->>'access_code',previous->>'credential');
 if recovered->>'team_id' is distinct from previous->>'team_id' then raise exception 'Recovery changed permanent identity after database restart'; end if;
 if not exists(select 1 from public.public_leaderboard where team_id=(recovered->>'team_id')::uuid and points=0 and solved_count=0) then raise exception 'Ranking did not persist'; end if;
 raise notice 'PASS: committed team, ranking and hashed credential survive PostgreSQL restart and a new connection';
end $$;
reset role;
do $$ begin
 if (select count(*) from public.team_members)<>2 then raise exception 'Members did not persist'; end if;
 raise notice 'PASS: exactly two committed members survive database restart';
end $$;
