import {describe,it,expect} from "vitest";
import {splitCtfRounds,ctfRoundLabel} from "../src/ctfRoundHistory";

const date=Date.parse("2026-11-27T18:00:00Z");
const base={mode:"test" as const,class_ids:["class-poraque"],started_at:null,created_at:"2026-11-27T16:00:00Z",teams:9};
describe("CTF teaching history keeps rounds isolated",()=>{
 it("retains an expired running round in historical activity instead of active session",()=>{
  const afternoon={...base,id:"afternoon",title:"CTF 1 — Poraquê",state:"running",started_at:"2026-11-27T16:30:00Z",ends_at:"2026-11-27T17:30:00Z"};
  const evening={...base,id:"evening",title:"CTF 1 — Pitiú",state:"draft",ends_at:null,class_ids:["class-pitiu"]};
  const sections=splitCtfRounds([afternoon,evening],date);
  expect(sections.history.map(r=>r.id)).toEqual(["afternoon"]);
  expect(sections.upcoming.map(r=>r.id)).toEqual(["evening"]);
  expect(ctfRoundLabel(afternoon,date)).toContain("histórico");
 });
 it("only groups fully completed sessions and keeps active sessions active",()=>{
  const live={...base,id:"live",title:"Current",state:"running",ends_at:"2026-11-27T18:10:00Z"};
  const ended={...base,id:"ended",title:"Prior",state:"ended",ends_at:"2026-11-27T17:00:00Z"};
  expect(splitCtfRounds([live,ended],date).history.map(r=>r.id)).toEqual(["ended"]);
  expect(splitCtfRounds([live,ended],date).upcoming.map(r=>r.id)).toEqual(["live"]);
 });
});
