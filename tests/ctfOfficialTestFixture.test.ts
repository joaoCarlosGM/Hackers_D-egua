import { describe,it,expect } from "vitest";
import { webcrypto } from "node:crypto";
import { generateCtf1TestCommands, type Ctf1TestFixture } from "../src/ctfOfficialTestFixture";
import type { EncryptedBundle } from "../src/CtfReviewBrowser";

const bundle:EncryptedBundle={
 sha256Evidence37:"3d3f540b1656b4f48c5db9e1fad13883c1b59ef7266c43879673ac4d332fe4b2",
 files:Array.from({length:50},(_,i)=>({name:`evidencia_${String(i+1).padStart(2,"0")}.enc`,base64:"U2FsdGVkX1+AAQIDBAUGBwgJCgsMDQ4P"}))
};
const template:Ctf1TestFixture={
 round_id:"00000000-0000-0000-0000-000000000002",
 team_id:"00000000-0000-0000-0000-000000000003",
 mode:"test",ends_at:"2026-11-27T12:00:00Z",server_now:"2026-11-27T11:30:00Z",
 first_flag:"FLAG{rastro_alfa_00000001}",second_flag:"FLAG{100.21.41.81}",
 third_flag:"FLAG{cofre_alfa_00000001}"
};
describe("CTF student test Linux variant",()=>{
 it("gives each team distinct evidence, SSH aggressor and ciphertext, preserving all 3 missions",async()=>{
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
  const a=await generateCtf1TestCommands(template,bundle);
  const b=await generateCtf1TestCommands({...template,
   first_flag:"FLAG{rastro_beta_00000002}",second_flag:"FLAG{100.81.22.93}",
   third_flag:"FLAG{cofre_beta_00000002}"},bundle);
  expect(a.join("\n")).toContain(template.first_flag);
  expect(a.join("\n")).toContain("100.21.41.81");
  expect(b.join("\n")).toContain("100.81.22.93");
  expect(a.join("\n")).not.toContain("FLAG{rastro_beta_00000002}");
  expect(a.join("\n")).not.toContain("185.220.101.42");
  expect(a.join("\n")).toContain("CTF 01 - TESTE DA DUPLA");
  expect(a.filter(x=>x.includes("evidencia_37.enc")).length).toBeGreaterThan(0);
  expect(a[a.length-1]).toContain("HPDE_LAB_PRONTO");
  expect(a.join("\n")).not.toBe(b.join("\n"));
  expect(a.join("\n")).toContain("dicionario_paraense.txt");
 });
 it("rejects fixtures not issued for test mode",async()=>{
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
  await expect(generateCtf1TestCommands({...template,mode:"official" as "test"},bundle)).rejects.toThrow();
 });
});
