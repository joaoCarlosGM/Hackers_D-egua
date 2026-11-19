-- Plano curricular: 6 atividades no Módulo 1, 5 no Módulo 2 e 5 no Módulo 3.
-- Executar APÓS 202611190001 e 202611190002.
-- Não altera notas, tentativas nem resultados CTF.
begin;

-- Abortamos antes de migrar caso o banco já tenha mais de seis atividades
-- regulares originais (revisões não ocupam vaga no currículo).
do $
declare existing_regular integer;
begin
 select count(*) into existing_regular
 from public.activity_sessions s join public.activities a on a.id=s.activity_id
 where not s.is_recovery and a.revision_of is null and s.module_number is null;
 if existing_regular > 6 then
   raise exception 'Há % atividades originais sem módulo, mas o Módulo 1 aceita apenas 6. Classifique manualmente as exceções antes de aplicar.',existing_regular;
 end if;
end $;

-- As atividades existentes pertencem ao Módulo 1, conforme definição da coordenação.
-- Revisões arquivadas permanecem identificadas no Módulo 1, mas não ocupam
-- vagas das 16 atividades regulares oficiais.
update public.activity_sessions
set module_number=1
where module_number is null and not is_recovery;

create function app_private.enforce_module_activity_capacity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  max_regular integer;
  regular_total integer;
  is_revision boolean;
begin
  if new.is_recovery then
    if new.module_number is null then raise exception 'Informe o módulo da recuperação'; end if;
    return new;
  end if;
  if new.module_number is null then return new; end if;

  select (a.revision_of is not null) into is_revision
  from public.activities a where a.id=new.activity_id;
  if coalesce(is_revision,false) then return new; end if;

  -- Serialized counting prevents concurrent registrations exceeding the limit.
  perform pg_advisory_xact_lock(614140, new.module_number::integer);
  max_regular:=case new.module_number when 1 then 6 else 5 end;

  select count(*) into regular_total
  from public.activity_sessions s
  join public.activities a on a.id=s.activity_id
  where s.module_number=new.module_number and not s.is_recovery
    and a.revision_of is null and s.id<>new.id;

  if regular_total >= max_regular then
    raise exception 'Módulo % já possui o limite de % atividades regulares',new.module_number,max_regular;
  end if;
  return new;
end $$;

create trigger enforce_regular_module_capacity
before insert or update of module_number,is_recovery on public.activity_sessions
for each row execute function app_private.enforce_module_activity_capacity();

-- Informações para inspeção administrativa após a implantação.
-- Nenhuma sessão ganha pontuação extra por receber módulo.
revoke all on function app_private.enforce_module_activity_capacity()
from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
