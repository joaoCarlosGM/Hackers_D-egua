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
  it("preserves the prior scoreboard and only adds later graded work and CTF events", () => {
    const snapshot = team("Boitatá", 0, 60);
    snapshot.historical_score = 150;
    snapshot.ctf_baseline = 0;
    snapshot.future_activity_points = 8;
    const next = rankTeams([snapshot]);
    expect(next[0].rankingScore).toBe(158);
    const afterCtf = { ...snapshot, points: 25 };
    expect(rankTeams([afterCtf])[0].rankingScore).toBe(183);
    expect(snapshot.historical_score).toBe(150);
  });

  it("preserves existing historical scores when assessment averages change", () => {
    const snapshot = { ...team("BotoByte", 0, 60), historical_score: 150, ctf_baseline: 0, future_activity_points: 0 };
    expect(rankTeams([snapshot])[0].rankingScore).toBe(150);
    expect(rankTeams([{ ...snapshot, assessment_band: 10 }])[0].rankingScore).toBe(150);
  });

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
