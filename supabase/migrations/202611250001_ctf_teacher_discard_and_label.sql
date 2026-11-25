-- Auditoria do terminal do professor: descarte privado e independente do CTF oficial.
-- Nenhuma mudança em ctf_score_events, grades, ranking ou pontuação.
alter table public.ctf_review_teacher_runs
 alter column title set default 'Terminal do professor — Revisão Pré-CTF';
update public.ctf_review_teacher_runs
set title = 'Terminal do professor — Revisão Pré-CTF'
where title in ('Revisão Pré-CTF — demonstração','Revisão Pré-CTF');

create or replace function public.ctf_teacher_review_discard(p_run uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
 if not public.ctf_teacher_review_authorized() then
  raise exception 'Professor não autorizado' using errcode='42501';
 end if;
 if p_run is null or not exists (
  select 1 from public.ctf_review_teacher_runs r
  where r.id=p_run and r.teacher_id=auth.uid()
 ) then
  raise exception 'Demonstração não encontrada ou sem permissão' using errcode='42501';
 end if;
 -- Exclusão transacional APENAS dos eventos da demonstração do próprio professor.
 delete from public.ctf_review_teacher_events e where e.run_id=p_run;
 delete from public.ctf_review_teacher_runs r
 where r.id=p_run and r.teacher_id=auth.uid();
 if not found then
  raise exception 'Demonstração não encontrada' using errcode='42501';
 end if;
end;
$$;
revoke all on function public.ctf_teacher_review_discard(uuid) from public,anon,authenticated;
grant execute on function public.ctf_teacher_review_discard(uuid) to authenticated;
notify pgrst,'reload schema';
