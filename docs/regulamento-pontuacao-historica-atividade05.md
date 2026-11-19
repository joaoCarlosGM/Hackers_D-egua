# Regulamento operacional — pontos históricos e Atividade 05

**Data do marco:** 18/11/2026. **Atividade seguinte prevista:** 19/11/2026.
**Origem:** captura do ranking fornecida pela coordenação, conferida com `public.public_leaderboard` no Supabase em 18/11/2026.

## 1. Marco histórico oficial (congelado)

Os pontos abaixo são a pontuação de **atividades** aceita e exibida antes das próximas avaliações, e **não serão recalculados** pelos resultados de Aulas 02, 03 e 04. A atividade arquivada «Aula 01 (revisão)» foi um teste e não entra no cálculo.

| Dupla | Base histórica (pontos) |
| --- | ---: |
| Boitatá | 120 |
| BotoByte | 120 |
| Carimboot | 120 |
| divas | 120 |
| Paysandu | 120 |
| Pororoca | 120 |
| Erro 404 | 110 |
| fulaninhos | 110 |
| Mapinguari | 110 |
| Momonga^2 | 110 |
| anavi | 100 |
| equipe Neon | 90 |
| Mambanegra | 90 |
| anonymous | 80 |
| Everlong | 70 |
| BruVi | 60 |
| Mingau do careca | 40 |
| Wasabi | 40 |
| Poderosas | 20 |

**Dupla de teste «samba»:** inativa e oculta, sem pontuação histórica.

## 2. Distribuição e cálculo de avaliações futuras

- **16 atividades regulares**, distribuídas em **Módulo 1 (6)**, **Módulo 2 (5)** e **Módulo 3 (5)**.
- **200 pontos é o teto acumulado de atividades**, incluindo a base histórica, incrementos futuros e bônus de recuperação.
- Os resultados de Aulas 02, 03 e 04 ficam congelados; **não geram pontos novos**. Sessões futuras elegíveis de status `open` ou `closed`, fora do conjunto congelado, podem gerar pontuação.
- **Nota original (0–10) não é o mesmo que pontos do ranking.** Para uma atividade regular futura de nota máxima 10, a função no banco transforma o aproveitamento em uma faixa arredondada de 5 pontos percentuais e concede até **12,50 pontos**.
- A pontuação de uma nova atividade é dada por:

  `aproveitamento = nota obtida / nota máxima`

  `aproveitamento_arredondado_% = 5 * round(20 * aproveitamento)`

  `pontos_novos = aproveitamento_arredondado_% / 8`

- O bônus é proporcional: 100% = +12,50; 90% = +11,25; 80% = +10,00; 60% = +7,50; 40% = +5,00; 20% = +2,50; zero = +0. O valor é agregado à base anterior, respeitando o teto de 200.
- A **média acadêmica** e o **aproveitamento arredondado médio** permanecem calculados à parte para a equipe pedagógica. Eles **não alteram o marco histórico**.

## 3. Exemplo da Atividade 05, nota máxima 10

| Nota da Atividade 05 | Aproveitamento arredondado | Acréscimo |
| ---: | ---: | ---: |
| 0/10 | 0% | +0,00 |
| 2/10 | 20% | +2,50 |
| 4/10 | 40% | +5,00 |
| 6/10 | 60% | +7,50 |
| 8/10 | 80% | +10,00 |
| 9/10 | 90% | +11,25 |
| 10/10 | 100% | +12,50 |

Exemplo, **Boitatá** com base **120**:
- Nota **10/10** → **132,50** pontos no ranking
- Nota **8/10** → **130,00** pontos no ranking
- Nota **6/10** → **127,50** pontos no ranking
- Não entrega / nota zero → **120,00** pontos (sem perda retroativa)

Os mesmos exemplos valem para BotoByte, Carimboot, divas, Paysandu e Pororoca, que têm base histórica de 120. **Erro 404** com nota 10/10 vai de 110 para 122,50; **Poderosas** de 20 para 32,50.

### Atenção sobre o limite de 200

Este é um **marco histórico especial**, não a recomputação proporcional das 16 atividades. Uma dupla que já tem **120** dispõe de apenas **80 pontos restantes** no componente de atividades. Com novas avaliações excelentes, pode chegar ao teto de 200 antes de concluir todas as 16. Outras avaliações poderão continuar existindo e compor as notas acadêmicas, mas sem acrescentar pontos além do teto. **Esse efeito deve ser explicado pela coordenação e é esperado pela regra aprovada de preservação do ranking.**

## 4. Recuperação e CTF

- Cada módulo permite **uma recuperação**, com **20 questões**, nota máxima **10**, **20 minutos**, apenas para duplas elegíveis por falta em atividades regulares encerradas do mesmo módulo. A recuperação **não participa da média regular** e gera bônus de até **+10 pontos por módulo**, sempre dentro do teto de 200.
- O agregado CTF é independente, com teto de **800 pontos** distribuídos entre 3 CTFs: 200, 250 e 350.
- O menor tempo válido de resolução dos CTFs dá **um ponto de desempate** apenas para pontuações-base idênticas, com limite total de 1000. Tempos não registrados não são presumidos.
- A calculadora é **exclusiva da Administração**. Não há link público no ranking.

## 5. Regra técnica e auditabilidade

- `public.public_leaderboard.legacy_assessment_points`: pontos históricos congelados, definidos explicitamente pela captura.
- `app_private.ranking_baseline_sessions`: contém IDs das três sessões congeladas. **Não editar nem remover** essas linhas na operação normal.
- `public.public_leaderboard.future_activity_points`: soma das atividades regulares posteriores ao marco, recalculada em caso de entrega, correção de nota ou transição de sessão.
- `public.public_leaderboard.recovery_bonus`: bônus das recuperações, separado da média.
- `public.public_leaderboard.points`: pontos CTF.
- `src/ranking.ts`: exibe `points + min(200, legacy_assessment_points + future_activity_points + recovery_bonus)`, com critérios de desempate descritos acima.
- `public.public_leaderboard.assessment_points` e `assessment_band`: indicadores matemáticos da média atual; **não devem ser somados** ao ranking histórico, pois isso duplicaria notas antigas.
- Migration aplicada: `supabase/migrations/202611190006_freeze_published_ranking.sql` (histórico registrado no Supabase como `freeze_published_ranking_baseline`).

## 6. Checklist para aplicar a Atividade 05

1. Cadastrar a Atividade 05 como **regular**, no **Módulo 1**, com nota total 10.
2. Confirmar turmas corretas; salvar rascunho e publicar/abrir no horário da aula.
3. Confirmar que a atividade não foi arquivada e não pertence às sessões já congeladas.
4. Após entregas, consultar o painel administrativo e conferir para cada dupla: **base + acréscimo + eventual recuperação**, com limite de 200 nas atividades.
5. Usar uma dupla com base 120 e nota 10/10 como teste de aceitação: o ranking deverá mostrar **132,50**. Se houver pontuação fora da fórmula, suspender a contabilização da atividade e revisar os gatilhos do banco antes de novas edições.

**Nota sobre transparência:** a pontuação oficial e os critérios devem estar disponíveis à coordenação; mudanças não devem ser apresentadas como notas antigas reprocessadas. A manutenção da base histórica não altera nem apaga o histórico das avaliações.
