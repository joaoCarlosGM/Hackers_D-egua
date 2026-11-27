/** Audit grouping is a read-only projection. Original commands and timestamps
 * remain unchanged. Historical client recordings sometimes incorrectly tagged
 * every command as challenge 1; derive the likely phase from SERVER write-up
 * timestamps rather than rewriting the evidence.
 */
export type AuditEvent={at:string;kind:string;detail:unknown};
export type AuditCommand={event:AuditEvent;challenge:number;method:"original"|"timeline"|"uncertain"};
function challengeFromDetail(detail:unknown):number|null{
 if(!detail||typeof detail!=="object"||!("challenge_no" in detail))return null;
 const value=Number((detail as {challenge_no?:unknown}).challenge_no);
 return [1,2,3].includes(value)?value:null;
}
export function classifyAuditCommands(events:AuditEvent[]):AuditCommand[]{
 const boundaries=new Map<number,number>();
 for(const e of events){
  if(e.kind!=="writeup_saved")continue;
  const n=challengeFromDetail(e.detail);
  const time=Date.parse(e.at);
  if(n&&Number.isFinite(time)){
   const prior=boundaries.get(n);
   if(prior===undefined||time<prior)boundaries.set(n,time);
  }
 }
 return events.filter(e=>e.kind==="terminal_event").map(event=>{
  const t=Date.parse(event.at);
  const direct=challengeFromDetail(event.detail);
  if(!Number.isFinite(t))return {event,challenge:direct??0,method:"uncertain" as const};
  const d1=boundaries.get(1),d2=boundaries.get(2),d3=boundaries.get(3);
  let expected=1;
  if(d1!==undefined&&t>=d1)expected=2;
  if(d2!==undefined&&t>=d2)expected=3;
  if(d3!==undefined&&t>=d3)expected=0; // after all deliveries: keep separately
  // A <=3 second margin near submission can contain delayed telemetry batches.
  const nearTransition=[d1,d2,d3].some(boundary=>boundary!==undefined&&Math.abs(t-boundary)<=3000);
  if(nearTransition)return {event,challenge:0,method:"uncertain" as const};
  if(expected===0)return {event,challenge:0,method:"timeline" as const};
  if(direct===expected)return {event,challenge:expected,method:"original" as const};
  // Explicit challenge number can be stale due to the xterm onData closure.
  return {event,challenge:expected,method:"timeline" as const};
 });
}
