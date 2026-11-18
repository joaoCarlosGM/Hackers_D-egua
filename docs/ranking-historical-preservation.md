# Preservação do ranking histórico — 18/11/2026

## Objetivo

O placar já publicado antes da revisão é uma referência **imutável**. As entregas antigas permanecem no banco; as próximas avaliações somam a nota real obtida em pontos (por exemplo, 4 questões valendo 8 permitem somar até 8). CTF futuro soma a diferença dos eventos CTF após o corte. Nenhuma nota individual é publicada no ranking.

## Implantação obrigatória

1. Faça backup do Supabase (incluindo `public.public_leaderboard`, `public.teams`, `public.grades`, `public.attempts` e `public.ctf_score_events`).
2. Confirme que a primeira imagem do ranking enviada pela coordenação corresponde aos nomes atuais das 19 duplas; o script exige correspondência unívoca dos nomes e **aborta integralmente** em caso de divergência.
3. Execute **uma única vez**, no SQL Editor do Supabase, o conteúdo de `supabase/migrations/202611180001_preserve_historical_ranking.sql`. Não execute os arquivos de teste na produção.
4. Confira que as 19 duplas receberam `historical_score` nos valores da imagem e que `future_activity_points=0` imediatamente após a implantação.
5. Atualize o GitHub Pages após a migration. O frontend tem fallback de leitura se o schema ainda não estiver atualizado, mas **não** restaura os valores históricos até que a migration seja aplicada.

## Regras

- Atividades anteriores ao `score_cutoff` não são somadas de novo, mesmo se a nota for corrigida ou a atividade for arquivada.
- Atividades criadas após o corte somam apenas a melhor nota **entregue** por dupla/atividade, usando `grades.points`, respeitando a pontuação cadastrada. Uma revisão de uma mesma atividade que tenha novo ID é outra atividade.
- Tentativas incompletas não contam. Arquivamento não apaga pontos obtidos.
- Eventos CTF posteriores ao corte somam somente a variação de `public_leaderboard.points` sobre `ctf_baseline`; o saldo anterior não é somado novamente.
- Os valores não são mais normalizados a cada atualização e podem ultrapassar 1.000.
- Duplas sem correspondência na imagem histórica conservam provisoriamente o cálculo legado até validação manual, sem inventar valor inicial. Duplas novas partem de zero.
- O percentual `assessment_band` continua disponível, mas deixa de definir a pontuação das duplas com histórico preservado.

## Consulta de verificação (somente leitura)

```sql
select t.public_name, r.historical_score, r.future_activity_points,
       (r.points-r.ctf_baseline) as future_ctf_delta,
       greatest(0,round(r.historical_score+r.future_activity_points+(r.points-r.ctf_baseline))) as ranking_total
from public.public_leaderboard r
join public.teams t on t.id=r.team_id
where r.historical_score is not null
order by ranking_total desc, t.public_name;
```

A implantação não altera a pontuação original dos eventos CTF nem a tabela de notas. **Não substitua a migration por um UPDATE manual dos pontos CTF.**
