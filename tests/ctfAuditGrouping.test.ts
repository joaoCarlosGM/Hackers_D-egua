import {describe,expect,it} from "vitest";
import {classifyAuditCommands,type AuditEvent} from "../src/ctfAuditGrouping";
const at=(minute:number)=>new Date(Date.parse("2026-11-27T16:00:00.000Z")+minute*60_000).toISOString();
const cmd=(minute:number,challenge:number|undefined):AuditEvent=>({
 at:at(minute),kind:"terminal_event",detail:{command:"ls -la",...(challenge?{challenge_no:challenge}:{})}
});
const saved=(minute:number,challenge:number):AuditEvent=>({
 at:at(minute),kind:"writeup_saved",detail:{challenge_no:challenge,completed:true}
});
describe("CTF audit grouping for historical commands",()=>{
 it("reconstructs challenge 2 and 3 despite historic stale challenge=1 labels",()=>{
  const data=classifyAuditCommands([
   cmd(0,1),saved(10,1),cmd(12,1),saved(20,2),cmd(25,1),
   saved(30,3),cmd(35,1)
  ]);
  expect(data.map(e=>e.challenge)).toEqual([1,2,3,0]);
  expect(data.map(e=>e.method)).toEqual(["original","timeline","timeline","timeline"]);
 });
 it("keeps legacy events with no challenge label and no writeup as phase one inferred",()=>{
  const [event]=classifyAuditCommands([cmd(2,undefined)]);
  expect(event.challenge).toBe(1);
  expect(event.method).toBe("timeline");
 });
 it("keeps boundary-adjacent telemetry separated for manual verification",()=>{
  const [event]=classifyAuditCommands([saved(10,1),cmd(10,1)]);
  expect(event.challenge).toBe(0);
  expect(event.method).toBe("uncertain");
 });
});
