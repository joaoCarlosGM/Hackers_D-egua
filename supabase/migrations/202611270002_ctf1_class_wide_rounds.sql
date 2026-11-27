-- CTF1: enforce one isolated class-wide round. Existing rounds remain intact.
-- Test rounds can be recreated any number of times, one hour per start.
begin;
create or replace function public.ctf1_staff_create_round(p_class_ids uuid[],p_title text default 'CTF 1 — Aula 7',p_mode text default 'test',p_team_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; n integer;
begin
 perform app_private.require_staff();
 if p_mode <> 'test' then raise exception 'Modo oficial bloqueado ate homologacao de isolamento da VM';end if;
 if p_class_ids is null or cardinality(p_class_ids)<>1 or
    (select count(*) from public.classes where id=p_class_ids[1])<>1
 then raise exception 'Selecione exatamente uma turma por rodada' using errcode='22023';end if;
 if p_team_ids is not null then
  raise exception 'Rodada por turma inscreve automaticamente todas as duplas ativas' using errcode='22023';
 end if;
 if char_length(btrim(coalesce(p_title,''))) not between 5 and 100 then
   raise exception 'Título inválido' using errcode='22023';end if;
 insert into public.ctf1_official_rounds(class_ids,title,created_by,mode)
 values(p_class_ids,btrim(p_title),auth.uid(),p_mode) returning id into rid;
 insert into app_private.ctf1_official_secrets(round_id,secret)
 values(rid,extensions.gen_random_bytes(32));
 insert into public.ctf1_official_participations(round_id,team_id)
 select rid,t.id from public.teams t
 where t.class_id=p_class_ids[1] and t.status='active';
 get diagnostics n=row_count;
 if n=0 then raise exception 'Nenhuma dupla ativa selecionada' using errcode='22023';end if;
 return rid;
end $$;

notify pgrst,'reload schema';
commit;
