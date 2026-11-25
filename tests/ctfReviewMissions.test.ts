import { describe, expect, it } from "vitest";
import { createHash, createCipheriv, pbkdf2Sync } from "node:crypto";
import { reviewMissions, explainReviewCommand } from "../src/ctfReviewMissions";

describe("Aula 7 — revisão CTF 1 sem pontuação",()=>{
 it("mantém exatamente três desafios do roteiro",()=>{
  expect(reviewMissions.map(m=>m.title)).toEqual([
   "O Rastro Trancado","O Invasor Insistente","A Impressão Digital, Quebra de MD5 e o Cofre"
  ]);
  for(const m of reviewMissions){
   expect(m.steps).toHaveLength(3);
   expect(m.incident.length).toBeGreaterThan(35);
   expect(m.objective.length).toBeGreaterThan(35);
   expect(m.deliverable.length).toBeGreaterThan(20);
   expect(m.studentQuestion).toContain("?");
   expect(JSON.stringify(m)).not.toMatch(/\\b(150|200) pontos\\b/i);
  }
 });
 it("preserva arquivos, wordlist e semântica do PDF",()=>{
  expect(reviewMissions[0].incident).toContain("/var/tmp");
  expect(reviewMissions[1].context).toContain("/var/log/auth_simulado.log");
  expect(reviewMissions[2].context).toContain("50 arquivos .enc");
  expect(reviewMissions[2].startingPoint).toContain("dicionario_paraense.txt");
  expect(reviewMissions[2].steps[1].example).toContain("--format=raw-md5");
  expect(reviewMissions[2].steps[2].example).toContain("openssl");
 });
 it("replica o arquivo AES do script do instrutor e confirma SHA-256 ...e4b2",()=>{
  const salt=Buffer.from("HackPaiD");
  const keyiv=pbkdf2Sync("paidegua2026",salt,10000,48,"sha256");
  const cipher=createCipheriv("aes-256-cbc",keyiv.subarray(0,32),keyiv.subarray(32,48));
  const ciphertext=Buffer.concat([cipher.update("FLAG{cr1pt0_sh4256_p41_d3gu4_m0d1} #92968\\n"),cipher.final()]);
  const data=Buffer.concat([Buffer.from("Salted__"),salt,ciphertext]);
  expect(createHash("sha256").update(data).digest("hex")).toBe("3d3f540b1656b4f48c5db9e1fad13883c1b59ef7266c43879673ac4d332fe4b2");
 });
 it("explica comandos e pipes",()=>{
  expect(explainReviewCommand("chmod u+r file").what).toContain("permissões");
  expect(explainReviewCommand("grep Failed x | sort | uniq -c").what).toContain("pipeline");
  expect(explainReviewCommand("sha256sum /opt/evidencias/*.enc").what).toContain("SHA-256");
 });
});
