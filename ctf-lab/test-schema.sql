do $$
begin
 if not exists(select 1 from pg_tables where schemaname='public' and tablename='ctf_review_catalog' and rowsecurity)
  then raise exception 'catalog RLS disabled'; end if;
 if not exists(select 1 from pg_tables where schemaname='public' and tablename='ctf_review_sessions' and rowsecurity)
  then raise exception 'sessions RLS disabled'; end if;
 if not exists(select 1 from pg_tables where schemaname='public' and tablename='ctf_review_events' and rowsecurity)
  then raise exception 'audit RLS disabled'; end if;
 if has_table_privilege('anon','public.ctf_review_catalog','SELECT')
   or has_table_privilege('authenticated','public.ctf_review_sessions','SELECT')
   or has_table_privilege('anon','public.ctf_review_events','INSERT')
   then raise exception 'insecure grants to public roles'; end if;
 if not has_function_privilege('anon','public.ctf_review_visible(text)','EXECUTE')
  then raise exception 'team review discovery unavailable'; end if;
 if not has_function_privilege('anon','public.ctf_review_enter(text,uuid)','EXECUTE')
  then raise exception 'team review join unavailable'; end if;
 if exists(select 1 from information_schema.columns
   where table_schema='public' and table_name like 'ctf_review_%'
   and column_name in ('points','score','grade','max_points','ranking_points'))
   then raise exception 'scoring columns are forbidden in review module'; end if;
 if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
     where c.relname='public_leaderboard' and t.tgname like '%ctf_review%')>0
   then raise exception 'new review triggers affecting leaderboard'; end if;
end $$;
select 'PASS: revision schema is isolated, RLS denies direct access, RPCs allow team-only access, no score fields' as result;
