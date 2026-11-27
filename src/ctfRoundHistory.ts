/** Organize CTF rounds without moving or deleting any persisted student data. */
export type CtfRoundSummary={
 id:string;title:string;state:string;mode?:"test"|"official";assessment_kind?:"test"|"official";
 class_ids?:string[];started_at:string|null;ends_at:string|null;created_at?:string;teams?:number;
};
export function splitCtfRounds(rounds:CtfRoundSummary[],now:number){
 const history=rounds.filter(r=>r.state==="ended"||r.state==="audited"||
  (r.state==="running"&&r.ends_at!==null&&Date.parse(r.ends_at)<=now));
 const upcoming=rounds.filter(r=>!history.includes(r));
 return {history,upcoming};
}
export function ctfRoundLabel(round:CtfRoundSummary,now:number){
 if(round.state==="draft")return "Rascunho — não iniciado";
 if(round.state==="running"&&round.ends_at&&Date.parse(round.ends_at)>now)return "Em andamento";
 if(round.state==="discarded")return "Descartado";
 return "Finalizado — histórico preservado";
}
