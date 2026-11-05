# Gerenciamento de turmas

A seção **Gerenciar turmas**, no painel `#admin`, lista turmas ativas e arquivadas com quantidade de duplas, participações e atividades. Não há exclusão automática, limpeza de turmas arquivadas ou alteração de notas durante arquivamento.

## Papéis e operações

- Contas Supabase Auth sem uma linha em `admin_users` não podem consultar contagens administrativas nem executar operações.
- Professores (`teacher`) podem consultar contagens e dados históricos, inclusive de turmas arquivadas.
- Administradores (`admin`) podem criar, renomear, arquivar, reativar e excluir turmas elegíveis. Cada RPC verifica o papel no servidor; esconder botões não é a autorização.
- O nome pode mudar. UUID e slug são estáveis. Novos slugs aceitam letras minúsculas sem acento, números e hífens; são únicos. A interface sugere o slug, e o servidor valida independentemente.

## Arquivamento e histórico

Arquivar muda somente `classes.status` e `updated_at`, e registra auditoria. Nenhuma dupla, integrante, participação, resposta, nota, credencial ou pontuação CTF é apagada ou alterada. A turma desaparece das opções de **novo cadastro**, mas uma chamada forjada à RPC também é bloqueada no banco. Um trigger adicional protege inserções privilegiadas diretas.

Duplas já cadastradas continuam entrando com o código e a credencial original, consultando seu histórico e participando das atividades a que já têm acesso, conforme o estado e prazo da sessão. Arquivar uma turma não encerra automaticamente suas atividades nem revoga sessões. Reativar permite novos cadastros novamente, com o mesmo UUID da turma.

**Consultar dados** seleciona a turma nos filtros do painel, inclusive se arquivada, para consultar integrantes, entregas e notas. A exportação CSV respeita o filtro selecionado. Metadados de turma (nome, slug e estado) continuam públicos para os rótulos do ranking histórico; integrantes, notas, respostas e contagens administrativas mantêm a autorização existente.

Ao criar uma nova atividade, o seletor oferece turmas ativas. Um rascunho que já esteja vinculado a uma turma arquivada conserva a associação, para não remover vínculos históricos silenciosamente. O limite anterior de até duas turmas por sessão de atividade permanece; o total de turmas cadastradas na plataforma deixa de ser limitado a Poraquê/Pitiú.

## Exclusão definitiva

A interface exige digitar **`EXCLUIR <slug>`** e clicar em **Excluir definitivamente**. Cancelar não envia a operação. A RPC exige a mesma confirmação e revalida todos os vínculos na hora da exclusão, mesmo que a tela tenha mostrado a turma como elegível antes.

Só uma turma sem duplas, participações, atividades de qualquer estado (incluindo rascunhos/arquivadas) ou registros de ranking pode ser excluída. Não se usa `CASCADE`. O UUID e os metadados públicos da turma excluída continuam em `audit_events`. Se houver vínculos, a orientação é arquivar.

O banco serializa cadastro/arquivamento/exclusão com locks da turma. Associações de atividades usam UUIDs em array, portanto o trigger de integridade também bloqueia a turma referenciada, evitando exclusão concorrente que deixaria um UUID sem correspondente.

## Migration aditiva e aplicação

Nova migration: **`supabase/migrations/202611050001_class_management.sql`**.

Ela adiciona `status` (`active`/`archived`) e `updated_at`, remove apenas a restrição antiga de dois slugs, valida o formato dos novos slugs e cria as RPCs/guards. Poraquê/Pitiú são preservadas com seus UUIDs, nomes atuais e estado inicialmente ativo. Não há replay do seed nem criação de turmas fictícias.

As migrations `202611040001` até `202611040004` permanecem sem alteração. **Em um projeto que já tem a fundação e as avaliações, aplique somente a nova migration.** Não reaplique scripts antigos, pois os seeds antigos poderiam sobrescrever nomes editados administrativamente.

Depois da revisão do PR, o responsável pode executar o arquivo novo inteiro no SQL Editor do projeto Supabase existente, dentro de uma transação (`BEGIN;` / `COMMIT;`), ou usar a CLI já vinculada:

```bash
supabase migration list
supabase db push --dry-run
# Confirmar que somente 202611050001 está pendente neste upgrade.
supabase db push
```

Se já foi aplicada pelo SQL Editor, registre somente essa versão confirmada no histórico da CLI:

```bash
supabase migration repair --status applied 202611050001
```

Não execute reset nem testes no remoto. O frontend novo requer a migration; aplique-a após revisão e antes do deploy da interface. O workflow GitHub Pages publica apenas o frontend e não aplica SQL automaticamente.

## RPCs e auditoria

- `list_classes_admin(p_offset,p_limit)` — consulta paginada das turmas e contagens para equipe explicitamente autorizada. O painel carrega todas as páginas de até 500 registros, evitando truncamento no limite padrão da Data API.
- `create_class(p_name,p_slug)` — criação; evento `create_class`.
- `rename_class(p_class_id,p_name)` — nome, sem mudança do UUID/slug; evento `rename_class`.
- `set_class_status(p_class_id,p_status)` — `archive_class` ou `reactivate_class`; repetir o mesmo estado não gera operação duplicada.
- `delete_class(p_class_id,p_confirmation)` — exclusão de turma vazia confirmada; evento `delete_class`.
- `register_team(...)` — mantém o contrato anterior, com verificação de turma ativa antes de gerar credenciais e gravar a dupla atomicamente. A implementação anterior fica interna e sem EXECUTE público.

Todas as RPCs usam `SECURITY DEFINER`, `search_path` vazio, objetos qualificados e grants explícitos. A auditoria identifica o administrador e a turma sem gravar credenciais ou nomes completos de alunos.

## Testes

`npm run test:db` usa exclusivamente um PostgreSQL descartável local, prepara a base isolada e testa a migration nova, bloqueios de acesso, confirmação, vínculos em array, preservação de histórico e concorrência entre conexões. Não aceita URL de banco remoto.

Os testes React cobrem CRUD, consulta de arquivadas, confirmação/cancelamento, erro por vínculos recentes, permissões da interface e seleção de turmas ativas. O Playwright verifica a identidade visual e a confirmação de exclusão em desktop e celular, com requisições isoladas em fixtures. Nenhuma migration ou operação de exclusão foi executada no projeto hospedado durante o desenvolvimento.
