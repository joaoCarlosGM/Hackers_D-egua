# Regulamento técnico — ranking legado e calculadora do aluno

Versão: 18/11/2026. Repositório: `joaoCarlosGM/Hackers_D-egua`.

## 1. Distribuição aprovada

| Componente | Máximo no ranking | Peso |
| --- | ---: | ---: |
| Atividades avaliativas (16 listas oficiais) | 200 | 20% |
| CTF 1 — iniciante | 200 | 20% |
| CTF 2 — intermediário | 250 | 25% |
| CTF 3 — avançado | 350 | 35% |
| **Total** | **1.000** | **100%** |

**Nota:** o banco guarda o saldo CTF em `public_leaderboard.points`, sem separar atualmente os três eventos em colunas/limites. O frontend aplica o **teto agregado de 800**, não valida individualmente 200/250/350; para impor os três tetos com segurança, será necessária identificação e validação dos eventos CTF no backend. A calculadora usa os tetos individuais por serem a regra pedagógica.

## 2. Regra vigente do ranking legado para as atividades

Cada atividade elegível tem nota obtida `p` e máximo `m`. Sua razão é `r = p/m`, limitada a 0–1, para `m > 0`. A mesma dupla conta **uma vez por sessão**, com a **melhor tentativa entregue**, nunca a soma das tentativas.

A função `app_private.refresh_assessment_band`:
1. Considera sessões com estado `open`, `closed` ou `archived`, para a turma da dupla.
2. Para cada sessão, toma a maior razão de nota entre entregas válidas.
3. Uma sessão elegível sem entrega entra com razão zero.
4. Calcula a média aritmética `R = (r1 + ... + rn)/n`, considerando cada sessão elegível com o mesmo peso.
5. Arredonda `100R` em faixas de **5 pontos percentuais**: `band = round(20R) × 5`, limitado a 0–100.
6. Os pontos das atividades são `P_ativ = 2 × band` (máximo de 200).

Para uma dupla com 75% arredondados: `P_ativ=2×75=150`. 70% => 140; 65% => 130; 60% => 120; 55% => 110.

**Importante:** essa regra não reparte 200 pontos em 16 parcelas de 12,5. Já com as primeiras listas, uma dupla pode apresentar até 200 pontos, e o total **pode aumentar ou diminuir** com a entrada de atividades elegíveis e correções. As 16 listas constituem o planejamento letivo, mas a escala é sempre 0–200 segundo a **média das atividades elegíveis até o momento**. Não é o modelo acumulativo de `soma de notas × 1,25`.

## 3. Aula 02, Aula 03, Aula 04 e reposição

| Atividade | Questões | Pontos por questão | Nota máxima original | Como entra na média |
| --- | ---: | ---: | ---: | --- |
| Aula 02 | 4 | 2,0 | 8 | nota/8 |
| Aula 03 | 10 | 1,0 | 10 | nota/10 |
| Aula 04 | 10 | 1,0 | 10 | nota/10 |
| Reposição (planejada) | 20 | 0,5 | 10 | nota/10 na atividade substituída |

A plataforma usa o percentual de cada atividade; portanto 6/8 (75%) da Aula 02 tem peso igual a 7,5/10 (75%) de outra lista. Exemplo: 6/8, 8/10 e 9/10 -> (75%+80%+90%)/3 = 81,666...%, arredondado para **80%**, resultando em **160 pontos de atividades**.

Reposição: a intenção pedagógica é substituir uma ausência e **não funcionar como 17ª atividade bonificadora**. O código atual **não implementa automaticamente a substituição por uma outra sessão**; isso requer uma decisão e ajuste posterior em backend. Na calculadora, para projetar o resultado da reposição, introduza a nota na atividade original que será substituída.

## 4. Regra dos CTFs e total do ranking

Objetivo pedagógico: até 200 pontos no CTF 1, 250 no CTF 2 e 350 no CTF 3.

Com o saldo agregado de CTF do banco: `P_ctf = min(800, max(0, public_leaderboard.points))`.

`P_total = P_ativ + P_ctf` (máximo 1.000).

O teto **global de 800** é aplicado no frontend. Por falta de segmentação do saldo bruto por evento no cálculo atual, **não há garantia de tetos individuais** 200/250/350. Os eventos individuais devem ser auditados por `ctf_score_events` e, futuramente, categorizados.

**Mudança em relação ao legado anterior de CTF:** foi removida a normalização relativa ao líder, que convertia o maior saldo bruto da turma em 800 pontos mesmo antes da realização dos três CTFs. A parte **pedagógica legada** foi mantida exatamente no esquema de aproveitamento e faixas de 5%.

## 5. Preservação do ranking já exibido

Valores como 150, 140, 130 e 120 na ausência de saldo CTF continuam representados pela mesma fórmula `assessment_band × 2`. Isso **não é um saldo histórico imutável**. Podem mudar conforme notas/atividades válidas mudem.

A migração experimental `202611180001_preserve_historical_ranking.sql` foi preparada anteriormente, mas **não deve ser executada** para este modelo: congelar a pontuação e somar notas futuras duplicaria o benefício pedagógico e quebraria o comportamento legado. O frontend deliberadamente ignora suas colunas opcionais, caso tenham sido criadas anteriormente. Não se apagou nem recalculou nenhuma nota no Supabase nesta alteração.

## 6. Calculadora disponível aos alunos

Acesso: link **Calculadora de pontos** no cabeçalho ou na página do ranking (`#calculadora`).

- Inicie com as três atividades já aplicadas: Aula 02 de 0 a 8, Aula 03 e Aula 04 de 0 a 10.
- Abra **Preencher as 13 próximas atividades** para simular até 16 listas.
- Campo em branco = lista não aplicada (fora da média simulada).
- Campo preenchido com **0** = lista elegível sem entrega (incluída como zero).
- Três campos independentes para CTF 1 (0–200), CTF 2 (0–250), CTF 3 (0–350).
- A calculadora reproduz o arredondamento de 5% e mostra aproveitamento, pontos de atividades, pontos dos CTFs e total.
- A simulação é **local**, não solicita credenciais, não consulta notas privadas, não altera resultados, não salva nem transmite valores digitados.
- Pode divergir do ranking real caso existam sessões elegíveis não consideradas na simulação, tentativas corrigidas, reposições tratadas de modo diferente ou saldo CTF de eventos não identificado.

## 7. Implementação e trilha de auditoria

| Camada | Arquivo/tabela | Responsabilidade |
| --- | --- | --- |
| Supabase | `supabase/migrations/202611050006_weighted_rank.sql` | `assessment_band`, gatilhos de nota, entrega e estado da sessão; média arredondada |
| Supabase | `public.grades`, `public.attempts`, `public.activity_sessions` | Notas, tentativas efetivamente entregues e elegibilidade |
| Supabase | `public.ctf_score_events`, `public.public_leaderboard` | Registro CTF e saldo público |
| Frontend | `src/ranking.ts` | Soma `assessment_band × 2` com CTF bruto limitado a 800 |
| Frontend | `src/ScoreCalculator.tsx` | Simulação do cálculo no navegador |
| Frontend | `src/App.tsx` | Navegação, ranking público e entrada na calculadora |
| Testes | `tests/Ranking.test.ts` | Casos para faixas, máximo, atividades e ausência |

## 8. Casos para dúvidas frequentes

- **“A Aula 02 vale só oito?”** Sim. O sistema usa `nota/8`; 6/8 representa 75% do aproveitamento nessa atividade.
- **“Por que tenho 150 pontos?”** Seu percentual agregado arredondado está em 75% e `75 × 2 = 150`, quando não há contribuição CTF.
- **“Os 150 podem cair?”** Sim, se a média de aproveitamento cair; não é penalização administrativa nem perda de uma entrega.
- **“Uma atividade arquivada perde os pontos?”** Não. A migration original considera sessões arquivadas no cálculo pedagógico, mesmo que estejam ocultas na tabela de médias da administração.
- **“As atividades futuras já contam?”** Não, enquanto forem rascunho ou estiverem somente publicadas e ainda não elegíveis.
- **“A reposição vale 20?”** Não. São 20 questões de 0,5 ponto = 10 pontos totais. A equivalência com uma falta ainda exige configuração administrativa.
- **“O aluno vê a nota de outra dupla?”** Não; o ranking publica apenas o agregado e a calculadora não acessa dados individuais.
- **“Posso somar CTFs acima de 800?”** A visualização limita o componente CTF a 800. O backend exige controle futuro por evento para limitar cada fase individualmente.

## 9. Cuidados de implantação

1. **Não aplicar** a migration `202611180001_preserve_historical_ranking.sql` com este regulamento.
2. Verificar que a migration `202611050006_weighted_rank.sql` já está efetiva no Supabase antes da publicação.
3. Confirmar que o saldo `points` não contém pontuações de atividades indevidamente registradas como CTF.
4. Validar casos 75%→150, 70%→140, aula 02 6/8 e sem CTF, e depois CTF 1 com 100→250 pontos totais.
5. Conferir a compatibilidade de `#calculadora` no GitHub Pages, desktop e Live Boot.
6. Definir em uma próxima alteração a lógica da reposição e dos tetos CTF por evento na camada de dados.

**Fontes:** `src/ranking.ts`, `src/App.tsx`, `src/ScoreCalculator.tsx`, `supabase/migrations/202611050006_weighted_rank.sql`, `supabase/migrations/202611180001_preserve_historical_ranking.sql`, `tests/Ranking.test.ts`.
