# Hackers Pai D'égua

Cadastro permanente de duplas, atividades pedagógicas e ranking CTF. React + TypeScript no **GitHub Pages**, PostgreSQL/RPC + Supabase Auth + Realtime no **projeto Supabase Cloud já existente**. Não há servidor Node em produção nem chave secreta no frontend.

A interface utiliza a paleta oficial (#EE66A6, #E0E8F0, #5588FF, #44AA88, #222233 e #4B2E83) e a composição de pódio e tabela de `ranking_referencia.png`, recebidos em `hackers_pai_degua_referencias.zip`. Todas as artes são extraídas para `public/assets/`, com origem e SHA-256 em `public/assets/manifest.json`. Os cabeçalhos de todas as páginas e o ranking utilizam o mascote transparente original da página 2 do PDF, com sua máscara original e proporções preservadas. As quatro propostas de logo permanecem disponíveis intactas. A fonte retro Courier Prime é hospedada localmente, com licença OFL. O navegador não acessa o ZIP. Nenhuma equipe ou pontuação fictícia da referência é inserida no banco. O ranking inclui modo projetor e respeita a preferência por movimento reduzido.

## Desenvolvimento

Requer Node 24 e npm. Docker é necessário apenas para os testes SQL locais.

```bash
cd /workspace/Hackers_D-egua
npm ci
cp .env.example .env
# Preencha somente a URL e a publishable key do projeto existente.
npm run dev
```

A publicação usa o endereço gratuito **https://joaocarlosgm.github.io/Hackers_D-egua/**, com `base: "/Hackers_D-egua/"` no Vite. Rotas usam hash (`#ranking`, `#admin`, `#atividade/UUID`), inclusive nos QR Codes, para não depender de reescrita de URLs no Pages. Não coloque `service_role`, secret key, senha do banco nem credenciais dos alunos em variáveis `VITE_*`.

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm run test:pages
npm run test:visual
npm run preview
```

`test:db` cria e remove exclusivamente um container PostgreSQL 17 descartável, sem portas públicas, sem URL remota. Simula os papéis `anon`, `authenticated` e `auth.uid()`; aplica as migrations reais e testa permissões, transações, correção e recuperação. **Nunca execute `supabase/tests/*.sql` no projeto remoto.** A simulação não substitui a validação de Auth/PostgREST/WebSocket no Supabase hospedado.

## Aplicar no Supabase existente

Não use `supabase projects create`, `db reset`, `db push --include-all` indiscriminadamente nem scripts de teste no remoto. Faça backup antes de migrações em uma base que já tenha dados. As três primeiras migrations criam a fundação em um banco sem tabelas de aplicação. A quarta adiciona avaliações e a quinta adiciona gerenciamento de turmas; se a fundação já foi aplicada, execute somente as migrations ainda pendentes.

### Opção A — SQL Editor (sem CLI)

No Dashboard do projeto **existente**, abra SQL Editor e execute **cada arquivo inteiro, uma vez, nesta ordem**:

1. `supabase/migrations/202611040001_foundation.sql`: tabelas, turmas, índices, RLS, helpers privados, hashes e publicação Realtime.
2. `supabase/migrations/202611040002_team_and_activity_rpc.sql`: cadastro, login, histórico, inscrição, entrega, revogação e autorização de nova tentativa.
3. `supabase/migrations/202611040003_admin_and_integrity.sql`: criação/edição/publicação de atividades, correção, ajustes CTF auditados e constraints adicionais.
4. `supabase/migrations/202611040004_assessments.sql`: estados, código curto, cronômetro, navegação, revisões, progresso protegido, correção idempotente, resultados privados e notificações Realtime. Preserva duplas, notas e pontos CTF existentes; desativa a conversão automática de novas notas em pontos CTF.

5. `supabase/migrations/202611050001_class_management.sql`: turmas ativas/arquivadas, novos slugs, RPCs administrativas auditadas, exclusão protegida e bloqueio de cadastro em turmas arquivadas. Se as quatro primeiras já foram aplicadas, execute somente esta migration nova.
6. `supabase/migrations/202611050002_team_management.sql`: gestão auditada das duplas, correção de nomes, transferência segura, desativação e exclusão restrita a cadastros sem histórico. **Aplicar somente depois da migration 005**.

Execute cada arquivo em uma transação (`BEGIN;` antes e `COMMIT;` depois do conteúdo) se o editor não garantir uma transação única. O seed de turmas é idempotente; os arquivos DDL são migrations versionadas, não scripts para reaplicar integralmente. Não reaplique uma migration já concluída. Em caso de erro, reverta apenas a transação aberta e investigue antes de seguir.

### Opção B — Supabase CLI

Use uma versão atual da CLI oficial instalada conforme a documentação Supabase e as credenciais administrativas do responsável, fora do frontend:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF_EXISTENTE
supabase db push --dry-run
# Revise: devem aparecer APENAS as migrations pendentes dentre as cinco acima.
supabase db push
```

Se os arquivos já foram executados no SQL Editor, **não os aplique novamente** via CLI. Depois de confirmar os objetos criados, registre apenas as versões efetivamente aplicadas. Exemplo para um banco com as cinco migrations concluídas:

```bash
supabase migration repair --status applied 202611040001 202611040002 202611040003 202611040004 202611050001
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

Professores podem criar/publicar atividades, consultar integrantes, respostas e notas e corrigir notas. Professores e administradores podem autorizar nova tentativa. Apenas `admin` pode redefinir credenciais permanentes das duplas e ajustar pontos CTF manualmente. Não há trigger promovendo novos usuários. Remova a linha de `admin_users` para revogar o acesso na próxima consulta/operação. Configure MFA e políticas de conta no Dashboard conforme a instituição; a aplicação não implementa um segundo fator próprio.

## Configurações no Dashboard

- API: copie a **Project URL** e a **publishable key** para `.env` local e para as variáveis de build do Pages. A segurança depende de RLS e das RPCs, não de esconder a publishable key.
- Data API: mantenha `public` exposto. **Nunca exponha `app_private`** e não conceda execução de seus helpers a clientes. A aplicação não precisa expor `auth` ou `extensions` como schemas de API.
- Realtime → Publications: confirme que `public.public_leaderboard` e `public.assessment_updates` pertencem a `supabase_realtime` (as migrations as adicionam se a publicação existir). Se ela não existir no projeto, habilite Realtime pelo Dashboard e adicione essas duas tabelas. `assessment_updates` contém somente UUID da sessão e timestamp, com leitura permitida apenas a `admin_users`; é o sinal para recarregar resultados privados por RPC. Não publique diretamente nomes completos, respostas, credenciais ou notas.
- Authentication: habilite e-mail/senha para a equipe pedagógica e desabilite cadastros públicos se não forem usados. Defina Site URL para `https://joaocarlosgm.github.io/Hackers_D-egua/`. O login atual é por senha, sem OAuth ou magic links. Convites/redefinição de senha podem ser gerenciados pelo responsável no Dashboard; não há página pública de redefinição de senha Auth nesta versão.
- Nunca crie um segundo projeto para usar esta aplicação.

## Publicar exclusivamente no GitHub Pages

1. Repository Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. São configurações públicas de cliente, não credenciais administrativas.
3. Faça merge do PR em `main` ou execute manualmente o workflow **GitHub Pages**. Sem as duas variáveis, o deploy falha explicitamente.
4. O workflow compila `dist/` e publica somente no Pages. Não configura nem publica Vercel, Netlify ou outro host.
5. Mantenha `base: "/Hackers_D-egua/"` e **Custom domain vazio** nas configurações do Pages. Não use arquivos `CNAME` na raiz ou em `public/`. Consulte [Publicação no endereço gratuito](docs/github-pages.md).

O workflow **Validate** executa lint, typecheck, testes da interface, integração SQL local e build em PRs e em `main`. O deploy também valida a interface antes de publicar; migrations remotas continuam sendo uma ação administrativa separada.

## Fluxos implementados

### Cadastro único e retorno em Live Boot

- Dupla escolhe Poraquê ou Pitiú, apelido e **exatamente dois nomes completos**. Uma única RPC grava `teams`, dois `team_members` e a linha inicial do ranking (zero pontos/resoluções), em uma transação.
- Unicidade de apelido por turma usa índice `lower(btrim(public_name))`; apelidos iguais em turmas diferentes são permitidos. `team_id` é UUID permanente.
- O sistema gera código público de acesso aleatório e credencial **privada** aleatória de 192 bits. A credencial não é escolhida pelo aluno, nem derivada do apelido. O banco guarda bcrypt com custo 10; o cliente só a recebe no cadastro ou redefinição.
- A dupla deve anotar ou baixar as credenciais e guardá-las **fora do armazenamento efêmero do Live Boot**. A interface pede confirmação antes da atividade. Nenhum segredo é colocado no link ou QR Code.
- Para retornar, usa **Já tenho uma dupla**, código e credencial. Não precisa lembrar nomes nem recadastrar integrantes. A sessão de dupla tem 256 bits e seu hash SHA256 expira em sete dias. O bearer temporário fica na memória e no `sessionStorage` da aba para permitir recarregar/navegar; nunca vai no link nem no ranking. Fechar a aba, encerrar a sessão ou reiniciar o Live Boot pode exigir código e credencial privada novamente; o cadastro permanece. Os alunos não criam conta Auth nem escolhem senha.
- Perda de credenciais: o administrador confirma a identidade dos integrantes por canal institucional e emite nova credencial em `#admin`. A anterior, os bearers anteriores e o bloqueio de login são revogados; UUID, histórico e notas permanecem. A auditoria registra a operação sem credencial.

### Atividades, entregas e correção

- O professor cria múltipla escolha (2 a 5 alternativas) ou V/F, uma resposta correta, explicação opcional, pontuação e turma(s). Reordena questões, pré-visualiza e salva rascunho. Pode publicar e retornar ao rascunho antes de haver participações; conteúdo aberto ou com participações não pode ser editado. Duplicar cria outra atividade com `revision_of`, número de revisão e novos UUIDs. Exclusão só é permitida sem participações; use arquivamento para preservar histórico.
- O professor publica e clica em **Iniciar atividade**: aparecem código de 8 caracteres, link com hash e QR Code em uma tela de projeção. Alunos também podem digitar o código na página inicial. Turma, estado aberto e prazo são validados no banco tanto na entrada quanto na entrega.
- `join_activity` retorna a mesma tentativa em aberto em chamadas repetidas; a entrega é única. O professor ou administrador pode autorizar outra tentativa, que ganha novo UUID e número sequencial, sem substituir respostas/notas anteriores.
- `submit_attempt` verifica a propriedade da tentativa, todas as questões e alternativas, faz correção no servidor e persiste respostas, nota e horário de entrega atomicamente. Um reenvio após perda da confirmação retorna a mesma entrega sem duplicar respostas ou notas; não executa nova correção. Nenhuma nota, ponto ou gabarito enviado pelo navegador é aceito.
- Correções pedagógicas são privadas e não alteram CTF. Avaliações nunca geram `ctf_score_events`, mesmo que a sessão antiga tivesse CTF habilitado. Eventos e pontos históricos permanecem intactos. Ajustes CTF administrativos continuam auditados e usam UUID idempotente de evento; podem reduzir pontos e não alteram contagem de desafios resolvidos.
- Administração consulta respostas/notas, autoriza nova entrega, acompanha entregas e exporta CSV privado com integrantes e notas. CSV neutraliza fórmulas de planilha. Não compartilhe o arquivo publicamente.

### Segurança e limites

- Todas as tabelas de aplicação têm RLS. Leitura anônima direta se limita a `classes` e `public_leaderboard`. Atividades públicas são sanitizadas pela RPC: sem `is_correct`. Os nomes completos, respostas e notas são restritos à equipe autorizada, inclusive para usuários Auth comuns.
- Nenhum cliente possui INSERT/UPDATE/DELETE direto nas tabelas, nem mesmo a equipe pedagógica. Mutações usam RPCs `SECURITY DEFINER`, `search_path` vazio, parâmetros validados e autorização explícita. Helpers privados não podem ser chamados pelo cliente.
- Login: 10 tentativas por dupla a cada 15 minutos, incluindo falhas; códigos desconhecidos compartilham um bucket. Limite global de 1.000 logins/minuto. Cadastro: 100 registros/hora no projeto. As funções retornam erro de aplicação sem desfazer os contadores de falhas. Não há armazenamento ilimitado de chaves de rate limit fornecidas por atacantes.
- Limites globais protegem recursos, mas podem ser esgotados por abuso distribuído; não substituem proteção de borda. Ajuste a capacidade para o tamanho da escola em uma **nova migration**. Para CAPTCHA/limite por IP, use um gateway/Edge Function com verificação confiável no servidor, retirando o acesso anônimo direto às RPCs de cadastro/login se adotar esse modelo. Não confie em IP informado pelo navegador.
- Equipes só podem alterar suas próprias entregas em aberto usando bearer válido. Bearers não são JWTs administrativos nem permitem ler gabaritos ou consultar notas diretamente. A RPC `team_result` libera somente a própria nota, após estado encerrado/arquivado e autorização explícita do professor (`release_results`, falso por padrão). Não registre argumentos RPC com credenciais em logs externos.

## Aceite após conectar ao projeto real

Os testes SQL cobrem o núcleo e a interface usa o SDK Supabase real. Antes de abrir para alunos, valide com dados autorizados de teste no próprio projeto (sem fixtures automáticas em produção):

1. Confirme **exatamente** Poraquê/Pitiú e crie uma dupla com dois integrantes; confira sua linha permanente e ranking zerado.
2. Guarde credenciais fora do Live Boot, feche/reabra o navegador e entre com elas; confira o mesmo UUID.
3. Publique duas atividades para a turma e participe de ambas com a mesma dupla. Confira histórico e notas privadas, sem novo cadastro.
4. Confira rejeição de apelido duplicado, turma incompatível, prazo encerrado e segunda entrega sem autorização.
5. Em um navegador anônimo, confirme que não consegue ler `team_members`, `grades`, `answers`, `teams` nem escrever pontos/notas. Confira também com uma conta Auth sem `admin_users`.
6. Com professor/admin autorizado, confira notas, correção e CSV. Com admin, redefina a credencial, verifique que a antiga parou de funcionar e que as notas permaneceram.
7. Abra `#ranking` em outra aba; cadastre uma dupla e registre um ajuste CTF autorizado. Confirme atualização por WebSocket, apenas com apelidos, e que entregar uma avaliação não altera pontos CTF. A tela também recarrega o ranking ao reconectar/recuperar foco.
8. Abra no endereço publicado do Pages um link e QR Code de atividade. Confirme os assets sob `/Hackers_D-egua/assets/`, incluindo o logo oficial e as fontes locais.

Aplicação no Supabase Cloud, autenticação hospedada, eventos WebSocket reais e publicação no Pages dependem das configurações externas acima e não devem ser considerados validados apenas pelos testes locais.

## Avaliações em sala e resultados

Os estados da sessão são **Rascunho → Publicada → Aberta → Encerrada → Arquivada**. Publicar não abre a atividade automaticamente. Sessões encerradas podem ser reabertas pelo professor, preservando entregas existentes e bloqueando uma segunda entrega até autorização. Arquivadas podem voltar a encerradas e então ser reabertas; cada transição gera auditoria. Prazo agendado bloqueia entrada e envio no servidor, mas o professor ainda deve encerrar a sessão para liberar resultados.

O quiz mostra uma pergunta por vez, alternativas coloridas com seleção visível, V/F, progresso e confirmação final. O cronômetro opcional é um **limite total por tentativa**, contado a partir da criação da participação no banco. Trocar o relógio do navegador ou reconectar não renova o prazo. Ao expirar, o servidor rejeita a entrega; o professor pode liberar nova tentativa com prazo novo. A tentativa anterior fica marcada como expirada, sem inventar entrega ou nota. O tempo continua correndo sem internet.

Respostas não enviadas ficam temporariamente no `sessionStorage` da aba e são sincronizadas pela RPC `save_attempt_progress`, usando bearer e UUID da tentativa. O progresso remoto permite retomar com login da mesma dupla. O modo sem voltar impede retrocesso e alteração de respostas anteriores já sincronizadas no servidor. Em queda de rede, mantenha a aba aberta e reconecte antes do prazo; esta versão não é um aplicativo offline/PWA e não garante preservar arquivos locais após reiniciar o Live Boot. O cadastro permanente sempre continua recuperável.

Resultados privados ficam em `#/admin/atividades/ACTIVITY_UUID/resultados`. O prefixo hash é necessário no GitHub Pages: não há backend para responder diretamente a `/admin/atividades/...`. O painel mostra duplas das turmas selecionadas, duplas que iniciaram/concluíram, entregas, média, acertos por questão, integrantes, horários, respostas e CSV. Métricas de nota/acertos consideram todas as entregas, incluindo tentativas adicionais autorizadas. Tentativas expiradas sem nota não contam como entrega concluída. Realtime notifica mudanças; reconexão, foco da aba e consulta a cada 15 segundos recuperam eventos perdidos.

Por padrão a dupla vê somente confirmação de entrega. Se o professor habilitar a liberação e encerrar a sessão, o histórico oferece consulta apenas da própria nota, sem gabarito. Notas, integrantes e respostas continuam inacessíveis por SELECT anônimo.

A exportação CSV é o formato preparado para integração futura com a pasta privada do Google Drive. Nenhum envio ao Drive é realizado nesta versão. Consulte `docs/drive-reports.md` para o contrato e a autorização exigida.

## Configuração local e validação externa

Valores reais de URL/publishable key devem ficar em `.env.local` ignorado pelo Git, ou nas Variables do GitHub Actions; `.env.example` contém apenas placeholders. Uma chave `sb_secret_*` ou `service_role` nunca é necessária no navegador e não dá acesso SQL arbitrário pela API REST. Se uma chave administrativa for compartilhada em chat, revogue-a no Dashboard e gere outra por canal seguro.

A rede deste ambiente precisa permitir o hostname do projeto Supabase e `api.github.com` para validação hospedada e abertura do PR. Um rascunho salvo não altera a política em execução; revise/salve a configuração e publique o ambiente quando desejar aplicar a mudança. A execução local não comprova que as migrations já estão no Supabase Cloud. Não crie duplas fictícias em produção apenas para testar.

## Identidade oficial e revisão visual

A fonte de verdade é o ZIP do repositório: `ranking_referencia.png`, `paleta_oficial.png`, as quatro logos e o PDF com quatro páginas foram inspecionados. As seis cores exatas estão em `src/tokens.css`. `src/Brand.tsx` aplica o mesmo cabeçalho com o mascote original a início, cadastro, quiz, ranking, login, administração e resultados. Os caminhos usam `import.meta.env.BASE_URL` para funcionar no GitHub Pages.

Os assets necessários já estão extraídos em `public/assets/brand/` e as referências em `public/assets/references/`. Não é necessário extrair o ZIP para instalar, compilar ou executar o site. Para reproduzir a extração durante manutenção, use `python3 scripts/extract-brand-assets.py` em um ambiente com PyMuPDF; o script copia as PNGs byte a byte e extrai as imagens e máscaras originais do PDF. Ele não recorta, redesenha, recolore ou altera as proporções do mascote.

`npm run test:visual` executa 15 cenários Playwright em Chromium. No ambiente atual, usa `/usr/bin/chromium`; em outra máquina, execute `npx playwright install --with-deps chromium` antes. Também é possível selecionar o binário com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Os testes cobrem as páginas existentes e o gerenciamento de turmas em desktop e celular, proporção do logo, tokens de cor, ausência de rolagem horizontal e arquivos originais por checksum. São gerados 19 PNGs em `artifacts/visual/`, incluindo `ranking-comparison.png`, comparação lado a lado com a referência enviada. Resultados e screenshots são publicados como artefato de CI, sem deploy do site.

As fixtures de ranking, usuários e notas existem **apenas nos testes do navegador**, com todas as requisições Supabase interceptadas. Não são dados reais nem inserções no projeto Cloud. O servidor dos testes usa uma URL e chave fictícias explicitamente isoladas da configuração de produção. Consulte `docs/visual-review.md` para a revisão e as diferenças corrigidas.

## Gerenciar duplas

O painel `#admin` agora inclui **Gerenciar duplas** com pesquisa, listagem de integrantes, edição, troca de turma para equipes sem histórico, ativação/desativação, nova credencial e exclusão confirmada apenas de cadastros vazios. Todas as operações de escrita exigem perfil `admin` e são auditadas. Duplas com avaliações ou pontos CTF devem ser desativadas, nunca excluídas. A implantação exige a migration 006 no Supabase antes do novo frontend. Confira [o procedimento e os testes](docs/team-management.md).

## Gerenciar turmas

O painel administrativo lista turmas ativas/arquivadas e suas contagens de duplas, participações e atividades. Administradores podem criar além de Poraquê/Pitiú, renomear, arquivar e reativar. Exclusão exige confirmação digitada e ausência de qualquer vínculo, revalidada no servidor. Professores têm consulta de históricos; alunos não podem se cadastrar em turmas arquivadas. Arquivar preserva os UUIDs, integrantes, credenciais, notas e pontos CTF. Consulte [Gerenciamento de turmas e migration aditiva](docs/class-management.md) antes do deploy. As migrations anteriores não devem ser modificadas nem reaplicadas.
