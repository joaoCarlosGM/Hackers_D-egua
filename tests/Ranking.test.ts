import { describe, expect, it } from "vitest";
import { assessmentPointsFromRatios, rankTeams } from "../src/ranking";
import type { Rank } from "../src/api";

function team(name: string, points: number, assessment_band: number, solved_count = 0): Rank {
  return { team_id: name, class_id: "poraque", public_name: name, points, solved_count, assessment_band };
}

describe("legacy ranking: 20% assessments, 80% CTF", () => {
  it("keeps the historical assessment display at 150 for a 75% band", () => {
    expect(rankTeams([{ ...team("Boitatá", 0, 75), legacy_assessment_points: 120 }])[0].rankingScore).toBe(120);
  });
  it("does not change when obsolete historical snapshot fields are present", () => {
    const a = { ...team("A", 0, 75), historical_score: 999, future_activity_points: 99 };
    expect(rankTeams([{...a, legacy_assessment_points: 120}])[0].rankingScore).toBe(120);
  });
  it("awards up to ten recovery points without changing the legacy mean", () => {
    expect(rankTeams([{ ...team("Dupla", 0, 75), legacy_assessment_points: 120, future_activity_points: 12.5, recovery_bonus: 8 }])[0].rankingScore).toBe(140.5);
    expect(rankTeams([{ ...team("Dupla", 0, 100), legacy_assessment_points: 190, future_activity_points: 12.5, recovery_bonus: 10 }])[0].rankingScore).toBe(200);
    expect(rankTeams([{ ...team("Dupla", 800, 100), legacy_assessment_points: 200, recovery_bonus: 10 }])[0].rankingScore).toBe(1000);
  });
  it("adds the raw CTF score up to the fixed 800-point cap", () => {
    expect(rankTeams([{...team("A", 300, 75),legacy_assessment_points:120}])[0].rankingScore).toBe(420);
    expect(rankTeams([{...team("B", 1000, 100),legacy_assessment_points:200}])[0].rankingScore).toBe(1000);
  });
  it("preserves historical scores and adds only new points", () => {
    const row = { ...team("BotoByte", 0, 100), legacy_assessment_points: 120,
      assessment_points: 37.5, future_activity_points: 0 };
    expect(rankTeams([row])[0].rankingScore).toBe(120);
    expect(rankTeams([{...row, future_activity_points: 12.5}])[0].rankingScore).toBe(132.5);
    expect(rankTeams([{...row, future_activity_points: 200}])[0].rankingScore).toBe(200);
  });
  it("never scales a team's CTF score using the current leader", () => {
    expect(rankTeams([team("leader", 250, 0), team("other", 100, 0)])
      .find(row => row.public_name === "other")?.rankingScore).toBe(100);
  });
  it("adds exactly one tie-break point for the uniquely fastest CTF time", () => {
    const slower = { ...team("Lento", 150, 75), ctf_elapsed_seconds: 1200 };
    const faster = { ...team("Rápido", 150, 75), ctf_elapsed_seconds: 840 };
    const ranked = rankTeams([slower, faster]);
    expect(ranked.map(row => row.public_name)).toEqual(["Rápido", "Lento"]);
    expect(ranked[0].baseScore).toBe(150);
    expect(ranked[0].rankingScore).toBe(151);
    expect(ranked[0].timeTieBonus).toBe(1);
    expect(ranked[1].rankingScore).toBe(150);
    const higher = { ...team("Mais pontos", 152, 75), ctf_elapsed_seconds: 1800 };
    expect(rankTeams([faster, higher]).map(row => row.timeTieBonus)).toEqual([0, 0]);
  });
  it("does not grant a point when there is only one known time or times are equal", () => {
    const unknown = team("Sem tempo", 150, 75);
    const measured = { ...team("Medido", 150, 75), ctf_elapsed_seconds: 900 };
    expect(rankTeams([unknown, measured]).every(row => row.timeTieBonus === 0)).toBe(true);
    const tied = { ...team("Também medido", 150, 75), ctf_elapsed_seconds: 900 };
    expect(rankTeams([measured, tied]).every(row => row.timeTieBonus === 0)).toBe(true);
  });
  it("does not exceed the official 1000-point cap at a perfect-score tie", () => {
    const a = { ...team("A", 800, 100), legacy_assessment_points: 200, ctf_elapsed_seconds: 120 };
    const b = { ...team("B", 800, 100), legacy_assessment_points: 200, ctf_elapsed_seconds: 240 };
    const ranking = rankTeams([a,b]);
    expect(ranking[0].timeTieBonus).toBe(1);
    expect(ranking[0].rankingScore).toBe(1000);
    expect(ranking[1].rankingScore).toBe(1000);
  });
  it("normalizes Aula 02 (8 points) before averaging percentages", () => {
    const result = assessmentPointsFromRatios([6 / 8, 8 / 10, 9 / 10]);
    expect(result.average).toBeCloseTo(0.8166666667);
    expect(result.band).toBe(80);
    expect(result.points).toBe(30);
  });
  it("uses the rounded band over only the applied share of the 16 activities", () => {
    expect(assessmentPointsFromRatios([1, 1, 1]).points).toBe(37.5);
    expect(assessmentPointsFromRatios([1, 1, 0.8]).band).toBe(95);
    expect(assessmentPointsFromRatios([1, 1, 0.8]).points).toBe(35.63);
  });
  it("treats an eligible absence as zero, and excludes unassigned future activities", () => {
    expect(assessmentPointsFromRatios([1, 0]).points).toBe(12.5);
    expect(assessmentPointsFromRatios([1]).points).toBe(12.5);
    expect(assessmentPointsFromRatios([]).points).toBe(0);
  });
  it("returns a safe nonnegative aggregate and does not mutate records", () => {
    const items = [team("A", -10, 100), team("B", 0, -10)];
    expect(rankTeams(items).map(r => r.rankingScore)).toEqual([0, 0]);
    expect(items[0].points).toBe(-10);
  });
});
