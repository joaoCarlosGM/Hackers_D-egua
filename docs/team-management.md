# Gerenciamento de duplas — Hackers Pai D'égua

Implementado na página `#admin`, seção **Gerenciar duplas**. O banco de produção não é modificado pelo GitHub Pages.

## Recursos

- Professores autorizados: consultar, pesquisar e filtrar duplas e integrantes, inclusive de turmas arquivadas.
- Administradores: corrigir apelido público e os nomes dos dois integrantes, transferir entre turmas ativas antes da primeira avaliação ou pontuação CTF, desativar/reativar, emitir nova credencial e excluir exclusivamente cadastros sem histórico.
- O identificador UUID, o código de acesso, as credenciais permanentes, o histórico pedagógico e o ranking são preservados durante correções e desativações.
- Transferir preserva o UUID e a credencial, atualiza o rótulo público do ranking e revoga sessões temporárias. Transferência é proibida se houver tentativas, registros de pontuação CTF ou pontos não zerados.
- Desativar revoga sessões existentes e impede novos logins/participação por token. Reativar restabelece o acesso usando a credencial permanente original.
- A dupla desativada permanece no ranking histórico; notas e integrantes jamais são publicados.
- Excluir exige digitar `EXCLUIR <código>`. Havendo avaliações ou CTF, o botão fica bloqueado e o banco revalida os vínculos, evitando exclusão por requisição forjada ou concorrência.
- Apenas a equipe com papel `admin` consegue mutar registros pelas RPCs. As alterações ficam em `audit_events` sem incluir nomes pessoais dos participantes no campo `details`.

## Migration e publicação

Executar **somente** a nova migration após a `202611050001_class_management.sql`:

`supabase/migrations/202611050002_team_management.sql`

Ela adiciona `teams.status`, cria as RPCs `list_teams_admin`, `update_team`, `set_team_status` e `delete_team`, e reforça `login_team` e `app_private.team_for_token` para bloquear duplas inativas.

**A migration não foi executada no Supabase remoto pelo desenvolvimento deste PR.** Aplicar o arquivo inteiro e uma única vez no SQL Editor, em transação, ou usar a CLI vinculada após verificar as versões pendentes com `supabase db push --dry-run`. Não usar `db reset`, não reaplicar migrations antigas e nunca executar `supabase/tests/*.sql` no projeto remoto.

O frontend de gerenciamento precisa da nova migration. Antes de publicar a interface, confirme que as funções novas existem no Supabase real e que o usuário foi incluído previamente em `public.admin_users`.

## Testes de aceite

1. Entre no `#admin` como professor e confirme que a lista é visível, mas sem botões de mutação.
2. Entre como administrador e crie duas duplas de teste pelo fluxo normal do aluno. Confirme pesquisa por apelido, código e nome do integrante.
3. Corrija grafia dos integrantes e apelido; verifique que o UUID e as credenciais anteriores permanecem, e o ranking recebe o novo apelido.
4. Transfira uma dupla sem atividade/CTF de Poraquê para Pitiú. Confirme que a dupla reaparece nessa turma e que precisa entrar novamente com seu código e credencial.
5. Realize uma avaliação ou atribua pontos CTF. Confirme que transferir ou excluir essa dupla é bloqueado.
6. Desative uma dupla e verifique que tanto um login novo quanto uma sessão previamente válida são recusados; reative e confira o acesso.
7. Exclua uma dupla sem vínculos digitando a confirmação. Confirme ausência do registro e preservação do histórico das outras duplas.
8. Em um navegador anônimo e com um usuário Auth não autorizado, confirme a impossibilidade de consultar o relatório privado e chamar as mutações.
9. Confira `audit_events`, Realtime do ranking e resultados privados.
10. Execute o script isolado `npm run test:db`, `npm test`, `npm run lint`, `npm run typecheck` e `npm run build`.

## Limites desta versão

A correção de nomes é uma atualização administrativa do cadastro atual. Ela não cria uma versão histórica dos nomes antigos; a auditoria registra que houve mudança, mas não grava dados pessoais em detalhes. A transferência de equipes com histórico pedagógico não é permitida, pois a turma de uma participação passada precisa continuar consistente.
