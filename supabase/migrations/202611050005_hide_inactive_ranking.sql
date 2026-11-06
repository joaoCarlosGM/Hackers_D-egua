-- Migration 009: ocultar duplas inativas do ranking público preservando pontos e histórico.
-- Requer a migration 008 (202611050004_attendance.sql).
-- A operação Desativar/Reativar já é protegida pela RPC set_team_status; esta
-- migração aplica a visibilidade no servidor, não apenas no navegador.

-- Uma coluna pública sanitizada controla a visibilidade sem expor contas,
-- notas ou informações pessoais da dupla.
alter table public.public_leaderboard
 add column is_visible boolean not null default true;

-- Corrige equipes que já estavam desativadas antes da implantação.
update public.public_leaderboard r
set is_visible = (t.status = 'active')
from public.teams t
where t.id = r.team_id
  and r.is_visible is distinct from (t.status = 'active');

-- Substitui somente a política pública: anon jamais recebe linhas ocultas.
-- A política staff_read existente continua permitindo inspeção interna.
drop policy if exists public_rank on public.public_leaderboard;
create policy public_rank on public.public_leaderboard
 for select to anon,authenticated using(is_visible);

-- Canal de atualização sem nome, ID de equipe, pontos ou informações pessoais.
-- Uma única linha evita acumular eventos e permite atualizar o ranking público
-- quando uma equipe inativa deixa de gerar updates visíveis em Realtime.
create table public.ranking_refresh (
 id smallint primary key default 1 check (id = 1),
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.ranking_refresh(id) values (1);

alter table public.ranking_refresh enable row level security;
revoke all on public.ranking_refresh from public,anon,authenticated;
grant select on public.ranking_refresh to anon,authenticated;
create policy public_ranking_refresh on public.ranking_refresh
 for select to anon,authenticated using(true);

create function app_private.sync_ranking_visibility()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
  update public.public_leaderboard
     set is_visible = (new.status = 'active'),
         updated_at = clock_timestamp()
   where team_id = new.id;

  update public.ranking_refresh
     set revision = revision + 1,
         updated_at = clock_timestamp()
   where id = 1;
 end if;
 return new;
end;
$$;

create trigger teams_ranking_visibility
 after update of status on public.teams
 for each row execute function app_private.sync_ranking_visibility();

-- O Realtime existente já acompanha public_leaderboard. O evento público
-- auxiliar notifica inclusive quando a equipe some por causa da RLS.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
  and not exists(
   select 1 from pg_publication_tables
   where pubname='supabase_realtime'
    and schemaname='public' and tablename='ranking_refresh') then
  alter publication supabase_realtime add table public.ranking_refresh;
 end if;
end $$;

notify pgrst, 'reload schema';
