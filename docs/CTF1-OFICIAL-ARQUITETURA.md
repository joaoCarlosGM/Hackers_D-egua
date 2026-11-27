# CTF 1 OFICIAL — contrato de produto e implementação

Status: **arquitetura definida; ainda NÃO habilitado em produção**. O HTML `Hackers_CTF_ABRIR_NO_NAVEGADOR(2).html` é a referência VISUAL aprovada, não a fonte de regras de segurança nem de conteúdo. Não migrar o cenário fictício "Operação DNS Fantasma": o CTF oficial será a revisão da Aula 7 com **exatamente três missões**.

## Missões oficiais e pontuação

| Missão | Evidência | Máximo |
| --- | --- | ---: |
| 1. O Rastro Trancado | Arquivo oculto e permissões DAC; flag individual | 30 |
| 2. O Invasor Insistente | Logs SSH simulados e IP atacante individual; flag individual | 60 |
| 3. A Impressão Digital, Quebra de MD5 e o Cofre | 50 evidências AES-256-CBC, MD5, wordlist, hash SHA-256 e flag individual | 80 |
| Write-up 1 | Procedimentos, justificativa, evidência, conclusão | 10 |
| Write-up 2 | Procedimentos, justificativa, evidência, conclusão | 10 |
| Write-up 3 | Procedimentos, justificativa, evidência, conclusão | 10 |
| **Total CTF 1** | | **200** |

As notas de flags **não** precisam ser automaticamente máximas: o professor pode atribuir de 0 até o teto de cada missão, e de 0 a 10 por write-up. O backend rejeita números fora do intervalo ou soma > 200. O relógio afeta a elegibilidade de uma submissão e o desempate, **nunca gera pontos extras**.

## Experiência de professor (conforme HTML de referência)

- **Painel do professor**: visão das turmas Poraquê/Pitiú, lista das duplas reais, status, marcos, horário de início, prazo, conclusão, envios de flag e eventos recentes; filtros por turma. Todos os dados vêm do Supabase, sem fixtures de demonstração no ambiente oficial.
- **Iniciar CTF / Encerrar rodada**: o professor inicia uma rodada por turma (ou ambas se explicitamente selecionadas). O banco grava `started_at` e `ends_at = started_at + 60 min` em UTC. O cronômetro mostrado é o tempo restante calculado da hora do servidor, não de `localStorage` ou do relógio manipulado do aluno.
- **Terminal da dupla**: a dupla entra com as credenciais existentes; só vê a própria sessão. Uma vez iniciado pelo professor, recebe acesso ao terminal v86 e ao `missao.txt`. A sessão do aluno NUNCA mostra um seletor de dupla nem informações privadas de outras duplas.
- **Auditoria CTF**: painel por rodada e dupla; histórico de comandos e resultados, eventos de validação das flags, write-ups, status, tempo e notas individuais. Professor registra justificativa e aprova a nota final.
- **Excluir CTF da dupla**: botão de ação administrativa **Excluir participação do CTF** requer confirmação e motivo; não exclui cadastro, avaliações, presença, credenciais nem pontos históricos. Marcar participação `excluded_at`, remover dessa rodada e de futuras publicações de pontuação, preservando o registro de auditoria e a possibilidade de restaurar com justificativa. Disponibilizar opção "restaurar participação".
- **Terminal do professor** permanece como revisão independente `#admin/revisao-ctf` e não afeta o CTF oficial.

## Segurança e persistência obrigatórias

1. As duplas existentes continuam usando `login_team` (credenciais curtas ou legadas); no backend `app_private.team_for_token` vincula token à dupla, não aceitar IDs de dupla do navegador para autorizar endpoints estudantis.
2. Não incluir respostas corretas, HMAC keys, senhas ou flags de outras duplas no bundle JS público, arquivos estáticos compartilhados do GitHub Pages, prévias HTML ou queries públicas. O servidor conhece a correspondência segura entre `round_id`, `team_id`, `challenge_no` e o hash da flag esperada.
3. **Variantes por dupla**: preservar histórias e objetivos das três missões, mas gerar uma flag exclusiva por desafio e por dupla. A missão 2 precisa de logs SSH com um IP atacante único por dupla; a missão 3 precisa de uma evidência .enc exclusiva cujo SHA-256 esperado seja fornecido no próprio briefing da dupla. A wordlist original de 15 entradas pode ser mantida. A faixa/quantidade de arquivos (50) permanece.
4. O v86 no navegador é um ambiente controlado pelo estudante; nenhuma prova baseada exclusivamente em `javascript`, `localStorage` ou mensagens `vm_ready` serve de fundamento para pontuação. O backend só reconhece envio explícito de flag, autenticado, assinado contra um segredo no banco e dentro da janela da rodada. Mesmo assim, um CTF totalmente executado no cliente é inerentemente mais fácil de inspecionar: para contenção mais forte, migrar a VM para instância remota isolada.
5. Nunca salvar no log de auditoria senha, token da dupla, senha AES, texto integral de evidência secreta, hash-alvo privado ou a flag correta. Registrar comando normalizado/redigido, instante e status de validação. O histórico de terminal do navegador é **telemetria não confiável**, que auxilia a avaliação, mas não constitui prova inviolável.
6. Aplicar RLS e `REVOKE` em todas as novas tabelas; RPCs de escrita com autorização explícita e teste de acesso cruzado, negação de escrita anônima e rate limit. Staff (`admin_users`) vê relatório; aluno só sua própria participação.
7. Nunca iniciar automaticamente a rodada no primeiro login do aluno. O professor é a única origem do início. Persistir `closed_at`, não reabrir automaticamente no refresh. No prazo, bloquear novas validações, mas permitir consulta ao histórico pelo professor.
8. A revisão do professor continua totalmente isolada (`ctf_review_teacher_*`). Evitar tocar nos pontos existentes do ranking antes da aprovação da integração com `ctf_score_events`/módulo 1. Publicar somente após homologação de dados/segurança.
9. O write-up precisa abrir em modal acessível, não abaixo do terminal; editor persistente e sem captura automática de foco por xterm. Salvar rascunhos pela RPC específica da própria dupla e impedir alterações após fechamento oficial, salvo reabertura administrativa auditada.

## Estado de rodada

`draft -> scheduled? -> running -> ended -> audited -> published`. A transição `draft -> running` exige ação do professor; `running -> ended` acontece no limite de 60 minutos, independentemente do navegador. Sessões excluídas não recebem nota nem entram em ranking. Correções posteriores geram revisões de auditoria, sem sobrescrever silenciosamente notas anteriores.

## APIs esperadas (nomes planejados, não implantados)

- Staff: `ctf1_create_round`, `ctf1_start_round`, `ctf1_end_round`, `ctf1_dashboard`, `ctf1_audit_team`, `ctf1_grade_team`, `ctf1_exclude_team`, `ctf1_restore_team`, `ctf1_publish_scores`.
- Dupla: `ctf1_student_status(p_token)`, `ctf1_student_fixture(p_token)`, `ctf1_submit_flag(p_token,p_challenge,p_flag)`, `ctf1_save_writeup(p_token,p_challenge,...)`.
- As `RPCs` são esboços de contrato até serem implementadas e testadas. Nunca chamar essas funções de uma tela antes da migração existir.

## Critérios de homologação / bloqueadores do deploy

- Duplas A e B não leem dados uma da outra nem acessam sessões do professor.
- A mesma flag de A é recusada para B; flags de desafio incorreto ou rodada antiga também são recusadas.
- Professor inicia -> ambas as duplas observam o mesmo prazo de 60 min; refresh/novo dispositivo não reinicia o tempo. Relógio alterado do navegador não abre a rodada.
- CTF rodando: terminal real v86 inicializa, `cat missao.txt` mostra três histórias; comandos `hashid`, `john` didático, `openssl` Web Crypto e 50 arquivos da variante funcionam.
- Modal write-up recebe digitação e scroll corretamente enquanto v86 está ativo; pode salvar, fechar e reabrir sem perda.
- Professor recebe eventos e flag status, atribui 0–30/60/80/10/10/10 e total <=200, com justificativa obrigatória.
- Excluir/restaurar participação com confirmação, auditoria e reversibilidade, sem excluir cadastro ou alterar histórico do ranking.
- Sem `service_role` no navegador e sem respostas/segredos globais no GitHub Pages; teste de RLS e RPC com `anon`, professor e duas duplas.
- Regressão das avaliações, presenças e ranking atual passa. **Não aplicar produção automaticamente**.

## Observações sobre o HTML anexado

O HTML é uma prévia independente que simula comandos (não executa Linux real), usa duplas fictícias e persiste dados em `localStorage`. Aproveitar o layout, componentes, cores, tabela, relógio, cards de objetivos e auditoria — **não** seu motor de estado, flags, comandos simulados, pontuação nem armazenamento. Seu cenário "Operação DNS Fantasma" deve ser substituído pelos três desafios da Aula 7.


## Ensaio antes da competição

A criação de rodada possui `mode='test'`. **O servidor bloqueia o modo `official`** enquanto as evidências e flags forem entregues a uma VM executada no navegador do participante: nesse caso o participante consegue inspecioná-las com ferramentas de desenvolvimento, mesmo com validação por HMAC no servidor. Use somente o modo de teste para homologar o fluxo funcional, não para publicar pontos.

- O professor pode criar **quantas novas rodadas** de 60 minutos precisar. Uma rodada iniciada não é reiniciável e encerrá-la não afeta a próxima.
- Em `#admin/ctf-oficial`, selecione a turma e **exatamente as duplas inscritas**. Exemplo: escolha 7 para o primeiro ensaio, encerre; depois selecione 9 para o segundo, em outra rodada.
- Cada dupla usa suas credenciais em `#ctf-oficial` e acessa somente a rodada à qual foi incluída; cada VM v86 roda no computador da dupla.
- O DB smoke test testa limites e isolamento de rodadas de 7 e 9 duplas; **isso não substitui teste de carga real de 7 ou 9 navegadores/Live Boots simultâneos**.
- Flags, evidências e write-ups de ensaio são salvos em tabelas separadas; não publicar em `ctf_score_events` e nunca alterar o ranking histórico automaticamente.
- O professor pode excluir a participação da dupla da rodada com motivo e restaurá-la. Não excluir o cadastro nem destruir o histórico.
- Para a competição pontuada definitiva, um backend de laboratório remoto isolado ou outro mecanismo de provisionamento sem segredos no cliente é pré-requisito de segurança.

### Checklist de aceite para 7 e 9 duplas

Em **dois ensaios diferentes**, confira cada dupla: autenticação bem-sucedida, início no mesmo relógio de servidor, VM v86 inicializa sem falhar, três cenários e 50 .enc presentes, MD5 e AES/PBKDF2 executam, flags únicas validadas, write-up salva e volta após recarregar, auditoria de cada dupla e notas limitadas a 200. Observe consumo de RAM e CPU por computador e a taxa de erros HTTP do Supabase. Só então marcar teste real 7+9 como aprovado.


## Regra operacional final — rodada por turma (27/11/2026)

- Cada rodada pertence a **exatamente uma turma**: Poraquê **ou** Pitiú. Nunca juntar as turmas na mesma rodada.
- Ao criar o rascunho, inscrever automaticamente **todas as duplas ativas da turma**. Não solicitar seleção manual de duplas para a rodada normal.
- Cada dupla entra com **seu código e sua credencial privada já existentes**, a partir de **um único computador por dupla**. A dupla deve fazer um único login e compartilhar o computador entre os dois membros. A aplicação ainda não impõe tecnicamente exclusividade de dispositivo; isso exige controle adicional de sessão concorrente.
- Ao iniciar a rodada da turma, todos os participantes daquela turma recebem o **mesmo intervalo de 60 minutos**, com início e fim persistidos no servidor; a outra turma permanece independente.
- Para ensaios, é possível criar novas rodadas por turma em qualquer ocasião, sem reutilizar nem zerar o cronômetro de uma rodada anterior.
- A versão de ensaio não publica notas no ranking e mantém o modo oficial bloqueado pela limitação de segurança da VM no navegador.
- A quantidade é dinâmica: usar as duplas ativas de cada turma no instante de criação, não números fixos de 7 ou 9.
