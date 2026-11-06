import type { Rank } from "./api";

/** Ranking público: CTF é o eixo principal (até 800), aulas complementam (até 200).
 * O benchmark CTF usa o maior placar não negativo entre equipes ativas retornadas
 * pelo Supabase. Não há notas individuais nem respostas no resultado.
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
      return {
        ...r,
        rankingScore: Math.round(ctfScore + assessmentScore),
      };
    })
    .sort((a, b) =>
      b.rankingScore - a.rankingScore ||
      b.points - a.points ||
      b.solved_count - a.solved_count ||
      a.public_name.localeCompare(b.public_name, "pt-BR"),
    );
}
