import { describe, expect, it } from "vitest";
import { calculateActivityAccuracy, type ActivityAccuracyData } from "../src/ActivityAccuracy";
import type { Class } from "../src/api";

const classes: Class[] = [
  { id: "c1", name: "Poraquê", slug: "poraque", status: "active" },
  { id: "c2", name: "Pitiú", slug: "pitiu", status: "active" },
];

function exampleData(): ActivityAccuracyData {
  return {
    activities: [
      { id: "a1", title: "Aula 02 — Terminal" },
      { id: "a2", title: "Aula 03 — Redes" },
    ],
    sessions: [
      { id: "s1", activity_id: "a1", class_ids: ["c1"], status: "closed" },
      { id: "s2", activity_id: "a2", class_ids: ["c2"], status: "closed" },
    ],
    teams: [
      { id: "t1", class_id: "c1" },
      { id: "t2", class_id: "c1" },
      { id: "t3", class_id: "c2" },
    ],
    attempts: [
      { id: "old", team_id: "t1", activity_session_id: "s1", submitted_at: "2026-11-10T12:00:00Z" },
      { id: "new", team_id: "t1", activity_session_id: "s1", submitted_at: "2026-11-11T12:00:00Z" },
      { id: "partial", team_id: "t2", activity_session_id: "s1", submitted_at: "2026-11-11T12:00:00Z" },
      { id: "other", team_id: "t3", activity_session_id: "s2", submitted_at: "2026-11-11T12:00:00Z" },
      { id: "pending", team_id: "t2", activity_session_id: "s1", submitted_at: null },
    ],
    grades: [
      { attempt_id: "old", points: 0, max_points: 20 },
      { attempt_id: "new", points: 20, max_points: 20 },
      { attempt_id: "partial", points: 10, max_points: 20 },
      { attempt_id: "other", points: 10, max_points: 10 },
      { attempt_id: "pending", points: 20, max_points: 20 },
    ],
    questions: [
      { id: "q1", activity_id: "a1" },
      { id: "q2", activity_id: "a1" },
      { id: "q3", activity_id: "a2" },
    ],
    options: [
      { id: "o1", question_id: "q1", is_correct: true },
      { id: "o2", question_id: "q1", is_correct: false },
      { id: "o3", question_id: "q2", is_correct: true },
      { id: "o4", question_id: "q2", is_correct: false },
      { id: "o5", question_id: "q3", is_correct: true },
    ],
    answers: [
      { attempt_id: "old", question_id: "q1", option_id: "o2" },
      { attempt_id: "old", question_id: "q2", option_id: "o4" },
      { attempt_id: "new", question_id: "q1", option_id: "o1" },
      { attempt_id: "new", question_id: "q2", option_id: "o3" },
      { attempt_id: "partial", question_id: "q1", option_id: "o1" },
      { attempt_id: "partial", question_id: "q2", option_id: "o4" },
      { attempt_id: "other", question_id: "q3", option_id: "o5" },
      { attempt_id: "pending", question_id: "q1", option_id: "o1" },
      { attempt_id: "pending", question_id: "q2", option_id: "o3" },
    ],
  };
}

describe("private activity accuracy", () => {
  it("calculates correct-answer percentages by class and activity, not by CTF points", () => {
    const result = calculateActivityAccuracy(classes, exampleData());
    expect(result.map((row) => [row.title, row.className, row.submittedTeams, row.correctAnswers,
      row.totalQuestions, row.percent])).toEqual([
      ["Aula 02 — Terminal", "Poraquê", 2, 3, 4, 75],
      ["Aula 03 — Redes", "Pitiú", 1, 1, 1, 100],
    ]);
  });

  it("uses only the best submitted attempt, ignoring unsubmitted retry answers", () => {
    const rows = calculateActivityAccuracy(classes, exampleData(), "c1");
    expect(rows).toHaveLength(1);
    expect(rows[0].submittedTeams).toBe(2);
    expect(rows[0].percent).toBe(75);
  });

  it("shows an activity without deliveries as no average rather than zero percent", () => {
    const data = exampleData();
    data.attempts = [];
    const rows = calculateActivityAccuracy(classes, data, "c2");
    expect(rows[0]).toMatchObject({
      submittedTeams: 0, correctAnswers: 0, totalQuestions: 0, percent: null,
    });
  });

  it("does not include draft activities or answers from an unrelated class", () => {
    const data = exampleData();
    data.sessions[1].status = "draft";
    expect(calculateActivityAccuracy(classes, data).map((row) => row.classId)).toEqual(["c1"]);
    expect(calculateActivityAccuracy(classes, data, "c2")).toHaveLength(0);
  });
});
