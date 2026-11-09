import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPublicEnvironment, checkPublicArtifacts } from "./check-public.mjs";

const url = "https://example.supabase.co";
const publishable = "sb_publishable_example_public_key";
const anonJwt = (role) => [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url"),
  "a_fake_signature_for_validation_only",
].join(".");
const valid = { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publishable };

test("legitimate public Supabase keys and optional missing CI envs pass", () => {
  assert.deepEqual(checkPublicEnvironment(valid, { requireKeys: true }), []);
  assert.deepEqual(checkPublicEnvironment({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: anonJwt("anon") }, { requireKeys: true }), []);
  assert.deepEqual(checkPublicEnvironment({}, { requireKeys: false }), []);
  assert.notEqual(checkPublicEnvironment({}, { requireKeys: true }).length, 0);
});
test("service_role and secret keys cannot reach a GitHub Pages build", () => {
  for (const key of ["sb_secret_do_not_ship", anonJwt("service_role"), "invalid", ""]) {
    assert.notEqual(checkPublicEnvironment({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key }, { requireKeys: true }).length, 0);
  }
  assert.notEqual(checkPublicEnvironment({ ...valid, VITE_SUPABASE_SERVICE_ROLE: "danger" }).length, 0);
});
test("URL is HTTPS, exact Supabase host and contains no userinfo or query secrets", () => {
  for (const value of [
    "http://example.supabase.co",
    "https://example.supabase.co.evil.test",
    "https://evil.test",
    "https://example.supabase.co/?token=secret",
    "https://user:pass@example.supabase.co",
    "https://example.supabase.co/rest/v1",
    "https\\://example.supabase.co",
  ]) {
    assert.notEqual(checkPublicEnvironment({ ...valid, VITE_SUPABASE_URL: value }).length, 0);
  }
});
test("compiled public files are checked for secret keys, JWT service_role and source maps", () => {
  const dir = mkdtempSync(join(tmpdir(), "hackers-security-"));
  try {
    mkdirSync(join(dir, "assets"));
    const script = join(dir, "assets", "index.js");
    writeFileSync(script, 'const publicKey="' + publishable + '";');
    assert.deepEqual(checkPublicArtifacts(dir), []);
    writeFileSync(script, 'const secret="sb_secret_do_not_ship";');
    assert.ok(checkPublicArtifacts(dir).some((s) => s.includes("secreta")));
    writeFileSync(script, 'const token="' + anonJwt("service_role") + '";');
    assert.ok(checkPublicArtifacts(dir).some((s) => s.includes("service_role")));
    writeFileSync(script, 'const publicKey="' + publishable + '";');
    writeFileSync(join(dir, "assets", "index.js.map"), "{}");
    assert.ok(checkPublicArtifacts(dir).some((s) => s.includes("source maps")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
