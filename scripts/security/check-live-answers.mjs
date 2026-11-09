import { createClient } from "@supabase/supabase-js";
import { checkPublicEnvironment } from "./check-public.mjs";

/**
 * Read-only production check. No service role, SQL Editor, credentials or writes.
 * Runs as an anonymous visitor with the exact public key embedded in Pages.
 * Fail closed: never publish if the public role can query question answer tables.
 */
const envIssues = checkPublicEnvironment(process.env, { requireKeys: true });
if (envIssues.length) {
  for (const issue of envIssues) process.stderr.write("Segurança: " + issue + "\n");
  process.exit(1);
}

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

const forbidden = [
  ["question_options", "id,is_correct"],
  ["questions", "id,explanation"],
  ["answers", "id,option_id"],
  ["grades", "attempt_id,points"],
  ["attempts", "id,team_id"],
  ["team_members", "id,full_name"],
  ["admin_users", "user_id,role"],
];

let violations = 0;
for (const [table, fields] of forbidden) {
  try {
    const { error } = await client.from(table).select(fields).limit(1);
    if (!error) {
      process.stderr.write("FALHA: visitante anônimo conseguiu consultar public." + table + ". Publicação bloqueada.\n");
      violations += 1;
    } else if (!["42501", "PGRST205", "PGRST106"].includes(error.code)) {
      process.stderr.write("FALHA: resposta inesperada de public." + table + " (código " + (error.code ?? "indefinido") + "). Publicação bloqueada.\n");
      violations += 1;
    } else {
      process.stdout.write("OK: leitura anônima de public." + table + " negada.\n");
    }
  } catch {
    process.stderr.write("FALHA: não foi possível verificar public." + table + "; publicação bloqueada.\n");
    violations += 1;
  }
}

const nonExistingId = "00000000-0000-0000-0000-000000000000";
try {
  const { error } = await client.rpc("assessment_results", { p_activity_id: nonExistingId });
  if (!error) {
    process.stderr.write("FALHA: visitante alcançou a RPC privada de resultados.\n");
    violations += 1;
  } else if (!["42501", "PGRST202", "PGRST301"].includes(error.code)) {
    process.stderr.write("FALHA: resposta inesperada da RPC privada (código " + (error.code ?? "indefinido") + ").\n");
    violations += 1;
  } else {
    process.stdout.write("OK: RPC privada de resultados inacessível a visitantes.\n");
  }
} catch {
  process.stderr.write("FALHA: RPC privada de resultados não pôde ser testada.\n");
  violations += 1;
}

const sessionId = process.env.SECURITY_PROBE_SESSION_ID;
if (sessionId) {
  try {
    const { data, error } = await client.rpc("public_activity", { p_session_id: sessionId });
    if (error || !data || data.error || !Array.isArray(data.questions) || !data.questions.length) {
      process.stderr.write("FALHA: não foi possível verificar a resposta pública da atividade informada.\n");
      violations += 1;
    } else {
      const unsafeKeys = new Set([
        "is_correct", "correct", "correct_option_id", "answer_key",
        "explanation", "feedback", "max_points", "selected",
      ]);
      const findLeak = (node) => {
        if (!node || typeof node !== "object") return false;
        if (Array.isArray(node)) return node.some(findLeak);
        return Object.entries(node).some(([key, value]) => unsafeKeys.has(key) || findLeak(value));
      };
      if (findLeak(data)) {
        process.stderr.write("FALHA: o RPC público retornou campos de gabarito ou resultado.\n");
        violations += 1;
      } else {
        process.stdout.write("OK: resposta pública da atividade contém somente questões sem gabarito.\n");
      }
    }
  } catch {
    process.stderr.write("FALHA: não foi possível verificar a resposta da atividade.\n");
    violations += 1;
  }
}

if (violations) {
  process.stderr.write("Verificação de respostas falhou em " + violations + " etapa(s). Nenhuma alteração foi feita no Supabase.\n");
  process.exitCode = 1;
} else {
  process.stdout.write("PASS: permissões anônimas para dados de avaliação verificadas no Supabase conectado.\n");
}
