// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  assessmentDraftKey, blankAssessmentFields, clearAssessmentDraft,
  readAssessmentDraft, writeAssessmentDraft,
} from "../src/assessmentDraft";
import { newQuestion } from "../src/utils";

beforeEach(() => window.localStorage.clear());

describe("local activity drafts", () => {
  it("restores every question and setting without a Supabase request", () => {
    const key = assessmentDraftKey("staff1");
    const fields = { ...blankAssessmentFields(), title: "Questões de Linux",
      description: "Atividade em duplas", classIds: ["c1", "c2"],
      timeLimit: "15", backtracking: false, release: true };
    const questions = [
      { ...newQuestion(), prompt: "O que faz ls?", points: 20,
        options: [{ label: "Lista arquivos", is_correct: true },
          { label: "Reinicia", is_correct: false }] },
      { ...newQuestion(), prompt: "O Linux é livre?", kind: "true_false" as const,
        options: [{ label: "Verdadeiro", is_correct: true },
          { label: "Falso", is_correct: false }] },
    ];
    expect(writeAssessmentDraft(key, fields, questions)).toBe(true);
    const restored = readAssessmentDraft(key);
    expect(restored?.fields).toEqual(fields);
    expect(restored?.questions).toEqual(questions);
    expect(restored?.savedAt).toBeTruthy();
  });
  it("isolates drafts by account and edited activity", () => {
    const key = assessmentDraftKey("staff1");
    writeAssessmentDraft(key, { ...blankAssessmentFields(), title: "Rascunho A" }, [newQuestion()]);
    expect(readAssessmentDraft(assessmentDraftKey("staff2"))).toBeNull();
    expect(readAssessmentDraft(assessmentDraftKey("staff1", "saved-activity"))).toBeNull();
    clearAssessmentDraft(key);
    expect(readAssessmentDraft(key)).toBeNull();
  });
  it("rejects malformed or incompatible local payloads safely", () => {
    const key = assessmentDraftKey("staff1");
    window.localStorage.setItem(key, "{not-json");
    expect(readAssessmentDraft(key)).toBeNull();
    window.localStorage.setItem(key, JSON.stringify({ version: 1, fields: {}, questions: [] }));
    expect(readAssessmentDraft(key)).toBeNull();
  });
  it("does not leave an empty draft on shared computers", () => {
    const key = assessmentDraftKey("staff1");
    writeAssessmentDraft(key, { ...blankAssessmentFields(), title: "Temporary" }, [newQuestion()]);
    writeAssessmentDraft(key, blankAssessmentFields(), [newQuestion()]);
    expect(readAssessmentDraft(key)).toBeNull();
  });
});
