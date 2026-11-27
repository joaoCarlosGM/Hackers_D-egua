/** CTF 1 Aula 7 official grading contract.
 * Pure domain logic, NOT authorization. Server must enforce same caps, round
 * membership, auth, timestamps, idempotency, and immutable audit.
 */
export const OFFICIAL_CTF1_CAPS = {
  mission1: 30, mission2: 60, mission3: 80,
  writeup1: 10, writeup2: 10, writeup3: 10,
} as const;
export type OfficialCtf1ScoreKey = keyof typeof OFFICIAL_CTF1_CAPS;
export type OfficialCtf1Scores = Record<OfficialCtf1ScoreKey, number>;
export const OFFICIAL_CTF1_MAX_POINTS = 200;
export const OFFICIAL_CTF1_DURATION_SECONDS = 3600;
export const OFFICIAL_CTF1_MISSION_COUNT = 3;

export function validateOfficialCtf1Scores(input: unknown): OfficialCtf1Scores {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Pontuação inválida: forneça as seis notas.");
  }
  const scores = input as Record<string, unknown>;
  const keys = Object.keys(OFFICIAL_CTF1_CAPS) as OfficialCtf1ScoreKey[];
  if (Object.keys(scores).length !== keys.length) {
    throw new Error("Pontuação incompleta ou com campos desconhecidos.");
  }
  const result = {} as OfficialCtf1Scores;
  for (const key of keys) {
    const value = scores[key];
    if (typeof value !== "number" || !Number.isInteger(value) ||
        value < 0 || value > OFFICIAL_CTF1_CAPS[key]) {
      throw new Error(`A nota de ${key} deve ser um inteiro entre 0 e ${OFFICIAL_CTF1_CAPS[key]}.`);
    }
    result[key] = value;
  }
  return result;
}
export function calculateOfficialCtf1Total(input: unknown): number {
  const scores = validateOfficialCtf1Scores(input);
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total > OFFICIAL_CTF1_MAX_POINTS) {
    throw new Error("Pontuação total excede os 200 pontos.");
  }
  return total;
}
/** Round clock is sourced from authoritative backend timestamps; don't use this
 * helper as a server permission check. */
export function officialCtf1RemainingSeconds(
  startedAt: string, serverNow: string, endedAt?: string | null,
): number {
  const start = Date.parse(startedAt), now = Date.parse(serverNow);
  if (!Number.isFinite(start) || !Number.isFinite(now)) throw new Error("Data inválida");
  if (endedAt) {
    const end = Date.parse(endedAt);
    if (!Number.isFinite(end)) throw new Error("Encerramento inválido");
    return Math.max(0, Math.floor((Math.min(end, now) - start < 0 ? 3600 : 0)));
  }
  return Math.max(0, OFFICIAL_CTF1_DURATION_SECONDS - Math.max(0, Math.floor((now - start) / 1000)));
}
