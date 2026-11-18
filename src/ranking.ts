import type { Rank } from "./api";

/** Ranking público: CTF é o eixo principal (até 800), aulas complementam (até 200).
 * Placar histórico congelado + novas notas de atividades + novos eventos CTF.
 * O cálculo ponderado anterior é somente fallback para duplas sem snapshot.
 * Não há notas individuais nem respostas no resultado.
 */
export type WeightedRank = Rank & {
  rankingScore: number;
};

export function rankTeams(rows: Rank[]): WeightedRank[] {
  const maxCtf = Math.max(0, ...rows.map((r) => Number(r.points) || 0));
  return rows
    .map((r) => {
      const ctfPoints = Math.max(0, Number(r.points) || 0);
      const assessmentBand = Math.max(0, Math.min(100, Number(r.assessment_band) || 0));
      const ctfScore = maxCtf > 0 ? 800 * ctfPoints / maxCtf : 0;
      const assessmentScore = 200 * assessmentBand / 100;
      // Snapshot histórico é imutável; o complemento usa somente entregas
      // de atividades criadas após a migração. Eventos CTF futuros somam
      // a diferença sobre o saldo existente no instante do snapshot.
      const historicalScore = r.historical_score;
      const preservedScore = historicalScore == null ? null : Math.max(0, Number(historicalScore));
      const futureQuiz = Math.max(0, Number(r.future_activity_points) || 0);
      const futureCtf = ctfPoints - (Number(r.ctf_baseline) || 0);
      return {
        ...r,
        rankingScore: Math.max(0, Math.round(preservedScore === null
          ? ctfScore + assessmentScore
          : preservedScore + futureQuiz + futureCtf)),
      };
    })
    .sort((a, b) =>
      b.rankingScore - a.rankingScore ||
      b.points - a.points ||
      b.solved_count - a.solved_count ||
      a.public_name.localeCompare(b.public_name, "pt-BR"),
    );
}
