import type { DraftQuestion } from "./utils";

export type AssessmentFields = {
  title: string;
  description: string;
  classIds: string[];
  timeLimit: string;
  backtracking: boolean;
  release: boolean;
};

export type LocalAssessmentDraft = {
  version: 1;
  fields: AssessmentFields;
  questions: DraftQuestion[];
  savedAt: string;
};

/** Private to this browser and the authenticated staff account. Never a shared draft. */
export function assessmentDraftKey(userId: string, activityId: string | null = null) {
  return `hpde:assessment-draft:v1:${userId}:${activityId ?? "new"}`;
}

export function blankAssessmentFields(): AssessmentFields {
  return {
    title: "",
    description: "",
    classIds: [],
    timeLimit: "",
    backtracking: true,
    release: false,
  };
}

function isQuestion(value: unknown): value is DraftQuestion {
  if (!value || typeof value !== "object") return false;
  const q = value as Partial<DraftQuestion>;
  return typeof q.prompt === "string" &&
    (q.explanation === undefined || typeof q.explanation === "string") &&
    (q.kind === "multiple_choice" || q.kind === "true_false") &&
    typeof q.points === "number" && Number.isFinite(q.points) &&
    Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 5 &&
    q.options.every((o) => !!o && typeof o.label === "string" && typeof o.is_correct === "boolean");
}

export function readAssessmentDraft(key: string): LocalAssessmentDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const d = data as Partial<LocalAssessmentDraft>;
    const f = d.fields;
    if (d.version !== 1 || !f ||
      typeof f.title !== "string" || typeof f.description !== "string" ||
      typeof f.timeLimit !== "string" ||
      !Array.isArray(f.classIds) || !f.classIds.every((id) => typeof id === "string") ||
      typeof f.backtracking !== "boolean" || typeof f.release !== "boolean" ||
      !Array.isArray(d.questions) || d.questions.length < 1 ||
      d.questions.length > 100 || !d.questions.every(isQuestion) ||
      typeof d.savedAt !== "string") return null;
    return d as LocalAssessmentDraft;
  } catch {
    return null; // blocked storage or older/corrupt payload; never crash the editor
  }
}

export function writeAssessmentDraft(
  key: string,
  fields: AssessmentFields,
  questions: DraftQuestion[],
): boolean {
  try {
    const meaningful = !!(fields.title.trim() || fields.description.trim() ||
      fields.classIds.length || fields.timeLimit ||
      !fields.backtracking || fields.release ||
      questions.length !== 1 ||
      questions.some((q) =>
        q.prompt.trim() || (q.explanation ?? "").trim() || q.points !== 10 ||
        q.kind !== "multiple_choice" || q.options.some((o) => o.label.trim())));
    if (!meaningful) {
      window.localStorage.removeItem(key);
      return true;
    }
    const payload: LocalAssessmentDraft = {
      version: 1, fields, questions, savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false; // private mode/quota errors should never destroy the current editor
  }
}

export function clearAssessmentDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage may be disabled.
  }
}
