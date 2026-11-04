# Hackers Pai D'égua

Cadastro permanente de duplas, atividades pedagógicas e ranking CTF. React + TypeScript no **GitHub Pages**, PostgreSQL/RPC + Supabase Auth + Realtime no **projeto Supabase Cloud já existente**. Não há servidor Node em produção nem chave secreta no frontend.

O repositório original continha apenas o título e a licença: esta interface usa um tema inicial azul escuro, verde e dourado, com pódio, medalhas e tabela. Não havia arte, paleta oficial ou layout aprovado disponíveis para reproduzir. Substitua os tokens de `src/style.css` quando essas referências forem fornecidas.

## Desenvolvimento

Requer Node 24 e npm. Docker é necessário apenas para os testes SQL locais.

```bash
cd /workspace/Hackers_D-egua
npm ci
cp .env.example .env
# Preencha somente a URL e a publishable key do projeto existente.
npm run dev
```

O caminho base é `/Hackers_D-egua/`. Rotas usam hash (`#ranking`, `#admin`, `#atividade/UUID`), inclusive nos QR Codes, para não depender de reescrita de URLs no Pages. Não coloque `service_role`, secret key, senha do banco nem credenciais dos alunos em variáveis `VITE_*`.

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm run test:pages
npm run preview
```

`test:db` cria e remove exclusivamente um container PostgreSQL 17 descartável, sem portas públicas, sem URL remota. Simula os papéis `anon`, `authenticated` e `auth.uid()`; aplica as migrations reais e testa permissões, transações, correção e recuperação. **Nunca execute `supabase/tests/*.sql` no projeto remoto.** A simulação não substitui a validação de Auth/PostgREST/WebSocket no Supabase hospedado.

## Aplicar no Supabase existente

Não use `supabase projects create`, `db reset`, `db push --include-all` indiscriminadamente nem scripts de teste no remoto. Faça backup antes de migrações em uma base que já tenha dados. Estas migrations pressupõem o banco informado, sem tabelas de aplicação com os mesmos nomes.

### Opção A — SQL Editor (sem CLI)

No Dashboard do projeto **existente**, abra SQL Editor e execute **cada arquivo inteiro, uma vez, nesta ordem**:

1. `supabase/migrations/202611040001_foundation.sql`: tabelas, turmas, índices, RLS, helpers privados, hashes e publicação Realtime.
2. `supabase/migrations/202611040002_team_and_activity_rpc.sql`: cadastro, login, histórico, inscrição, entrega, revogação e autorização de nova tentativa.
3. `supabase/migrations/202611040003_admin_and_integrity.sql`: criação/edição/publicação de atividades, correção, ajustes CTF auditados e constraints adicionais.

Execute cada arquivo em uma transação (`BEGIN;` antes e `COMMIT;` depois do conteúdo) se o editor não garantir uma transação única. O seed de turmas é idempotente; os arquivos DDL são migrations versionadas, não scripts para reaplicar integralmente. Não reaplique uma migration já concluída. Em caso de erro, reverta apenas a transação aberta e investigue antes de seguir.

### Opção B — Supabase CLI

Use uma versão atual da CLI oficial instalada conforme a documentação Supabase e as credenciais administrativas do responsável, fora do frontend:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF_EXISTENTE
supabase db push --dry-run
# Revise: devem aparecer APENAS as três migrations acima.
supabase db push
```

Se os arquivos já foram executados no SQL Editor, **não os aplique novamente** via CLI. Depois de confirmar os objetos criados, registre o histórico com:

```bash
supabase migration repair --status applied 202611040001 202611040002 202611040003
supabase migration list
```

Não há credenciais remotas incluídas neste repositório e nenhuma migration é aplicada automaticamente pelo GitHub Actions.

## Primeiro administrador e professores

1. Em Authentication → Users, crie a conta do responsável usando e-mail e senha segura; confirme o e-mail conforme a política do projeto. Para uma conta convidada, conclua a definição de senha pelo fluxo do Supabase antes do login.
2. Copie o **UUID de `auth.users`**, não o e-mail nem o identificador do projeto.
3. Abra `supabase/bootstrap_admin.sql`, substitua `SUBSTITUA_PELO_UUID_DE_AUTH_USERS` por esse UUID e execute manualmente no SQL Editor, após as migrations.
4. Entre em `#admin` com essa conta. Apenas possuir conta no Supabase Auth não autoriza nenhuma operação administrativa.
5. Para autorizar um professor, execute como responsável no SQL Editor (substituindo o UUID):

```sql
insert into public.admin_users(user_id,role)
values ('UUID_REAL_DE_AUTH_USERS'::uuid,'teacher')
on conflict(user_id) do update set role=excluded.role;
```

Professores podem criar/publicar atividades, consultar integrantes, respostas e notas e corrigir notas. Apenas `admin` pode redefinir credenciais de duplas, autorizar outra entrega e ajustar pontos CTF manualmente. Não há trigger promovendo novos usuários. Remova a linha de `admin_users` para revogar o acesso na próxima consulta/operação. Configure MFA e políticas de conta no Dashboard conforme a instituição; a aplicação não implementa um segundo fator próprio.

## Configurações no Dashboard

- API: copie a **Project URL** e a **publishable key** para `.env` local e para as variáveis de build do Pages. A segurança depende de RLS e das RPCs, não de esconder a publishable key.
- Data API: mantenha `public` exposto. **Nunca exponha `app_private`** e não conceda execução de seus helpers a clientes. A aplicação não precisa expor `auth` ou `extensions` como schemas de API.
- Realtime → Publications: confirme que `public.public_leaderboard` pertence a `supabase_realtime` (a migration a adiciona se a publicação existir). Se ela não existir no projeto, habilite Realtime pelo Dashboard e adicione **somente** essa tabela da aplicação. Não publique nomes completos, respostas, credenciais ou notas.
- Authentication: habilite e-mail/senha para a equipe pedagógica e desabilite cadastros públicos se não forem usados. Defina Site URL para `https://joaocarlosgm.github.io/Hackers_D-egua/`. O login atual é por senha, sem OAuth ou magic links. Convites/redefinição de senha podem ser gerenciados pelo responsável no Dashboard; não há página pública de redefinição de senha Auth nesta versão.
- Nunca crie um segundo projeto para usar esta aplicação.

## Publicar exclusivamente no GitHub Pages

1. Repository Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. São configurações públicas de cliente, não credenciais administrativas.
3. Faça merge do PR em `main` ou execute manualmente o workflow **GitHub Pages**. Sem as duas variáveis, o deploy falha explicitamente.
4. O workflow compila `dist/` e publica somente no Pages. Não configura nem publica Vercel, Netlify ou outro host.
5. Se mudar o nome do repositório/domínio, ajuste `base` em `vite.config.ts` e o Site URL no Supabase.

O workflow **Validate** executa lint, typecheck, testes da interface, integração SQL local e build em PRs e em `main`. O deploy também valida a interface antes de publicar; migrations remotas continuam sendo uma ação administrativa separada.

## Fluxos implementados

### Cadastro único e retorno em Live Boot

- Dupla escolhe Poraquê ou Pitiú, apelido e **exatamente dois nomes completos**. Uma única RPC grava `teams`, dois `team_members` e a linha inicial do ranking (zero pontos/resoluções), em uma transação.
- Unicidade de apelido por turma usa índice `lower(btrim(public_name))`; apelidos iguais em turmas diferentes são permitidos. `team_id` é UUID permanente.
- O sistema gera código público de acesso aleatório e credencial **privada** aleatória de 192 bits. A credencial não é escolhida pelo aluno, nem derivada do apelido. O banco guarda bcrypt com custo 10; o cliente só a recebe no cadastro ou redefinição.
- A dupla deve anotar ou baixar as credenciais e guardá-las **fora do armazenamento efêmero do Live Boot**. A interface pede confirmação antes da atividade. Nenhum segredo é colocado no link ou QR Code.
- Para retornar, usa **Já tenho uma dupla**, código e credencial. Não precisa lembrar nomes nem recadastrar integrantes. A sessão de dupla tem 256 bits, só fica na memória da página e seu hash SHA256 expira em sete dias. Recarregar/navegar pode exigir login novamente; o cadastro permanece.
- Perda de credenciais: o administrador confirma a identidade dos integrantes por canal institucional e emite nova credencial em `#admin`. A anterior, os bearers anteriores e o bloqueio de login são revogados; UUID, histórico e notas permanecem. A auditoria registra a operação sem credencial.

### Atividades, entregas e correção

- O professor cria múltipla escolha ou V/F, uma resposta correta, pontuação, turma(s) e participação opcional no CTF. Salva rascunho, edita e publica. Conteúdo publicado fica imutável, inclusive após retirar a publicação, para preservar o significado das respostas históricas. Para mudar conteúdo publicado, crie outra atividade.
- O link/QR Code aponta à sessão. Turma, publicação e prazo são validados no banco tanto na entrada quanto na entrega.
- `join_activity` retorna a mesma tentativa em aberto em chamadas repetidas; a entrega é única. O administrador pode autorizar outra tentativa, que ganha novo UUID e número sequencial, sem substituir respostas/notas anteriores.
- `submit_attempt` verifica a propriedade da tentativa, todas as questões e alternativas, faz correção no servidor e persiste respostas, nota e eventos CTF atomicamente. Nenhuma nota, ponto ou gabarito enviado pelo navegador é aceito.
- Correções pedagógicas são privadas e não alteram CTF. Primeira resolução correta de cada questão em sessão CTF soma um evento; novas tentativas não geram pontos duplicados. Ajustes CTF administrativos são auditados e usam UUID idempotente de evento. Ajustes manuais podem reduzir pontos; não alteram contagem de questões resolvidas.
- Administração consulta respostas/notas, autoriza nova entrega, acompanha entregas e exporta CSV privado com integrantes e notas. CSV neutraliza fórmulas de planilha. Não compartilhe o arquivo publicamente.

### Segurança e limites

- Todas as tabelas de aplicação têm RLS. Leitura anônima direta se limita a `classes` e `public_leaderboard`. Atividades públicas são sanitizadas pela RPC: sem `is_correct`. Os nomes completos, respostas e notas são restritos à equipe autorizada, inclusive para usuários Auth comuns.
- Nenhum cliente possui INSERT/UPDATE/DELETE direto nas tabelas, nem mesmo a equipe pedagógica. Mutações usam RPCs `SECURITY DEFINER`, `search_path` vazio, parâmetros validados e autorização explícita. Helpers privados não podem ser chamados pelo cliente.
- Login: 10 tentativas por dupla a cada 15 minutos, incluindo falhas; códigos desconhecidos compartilham um bucket. Limite global de 1.000 logins/minuto. Cadastro: 100 registros/hora no projeto. As funções retornam erro de aplicação sem desfazer os contadores de falhas. Não há armazenamento ilimitado de chaves de rate limit fornecidas por atacantes.
- Limites globais protegem recursos, mas podem ser esgotados por abuso distribuído; não substituem proteção de borda. Ajuste a capacidade para o tamanho da escola em uma **nova migration**. Para CAPTCHA/limite por IP, use um gateway/Edge Function com verificação confiável no servidor, retirando o acesso anônimo direto às RPCs de cadastro/login se adotar esse modelo. Não confie em IP informado pelo navegador.
- Equipes só podem alterar suas próprias entregas em aberto usando bearer válido. Bearers não concedem acesso a notas e não são JWTs administrativos. Não registre argumentos RPC com credenciais em logs externos.

## Aceite após conectar ao projeto real

Os testes SQL cobrem o núcleo e a interface usa o SDK Supabase real. Antes de abrir para alunos, valide com dados autorizados de teste no próprio projeto (sem fixtures automáticas em produção):

1. Confirme **exatamente** Poraquê/Pitiú e crie uma dupla com dois integrantes; confira sua linha permanente e ranking zerado.
2. Guarde credenciais fora do Live Boot, feche/reabra o navegador e entre com elas; confira o mesmo UUID.
3. Publique duas atividades para a turma e participe de ambas com a mesma dupla. Confira histórico e notas privadas, sem novo cadastro.
4. Confira rejeição de apelido duplicado, turma incompatível, prazo encerrado e segunda entrega sem autorização.
5. Em um navegador anônimo, confirme que não consegue ler `team_members`, `grades`, `answers`, `teams` nem escrever pontos/notas. Confira também com uma conta Auth sem `admin_users`.
6. Com professor/admin autorizado, confira notas, correção e CSV. Com admin, redefina a credencial, verifique que a antiga parou de funcionar e que as notas permaneceram.
7. Abra `#ranking` em outra aba; cadastre uma dupla e entregue um desafio CTF. Confirme atualização por WebSocket, apenas com apelidos. A tela também recarrega o ranking ao reconectar/recuperar foco.
8. Abra no endereço publicado do Pages um link e QR Code de atividade. Confirme os assets sob `/Hackers_D-egua/`.

Aplicação no Supabase Cloud, autenticação hospedada, eventos WebSocket reais e publicação no Pages dependem das configurações externas acima e não devem ser considerados validados apenas pelos testes locais.
