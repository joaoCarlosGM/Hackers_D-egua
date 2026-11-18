import { describe, expect, it } from "vitest";
import { assessmentPointsFromRatios, rankTeams } from "../src/ranking";
import type { Rank } from "../src/api";

function team(name: string, points: number, assessment_band: number, solved_count = 0): Rank {
  return { team_id: name, class_id: "poraque", public_name: name, points, solved_count, assessment_band };
}

describe("legacy ranking: 20% assessments, 80% CTF", () => {
  it("keeps the historical assessment display at 150 for a 75% band", () => {
    expect(rankTeams([team("Boitatá", 0, 75)])[0].rankingScore).toBe(150);
  });
  it("does not change when obsolete historical snapshot fields are present", () => {
    const a = { ...team("A", 0, 75), historical_score: 999, future_activity_points: 99 };
    expect(rankTeams([a])[0].rankingScore).toBe(150);
  });
  it("adds the raw CTF score up to the fixed 800-point cap", () => {
    expect(rankTeams([team("A", 300, 75)])[0].rankingScore).toBe(450);
    expect(rankTeams([team("B", 1000, 100)])[0].rankingScore).toBe(1000);
  });
  it("never scales a team's CTF score using the current leader", () => {
    expect(rankTeams([team("leader", 250, 0), team("other", 100, 0)])
      .find(row => row.public_name === "other")?.rankingScore).toBe(100);
  });
  it("normalizes Aula 02 (8 points) before averaging percentages", () => {
    const result = assessmentPointsFromRatios([6 / 8, 8 / 10, 9 / 10]);
    expect(result.average).toBeCloseTo(0.8166666667);
    expect(result.band).toBe(80);
    expect(result.points).toBe(160);
  });
  it("treats an eligible absence as zero, and excludes unassigned future activities", () => {
    expect(assessmentPointsFromRatios([1, 0]).points).toBe(100);
    expect(assessmentPointsFromRatios([1]).points).toBe(200);
    expect(assessmentPointsFromRatios([]).points).toBe(0);
  });
  it("returns a safe nonnegative aggregate and does not mutate records", () => {
    const items = [team("A", -10, 100), team("B", 0, -10)];
    expect(rankTeams(items).map(r => r.rankingScore)).toEqual([200, 0]);
    expect(items[0].points).toBe(-10);
  });
});
