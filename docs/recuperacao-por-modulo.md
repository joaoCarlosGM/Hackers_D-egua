# Recuperação de nota por módulo — operação pedagógica e técnica

**Estado:** implementação preparada no repositório; exige a migration `202611190001_module_recovery.sql` no Supabase. Não há aplicação automática de SQL por GitHub Pages.

## Regras
- No máximo **uma recuperação por módulo**, inclusive entre turmas: o módulo é identificado pelo mesmo nome no cadastro. Para turmas distintas, usar uma única recuperação associada às turmas desejadas.
- **20 questões** obrigatórias, cada uma valendo **0,5 na escala oficial**. O banco atual só aceita pontos inteiros por questão; internamente cada questão recebe 1 ponto (20 ao todo) e a nota oficial é calculada como `10 × pontos_brutos / 20`, de 0 a 10.
- **20 minutos corridos** após clicar *Iniciar atividade*, com QR Code projetável. Cada dupla também possui um cronômetro máximo de 20 minutos desde a entrada. Vale o limite que chegar primeiro: o encerramento global ou o individual. Para oferecer 20 minutos completos a todas as duplas, projete o QR Code e solicite que todos iniciem imediatamente.
- Exclusiva para duplas **com ausência em pelo menos uma das atividades regulares encerradas/arquivadas selecionadas pelo professor para o módulo**. Uma atividade aberta não pode ser selecionada como origem da falta.
- Contribui com **até 10 pontos por módulo**; a nota 8/10 gera bônus +8. Não altera a média das atividades regulares (`assessment_band`); a parcela de atividades do ranking é `min(200, 2 × assessment_band + recovery_bonus)`.
- A nota pessoal aparece no histórico da dupla **somente quando o professor libera o resultado** após encerrar a atividade. Dados das outras duplas permanecem privados.
- **Não cria pontos CTF** e não altera as notas de entregas antigas.

## Operação na administração
1. Em *Administração → Atividades*, abra **Cadastrar nova atividade**.
2. Marque **Recuperação de nota**, informe o módulo, selecione a(s) turma(s), selecione **quais atividades encerradas do módulo geraram as faltas**, clique **Preparar 20 questões de recuperação**, complete enunciados e respostas. Cada questão deve permanecer com 1 ponto interno (equivalente a 0,5 na nota final).
3. Salve como rascunho, publique e, **após a aula regular**, clique **Iniciar atividade**.
4. Projete o QR Code/código na tela. O sistema define a janela global de 20 minutos no momento da abertura e o limite individual de 20 minutos por tentativa.
5. Após encerrar, revise as entregas e marque a opção de liberar a nota às duplas.

## Dependências / implantação
- Faça backup do Supabase antes de executar qualquer migration; não execute a migration antiga de congelamento de placares.
- Execute apenas a nova migration depois da migration de ranking `202611050006_weighted_rank.sql`.
- O frontend verifica a existência das colunas novas antes de permitir que o professor cadastre uma recuperação; sem a migration, o cadastro é bloqueado.
- O ranking público tem fallback para leitura sem a coluna `recovery_bonus` para não quebrar antes do upgrade, mas o bônus só funcionará depois do SQL aplicado.
- Para recuperar pontos, o evento precisa estar cadastrado como recuperação; atividades regulares não recebem bônus.
- O banco impede duplicar o módulo por meio de índice único.
- A elegibilidade exige **pelo menos uma ausência nas atividades encerradas associadas à recuperação**. A associação é definida no cadastro e validada no banco; atividades fora dessa seleção não conferem acesso nem bônus.
- **Não publicar uma recuperação na produção sem verificar** que a migration foi aplicada, que o cadastro rejeita uma segunda recuperação para o módulo, que a tentativa de uma dupla sem falta é recusada e que a pontuação muda somente no limite previsto.

## Exemplos
- Dupla com `assessment_band=60`: componente regular 120. Recuperação 8/10 → bônus 8 → 128 pontos de atividades, sem qualquer mudança nos pontos CTF.
- Dupla com `assessment_band=100`: componente regular 200. Mesmo com bônus calculado, o teto permanece 200.
- Se existirem recuperações de módulos distintos, cada uma contribui no máximo 10 e a soma dos bônus não ultrapassa os 200 pontos gerais disponíveis à componente pedagógica.

## Arquivos
- `supabase/migrations/202611190001_module_recovery.sql` — validação por módulo, controle de elegibilidade, bônus e nota oficial.
- `src/Admin.tsx` — cadastro, validação, projeção e encerramento de 20 minutos.
- `src/ranking.ts` — soma do bônus ao aproveitamento legado, com teto de 200.
- `src/App.tsx` — consulta de pontuação pública.
