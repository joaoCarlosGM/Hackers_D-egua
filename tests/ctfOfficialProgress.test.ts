import {describe,expect,it} from "vitest";
import {mergeChallengeProgress,nextChallenge} from "../src/ctfOfficialProgress";

describe("CTF teacher live challenge projection",()=>{
 const teams=[{team_id:"alpha",solved:[],writeups:[1]},{team_id:"beta",solved:[1],writeups:[1,2,3]}];
 it("displays challenge 2 after a delivered incorrect flag",()=>{
  const data=mergeChallengeProgress(teams,[{team_id:"alpha",delivered:[1],correct:[],challenge_times:[],total_seconds:null}]);
  expect(nextChallenge(data[0].delivered)).toBe(2);
  expect(data[0].correct).toEqual([]);
 });
 it("keeps server dashboard progress even when detailed timing is unavailable",()=>{
  const data=mergeChallengeProgress(teams,null);
  expect(nextChallenge(data[0].delivered)).toBe(2);
  expect(data[0].delivered).toEqual([1]);
  expect(data[1].correct).toEqual([1]);
  expect(nextChallenge(data[1].delivered)).toBe(null);
 });
 it("does not mistake correct flags for delivered challenges",()=>{
  expect(nextChallenge([1,2,3])).toBe(null);
  expect(nextChallenge([1,1,9,2])).toBe(3);
 });
});
