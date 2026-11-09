import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Prevent accidental publication of privileged Supabase credentials.
 * Never output credential contents, including on failure.
 * This guard supplements (does not replace) Supabase RLS policies.
 */
function isSafeClientKey(value) {
  if (value.startsWith("sb_publishable_") && value.length > "sb_publishable_".length) {
    return true;
  }
  // Legacy JWT anon key is permitted while the project migrates to publishable keys.
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload?.role === "anon";
  } catch {
    return false;
  }
}

export function checkPublicEnvironment(env, { requireKeys = false } = {}) {
  const issues = [];
  for (const name of Object.keys(env)) {
    if (/^VITE_/i.test(name) && /(SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY|DATABASE_URL|DB_URI|ADMIN_TOKEN)/i.test(name)) {
      issues.push("A variável de frontend tem um nome de credencial privilegiada.");
    }
  }
  const url = env.VITE_SUPABASE_URL ?? "";
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!url && !key && !requireKeys) return issues;
  if (!url || !key) {
    issues.push("A URL e a chave pública do Supabase precisam estar ambas configuradas.");
    return issues;
  }
  if (url !== url.trim() || key !== key.trim()) {
    issues.push("As variáveis públicas não podem conter espaços ao redor.");
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" ||
      !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== "/" || parsed.port) {
      issues.push("A URL precisa ser uma origem HTTPS válida de projeto Supabase.");
    }
  } catch {
    issues.push("A URL pública do Supabase é inválida.");
  }
  if (!isSafeClientKey(key)) {
    issues.push("A variável pública precisa ser sb_publishable_ ou JWT anon; service_role e sb_secret_ são proibidas.");
  }
  return issues;
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else files.push(path);
  }
  return files;
}

export function checkPublicArtifacts(distDir) {
  const issues = [];
  const files = sourceFiles(distDir);
  for (const file of files) {
    if (/\.map$/i.test(file)) {
      issues.push("O build publicou source maps; desative-os antes do deploy.");
      continue;
    }
    if (!/\.(?:html|js|css|json|txt|svg)$/i.test(file)) continue;
    const data = readFileSync(file, "utf8");
    if (/\bsb_secret_[a-zA-Z0-9_-]+/g.test(data)) {
      issues.push("O build contém uma chave Supabase secreta.");
    }
    // Detect accidental legacy service_role tokens without emitting token data.
    const candidates = data.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
    if (candidates.some((jwt) => {
      try {
        const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
        return payload?.role === "service_role";
      } catch { return false; }
    })) {
      issues.push("O build contém um JWT service_role.");
    }
  }
  return [...new Set(issues)];
}

const launched = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launched) {
  const command = process.argv[2];
  let issues;
  if (command === "env") {
    issues = checkPublicEnvironment(process.env, { requireKeys: process.argv.includes("--require") });
  } else if (command === "dist") {
    issues = checkPublicArtifacts(resolve("dist"));
  } else {
    issues = ["Use: node scripts/security/check-public.mjs env [--require] ou dist"];
  }
  if (issues.length) {
    for (const issue of issues) process.stderr.write("Segurança: " + issue + "\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Verificação de exposição pública: aprovada.\n");
  }
}
