import { describe, expect, it } from "vitest";
import { rankTeams } from "../src/ranking";
import type { Rank } from "../src/api";

function team(name: string, points: number, assessment_band: number, solved_count = 0): Rank {
  return {
    team_id: name,
    class_id: "poraque",
    public_name: name,
    points,
    solved_count,
    assessment_band,
  };
}

describe("weighted public ranking: CTF 80%, assessments 20%", () => {
  it("allocates 800 points to the CTF leader and up to 200 to assessments", () => {
    const result = rankTeams([
      team("CTF Líder", 1000, 20, 8),
      team("Complementar", 600, 80, 4),
    ]);
    expect(result.map((r) => [r.public_name, r.rankingScore])).toEqual([
      ["CTF Líder", 840],
      ["Complementar", 640],
    ]);
  });
  it("scores quizzes without CTF while keeping the maximum complementary weight", () => {
    const result = rankTeams([team("Equipe A", 0, 75), team("Equipe B", 0, 100)]);
    expect(result.map((r) => r.rankingScore)).toEqual([200, 150]);
  });
  it("prevents negative CTF penalties from producing a negative public total", () => {
    const result = rankTeams([team("Penalizada", -10, 50), team("Desafio", 100, 0)]);
    expect(result.map((r) => r.rankingScore)).toEqual([800, 100]);
  });
  it("ranks by composite score and uses raw CTF points to break ties", () => {
    const result = rankTeams([team("B", 50, 100), team("A", 100, 0)]);
    expect(result.map((r) => [r.public_name, r.rankingScore])).toEqual([
      ["A", 800],
      ["B", 600],
    ]);
  });
  it("never mutates the original rows used by the UI and rounds bounded inputs", () => {
    const items = [team("A", 10, 130), team("B", 0, -40)];
    const result = rankTeams(items);
    expect(result[0].rankingScore).toBe(1000);
    expect(result[1].rankingScore).toBe(0);
    expect(items[0].assessment_band).toBe(130);
  });
});
