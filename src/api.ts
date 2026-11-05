import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(
  url && key && !url.includes("SEU-PROJETO") && !key.includes("SUBSTITUA"),
);
// No fallback project, demo database or service-role key.
export const supabase = configured
  ? createClient(url, key, { auth: { detectSessionInUrl: false } })
  : null;
export async function rpc<T>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error("Configure a conexão com o Supabase.");
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in data)
    throw new Error(String(data.error));
  return data as T;
}
export type ClassStatus = "active" | "archived";
export type Class = {
  id: string;
  name: string;
  slug: string;
  status: ClassStatus;
};
export type ManagedClass = Class & {
  team_count: number;
  attempt_count: number;
  activity_count: number;
  can_delete: boolean;
};
export type Team = {
  team_id: string;
  class_id: string;
  public_name: string;
  access_code: string;
  token: string;
  credential?: string;
};
export type Question = {
  id: string;
  prompt: string;
  kind: "multiple_choice" | "true_false";
  points: number;
  options: { id: string; label: string }[];
};
export type Activity = {
  id: string;
  title: string;
  description: string;
  class_ids: string[];
  closes_at: string | null;
  questions: Question[];
  time_limit_seconds?: number | null;
  allow_backtracking?: boolean;
  access_code?: string;
};
export type Rank = {
  team_id: string;
  class_id: string;
  public_name: string;
  points: number;
  solved_count: number;
};
export type History = {
  team: Omit<Team, "token">;
  attempts: {
    id: string;
    activity_session_id: string;
    title: string;
    submitted_at: string | null;
    expired_at?: string | null;
    submission_no: number;
  }[];
};
export type Participation = {
  attempt_id: string;
  submitted?: boolean;
  expired?: boolean;
  deadline?: string | null;
  server_now?: string;
  progress?: { answers: Record<string, string>; current_question: number };
};
export type AssessmentStatus =
  "draft" | "published" | "open" | "closed" | "archived";
export type AssessmentResults = {
  title: string;
  registered_teams: number;
  sessions: {
    id: string;
    status: AssessmentStatus;
    access_code: string;
    release_results: boolean;
  }[];
  participants: {
    attempt_id: string;
    team_id: string;
    public_name: string;
    class_name: string;
    members: string[];
    started_at: string;
    submitted_at: string | null;
    expired_at?: string | null;
    submission_no: number;
    retry_available: boolean;
    points: number | null;
    max_points: number | null;
    feedback: string | null;
    answers:
      | {
          question_id: string;
          prompt: string;
          selected: string;
          correct: boolean;
          explanation: string;
        }[]
      | null;
  }[];
  question_stats: {
    id: string;
    prompt: string;
    responses: number;
    correct: number;
  }[];
};
