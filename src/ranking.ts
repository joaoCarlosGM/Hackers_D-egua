import type { Rank } from "./api";

/** Legacy educational score: arithmetic mean of eligible quiz percentages,
 * rounded in five-percentage-point bands, worth at most 200 points.
 * CTF balance remains independent and is capped at 800 points overall.
 */
export function assessmentPointsFromRatios(ratios: number[]) {
  if (!ratios.length) return { average: 0, band: 0, points: 0 };
  const average = ratios.reduce((sum, value) => sum +
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)), 0) / ratios.length;
  const band = Math.max(0, Math.min(100, Math.round(average * 20) * 5));
  return { average, band, points: band * 2 };
}

export type WeightedRank = Rank & { rankingScore: number };

export function rankTeams(rows: Rank[]): WeightedRank[] {
  return rows
    .map(row => {
      // Never use legacy historical_score: it was only a proposed snapshot
      // and would duplicate the already represented assessment component.
      const ctf = Math.max(0, Math.min(800, Number(row.points) || 0));
      const band = Math.max(0, Math.min(100, Number(row.assessment_band) || 0));
      return { ...row, rankingScore: Math.round(ctf + band * 2) };
    })
    .sort((a, b) => b.rankingScore - a.rankingScore ||
      b.points - a.points || b.solved_count - a.solved_count ||
      a.public_name.localeCompare(b.public_name, "pt-BR"));
}
