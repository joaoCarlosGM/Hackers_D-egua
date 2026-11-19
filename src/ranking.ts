import type { Rank } from "./api";

/** Progressive scoring: 16 regular assessments earn at most 12.5 points each.
 * The mean and rounded band remain informational, not pre-awarded points.
 */
export function assessmentPointsFromRatios(ratios: number[]) {
  if (!ratios.length) return { average: 0, band: 0, points: 0 };
  const average = ratios.reduce((sum, value) => sum +
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)), 0) / ratios.length;
  const band = Math.max(0, Math.min(100, Math.round(average * 20) * 5));
  const points = Math.round(ratios.reduce((sum, value) => sum +
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)), 0) * 1250) / 100;
  return { average, band, points: Math.min(200, points) };
}

export type WeightedRank = Rank & {
  /** Pontuação oficial: atividades (até 200) + CTFs (até 800) + eventual desempate. */
  rankingScore: number;
  /** Pontos sem desempate; usado para identificar empates reais. */
  baseScore: number;
  /** Exatamente 1 quando a dupla vence um empate pelo menor tempo conhecido de CTF. */
  timeTieBonus: 0 | 1;
};

/** Tempo só concede 1 ponto quando há empate real e um vencedor único.
 * Tempos ausentes nunca são presumidos; empate de tempos não gera bônus.
 * A classificação usa baseScore antes do bônus para não alterar confrontos
 * de duplas que já estavam separadas pela pontuação original.
 */
export function rankTeams(rows: Rank[]): WeightedRank[] {
  const base = rows.map(row => {
    const ctf = Math.max(0, Math.min(800, Number(row.points) || 0));
    const progressive = Math.max(0, Math.min(200, Number(row.assessment_points ?? 0) || 0));
    const recovery = Math.max(0, Number(row.recovery_bonus) || 0);
    const baseScore = Math.round((ctf + Math.min(200, progressive + recovery)) * 100) / 100;
    return { ...row, baseScore, rankingScore: baseScore, timeTieBonus: 0 as 0 | 1 };
  });
  const groups = new Map<number, typeof base>();
  for (const team of base) {
    const bucket = groups.get(team.baseScore) ?? [];
    bucket.push(team);
    groups.set(team.baseScore, bucket);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const timed = group.filter(team =>
      team.ctf_elapsed_seconds != null &&
      Number.isFinite(Number(team.ctf_elapsed_seconds)) &&
      Number(team.ctf_elapsed_seconds) >= 0
    );
    // Só pontua se há pelo menos dois tempos comparáveis.
    if (timed.length !== group.length || timed.length < 2) continue;
    const fastest = Math.min(...timed.map(team => Number(team.ctf_elapsed_seconds)));
    const winners = timed.filter(team => Number(team.ctf_elapsed_seconds) === fastest);
    if (winners.length !== 1) continue;
    winners[0].timeTieBonus = 1;
    winners[0].rankingScore = Math.min(1000, winners[0].baseScore + 1);
  }
  return base.sort((a, b) =>
    b.baseScore - a.baseScore ||
    b.timeTieBonus - a.timeTieBonus ||
    b.points - a.points ||
    b.solved_count - a.solved_count ||
    a.public_name.localeCompare(b.public_name, "pt-BR")
  );
}
