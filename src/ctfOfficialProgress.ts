/** Safe teacher-facing projection: progress is stored on the server, never inferred
 * from the browser's claimed current challenge. The dashboard already contains
 * delivered writeups and accepted flags; detailed timing is optional.
 */
export type ChallengeProgress={
 team_id:string;
 delivered:number[];
 correct:number[];
 challenge_times?:{challenge:number;seconds:number|null;started_at:string|null;submitted_at:string;flag_accepted:boolean|null}[];
 total_seconds?:number|null;
};
export type TeamProgressBase={
 team_id:string;
 writeups:number[];
 solved:number[];
};
function normalized(values:readonly number[]|undefined):number[]{
 return [...new Set((values??[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=3))].sort((a,b)=>a-b);
}
export function mergeChallengeProgress<T extends TeamProgressBase>(
 teams:T[],details:ChallengeProgress[]|null
):Array<T&Partial<ChallengeProgress>>{
 const byTeam=new Map((details??[]).map(row=>[row.team_id,row]));
 return teams.map(team=>{
  const row=byTeam.get(team.team_id);
  // Both the dashboard and detail endpoint are staff-only database projections.
  return {...team,delivered:normalized(row?.delivered??team.writeups),
   correct:normalized(row?.correct??team.solved),
   challenge_times:row?.challenge_times??[],total_seconds:row?.total_seconds??null};
 });
}
export function nextChallenge(delivered:readonly number[]|undefined):number|null{
 const finished=normalized(delivered);
 return [1,2,3].find(n=>!finished.includes(n))??null;
}
