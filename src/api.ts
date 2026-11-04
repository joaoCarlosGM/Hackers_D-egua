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
export type Class = { id: string; name: string; slug: string };
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
    submission_no: number;
  }[];
};
