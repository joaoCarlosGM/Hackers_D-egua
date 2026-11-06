# Diagnóstico seguro — Chamada e equipe de teste Samba

Este procedimento é **somente leitura**. GitHub Pages publica o frontend, mas **não executa SQL no Supabase**.

## Chamada mostra PGRST202

O erro `Could not find the function public.list_attendance_lessons(p_class_id) in the schema cache` significa que o PostgREST não localizou a assinatura SQL que o site está chamando.

No Supabase Dashboard do **mesmo projeto conectado ao site**, abra SQL Editor e execute:

```sql
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in (
 'create_attendance_lesson','list_attendance_lessons',
 'list_attendance_roster','save_attendance_marks'
)
order by p.proname;
```

- Se não aparecerem as quatro funções, a migration `202611050004_attendance.sql` ainda não foi aplicada integralmente **nesse projeto**. Execute o arquivo completo uma única vez, após as migrations 001–007, em ambiente correto. Não reexecute as migrations anteriores.
- Se aparecerem as funções com as assinaturas corretas, execute:

```sql
notify pgrst, 'reload schema';
```

Recarregue a página depois. Se persistir, confirme a URL do projeto publicada nas GitHub Actions Variables e inspecione os logs do Supabase; não publique chaves secretas.

## Por que Samba não pode ser excluída?

Verifique **sem alterar dados** se existem registros e qual é o código da dupla (prefira o UUID como identificação):

```sql
select t.id, t.public_name, t.status, t.class_id,
 (select count(*) from public.attempts a where a.team_id=t.id) as avaliacoes,
 (select count(*) from public.ctf_score_events e where e.team_id=t.id) as eventos_ctf,
 (select coalesce(sum(r.points),0) from public.public_leaderboard r where r.team_id=t.id) as pontos_ranking,
 (select count(*) from public.team_members m where m.team_id=t.id) as integrantes
from public.teams t
where lower(btrim(t.public_name))='samba';
```

Quando a migration da Chamada existir, execute também:

```sql
select t.id, t.public_name, count(a.member_id) as marcacoes_presenca
from public.teams t
join public.team_members m on m.team_id=t.id
left join public.attendance_marks a on a.member_id=m.id
where lower(btrim(t.public_name))='samba'
group by t.id,t.public_name;
```

A tela `#admin/duplas` informa quando o botão está bloqueado. **Desativar** impede novos acessos e preserva notas, CTF e presenças. Se houver qualquer vínculo histórico, **não execute deletes diretos** em `team_members`, `attendance_marks`, `attempts` ou `ctf_score_events`: isso comprometeria auditoria e notas. Limpeza definitiva de dados de teste exige confirmação do UUID, inspeção completa dos vínculos e plano de backup/rollback, separado do fluxo normal da aplicação.

Se o cadastro não tiver nenhum vínculo e `can_delete = true`, use o botão **Excluir dupla** e digite `EXCLUIR <código da dupla>` para confirmar. O banco registra a operação em auditoria.
