import { describe, expect, it } from "vitest";
import {
 OFFICIAL_CTF1_CAPS, OFFICIAL_CTF1_MAX_POINTS, OFFICIAL_CTF1_DURATION_SECONDS,
 calculateOfficialCtf1Total, officialCtf1RemainingSeconds, validateOfficialCtf1Scores,
} from "../src/ctfOfficialScoring";
const full = {mission1:30,mission2:60,mission3:80,writeup1:10,writeup2:10,writeup3:10};
describe("CTF 1 oficial — contrato de pontuação",()=>{
 it("soma 30+60+80+30 como 200, sem alterar ranking diretamente",()=>{
  expect(Object.values(OFFICIAL_CTF1_CAPS).reduce((a,b)=>a+b,0)).toBe(200);
  expect(OFFICIAL_CTF1_MAX_POINTS).toBe(200);
  expect(calculateOfficialCtf1Total(full)).toBe(200);
  expect(calculateOfficialCtf1Total({...full,mission1:0,writeup3:0})).toBe(160);
 });
 it("rejeita limite excedido, negativos, frações e dados incompletos",()=>{
  expect(()=>validateOfficialCtf1Scores({...full,mission1:31})).toThrow();
  expect(()=>validateOfficialCtf1Scores({...full,mission2:-1})).toThrow();
  expect(()=>validateOfficialCtf1Scores({...full,writeup3:10.5})).toThrow();
  expect(()=>validateOfficialCtf1Scores({mission1:10})).toThrow();
  expect(()=>validateOfficialCtf1Scores({...full,extra:1})).toThrow();
 });
 it("calcula relógio da rodada sem permitir mais de 60 minutos",()=>{
  const start="2026-11-27T14:00:00Z";
  expect(OFFICIAL_CTF1_DURATION_SECONDS).toBe(3600);
  expect(officialCtf1RemainingSeconds(start,start)).toBe(3600);
  expect(officialCtf1RemainingSeconds(start,"2026-11-27T14:29:59Z")).toBe(1801);
  expect(officialCtf1RemainingSeconds(start,"2026-11-27T15:00:00Z")).toBe(0);
  expect(officialCtf1RemainingSeconds(start,"2026-11-27T16:00:00Z")).toBe(0);
  expect(officialCtf1RemainingSeconds(start,"2026-11-27T14:10:00Z","2026-11-27T14:09:00Z")).toBe(0);
 });
});
