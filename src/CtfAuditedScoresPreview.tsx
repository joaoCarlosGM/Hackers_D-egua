import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "./api";
import { calculateOfficialCtf1Total, type OfficialCtf1Scores } from "./ctfOfficialScoring";
import "./ctf-official-admin.css";

type Round={id:string;title:string;state:string;mode?:string;created_at?:string};
type Row={team_id:string;public_name:string;excluded_at:string|null;score:OfficialCtf1Scores|null;audited_at:string|null};
type Dashboard={round:{id:string;title:string;state:string;started_at?:string|null};teams:Row[]};
export type AuditedCtfSuggestion={roundId:string;roundTitle:string;teamId:string;teamName:string;score:number;reason:string;elapsedSeconds:number|null;scoreBreakdown:OfficialCtf1Scores};
type Audit={score_reason:string|null;submissions:{challenge:number;accepted:boolean;submitted_at:string}[]};
const fields: {key:keyof OfficialCtf1Scores;label:string}[]=[
 {key:"mission1",label:"D1"},{key:"mission2",label:"D2"},{key:"mission3",label:"D3"},
 {key:"writeup1",label:"R1"},{key:"writeup2",label:"R2"},{key:"writeup3",label:"R3"}
];
export default function CtfAuditedScoresPreview({onUseSuggestion}:{onUseSuggestion?:(value:AuditedCtfSuggestion)=>void}){
 const [rounds,setRounds]=useState<Round[]>([]);
 const [roundId,setRoundId]=useState("");
 const [dashboard,setDashboard]=useState<Dashboard|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [selecting,setSelecting]=useState<string|null>(null);
 const load=useCallback(async()=>{
  setBusy(true);setError("");
  try{
   const data=await rpc<Round[]>("ctf1_staff_list_rounds");
   setRounds(data);
   setRoundId(current=>data.some(r=>r.id===current)?current:(data[0]?.id??""));
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!roundId){setDashboard(null);return;}
  let cancelled=false;
  setBusy(true);setError("");
  void rpc<Dashboard>("ctf1_staff_dashboard",{p_round:roundId})
   .then(value=>{if(!cancelled)setDashboard(value);})
   .catch(e=>{if(!cancelled)setError((e as Error).message);})
   .finally(()=>{if(!cancelled)setBusy(false);});
  return()=>{cancelled=true;};
 },[roundId]);
 const list=useMemo(()=>dashboard?.round.id===roundId?dashboard.teams:[],[dashboard,roundId]);
 const evaluated=list.filter(t=>t.audited_at&&t.score&&!t.excluded_at);
 async function useSuggestion(t:Row){
  if(!onUseSuggestion||!t.score||!t.audited_at||t.excluded_at||!dashboard)return;
  setSelecting(t.team_id);setError("");
  try{
   const audit=await rpc<Audit>("ctf1_staff_audit_team",{p_round:roundId,p_team:t.team_id});
   const fullScore=calculateOfficialCtf1Total(t.score);
   const successes=[1,2,3].map(n=>audit.submissions.filter(s=>s.accepted&&s.challenge===n).map(s=>Date.parse(s.submitted_at)).filter(Number.isFinite).sort((a,b)=>a-b)[0]);
   const started=Date.parse(dashboard.round.started_at??"");
   const last=Math.max(...successes);
   const elapsedSeconds=Number.isFinite(started)&&successes.every(Number.isFinite)&&last>=started
     ?Math.max(1,Math.min(3600,Math.ceil((last-started)/1000))):null;
   onUseSuggestion({roundId,roundTitle:dashboard.round.title,teamId:t.team_id,teamName:t.public_name,
    score:fullScore,reason:audit.score_reason??"",elapsedSeconds,scoreBreakdown:t.score});
  }catch(e){setError((e as Error).message);}
  finally{setSelecting(null);}
 }
 return <section className="ctf-official-panel" aria-label="Prévia das notas auditadas das rodadas">
  <h2>Sugestões da auditoria para lançamento</h2>
  <p>As notas abaixo foram sugeridas pelo professor na auditoria. Clique em <strong>Usar sugestão</strong> para preencher o lançamento oficial e conferir o tempo. Nenhuma pontuação é publicada automaticamente.</p>
  {error&&<p className="ctf-official-error" role="alert">{error}</p>}
  <div className="ctf-official-toolbar">
   <label>Rodada para consulta
    <select value={roundId} disabled={busy&&rounds.length===0} onChange={e=>setRoundId(e.target.value)}>
     <option value="">Nenhuma rodada criada</option>
     {rounds.map(r=><option key={r.id} value={r.id}>{r.title} · {r.state}</option>)}
    </select>
   </label>
   <button type="button" disabled={busy} onClick={()=>void load()}>Atualizar prévia</button>
  </div>
  {busy&&<p role="status">Consultando avaliações…</p>}
  {!busy&&rounds.length===0&&<p>Nenhuma rodada cadastrada. As prévias aparecerão após a primeira avaliação.</p>}
  {roundId&&list.length>0&&<>
   <p><strong>{evaluated.length}</strong> de <strong>{list.filter(t=>!t.excluded_at).length}</strong> duplas com avaliação salva.</p>
   <div className="ctf-official-table-wrap">
    <table>
     <thead><tr><th>Dupla</th>{fields.map(f=><th key={f.key} title={f.label.startsWith("R")?"Relatório / write-up":"Desafio"}>{f.label}</th>)}<th>Total sugerido</th><th>Situação</th><th>Lançamento</th></tr></thead>
     <tbody>{list.map(t=>{
      const hasScore=!!t.score&&!!t.audited_at;
      let total:number|null=null;
      if(hasScore){try{total=calculateOfficialCtf1Total(t.score);}catch{total=null;}}
      return <tr key={t.team_id}>
       <td><strong>{t.public_name}</strong></td>
       {fields.map(f=><td key={f.key}>{hasScore?t.score?.[f.key]??"—":"—"}</td>)}
       <td><strong>{total===null?"—":total+"/200"}</strong></td>
       <td>{t.excluded_at?"Excluída":total!==null?"Sugestão auditada":hasScore?"Nota inválida":"Pendente"}</td>
       <td>{onUseSuggestion&&total!==null&&!t.excluded_at?<button type="button" disabled={selecting!==null||busy} onClick={()=>void useSuggestion(t)}>{selecting===t.team_id?"Carregando…":"Usar sugestão"}</button>:"—"}</td>
      </tr>;
     })}</tbody>
    </table>
   </div>
  </>}
  {roundId&&!busy&&list.length===0&&<p>Esta rodada ainda não possui duplas cadastradas.</p>}
  <p className="ctf-official-footnote">D1–D3: desafios (30, 60 e 80 pontos). R1–R3: write-ups (10 pontos cada). Total máximo: 200. A avaliação detalhada, a justificativa e as evidências ficam em <a href="#admin/ctf-oficial">Rodadas e auditoria</a>. A publicação no ranking exige procedimento administrativo próprio e não é automática.</p>
 </section>;
}
