import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "./api";
import { reviewMissions } from "./ctfReviewMissions";
import "./ctf-review-audit.css";

type TeacherRun={id:string;title:string;started_at:string;closed_at:string|null;writeup:Record<string,{command?:string;reason?:string;evidence?:string}>};
type AuditEvent={id:number;at:string;kind:string;detail:string};
type AuditReport={run:TeacherRun;events:AuditEvent[];truncated:boolean};
const formatDate=(value:string)=>new Date(value).toLocaleString("pt-BR");
const eventLabels:Record<string,string>={
 vm_boot:"Inicialização",vm_ready:"Linux pronto",lab_setup:"Preparação",
 command:"Comando",output:"Saída",challenge:"Flag confirmada",writeup:"Write-up",
 vm_stop:"Encerramento",error:"Falha"
};
function exportAudit(report:AuditReport){
 const data={origin:"Terminal do professor — revisão demonstrativa, sem pontuação",
  generated_at:new Date().toISOString(),...report};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;
 a.download="auditoria_terminal_professor_"+report.run.id.slice(0,8)+".json";
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function CtfReviewAudit({canAccessOfficialCtf}:{canAccessOfficialCtf:boolean}){
 const [sessions,setSessions]=useState<TeacherRun[]>([]);
 const [report,setReport]=useState<AuditReport|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [search,setSearch]=useState(""),[eventFilter,setEventFilter]=useState("all");
 const refresh=useCallback(async()=>{
  setBusy(true);setError("");
  try{setSessions(await rpc<TeacherRun[]>("ctf_teacher_review_history"));}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function inspect(id:string){
  setBusy(true);setError("");setEventFilter("all");
  try{setReport(await rpc<AuditReport>("ctf_teacher_review_report",{p_run:id}));}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 async function discard(id:string){
  if(!window.confirm("DESCARTAR esta demonstração do terminal do professor? O write-up e todos os eventos serão excluídos permanentemente do Supabase. Esta ação não pode ser desfeita."))return;
  setBusy(true);setError("");
  try{
   await rpc("ctf_teacher_review_discard",{p_run:id});
   if(report?.run.id===id)setReport(null);
   setSessions(previous=>previous.filter(item=>item.id!==id));
   await refresh();
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const visibleSessions=useMemo(()=>sessions.filter(run=>{
  const q=search.trim().toLowerCase();
  return !q||[run.title,run.id,formatDate(run.started_at)].some(value=>value.toLowerCase().includes(q));
 }),[sessions,search]);
 const filteredEvents=useMemo(()=>report?.events.filter(e=>eventFilter==="all"||e.kind===eventFilter)??[],[report,eventFilter]);
 return <section className="ctf-audit-page" aria-label="Auditoria do terminal do professor">
  <header className="ctf-audit-heading">
   <div>
    <p className="ctf-audit-kicker">AUDITORIA PEDAGÓGICA · REVISÃO PRÉ-CTF</p>
    <h2>Histórico do terminal do professor</h2>
    <p>Estas demonstrações são realizadas pelo professor e ficam separadas das sessões, notas e pontuação do CTF oficial.</p>
   </div>
   <div className="ctf-audit-actions">
    <a href="#admin/revisao-ctf">Abrir laboratório do professor</a>
    {canAccessOfficialCtf&&<a href="#admin/ctf">Ir para CTF oficial</a>}
   </div>
  </header>
  {error&&<p className="error" role="alert">{error}</p>}
  {report?<>
   <div className="ctf-audit-toolbar">
    <button type="button" onClick={()=>setReport(null)}>← Voltar ao histórico</button>
    <button type="button" onClick={()=>exportAudit(report)}>Exportar JSON</button>
   </div>
   <article className="ctf-audit-detail">
    <div className="ctf-audit-detail-heading">
     <div><p className="ctf-audit-kicker">ORIGEM: TERMINAL DO PROFESSOR</p>
      <h3>Demonstração de {formatDate(report.run.started_at)}</h3>
      <p>{report.run.closed_at?"Encerrada e salva":"Sessão não encerrada"} · {report.events.length} eventos
       {report.truncated?" · primeiros 2.000 eventos":""}</p>
     </div>
     <button type="button" className="ctf-audit-danger" disabled={busy} onClick={()=>void discard(report.run.id)}>Descartar demonstração</button>
    </div>
    <div className="ctf-audit-writeups">
     <h4>Write-ups registrados</h4>
     {reviewMissions.map((mission,index)=>{
      const entry=report.run.writeup?.[String(index)];
      if(!entry?.command&&!entry?.reason&&!entry?.evidence)return null;
      return <details key={mission.id}>
       <summary>Desafio {mission.id} — {mission.title}</summary>
       <p><b>Comando:</b> {entry.command||"Não informado"}</p>
       <p><b>Raciocínio:</b> {entry.reason||"Não informado"}</p>
       <p><b>Evidência:</b> {entry.evidence||"Não informada"}</p>
      </details>;
     })}
     {Object.values(report.run.writeup??{}).every(v=>!v.command&&!v.reason&&!v.evidence)&&
      <p>Nenhum write-up foi salvo nesta demonstração.</p>}
    </div>
    <div className="ctf-audit-log-head"><h4>Eventos do terminal</h4>
     <label>Filtrar eventos <select aria-label="Filtrar eventos" value={eventFilter} onChange={e=>setEventFilter(e.target.value)}>
      <option value="all">Todos</option>
      {Object.entries(eventLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select></label>
    </div>
    <div className="ctf-audit-log" role="region" aria-label="Eventos da demonstração">
     {filteredEvents.length===0&&<p>Nenhum evento para este filtro.</p>}
     {filteredEvents.map(event=><div className="ctf-audit-event" key={event.id}>
      <time>{formatDate(event.at)}</time><strong>{eventLabels[event.kind]??event.kind}</strong>
      <pre>{event.detail}</pre>
     </div>)}
    </div>
    <p className="ctf-audit-disclaimer">Os eventos são produzidos pelo navegador do professor. Servem para acompanhamento pedagógico e não constituem auditoria independente do CTF oficial.</p>
   </article>
  </>:<>
   <div className="ctf-audit-toolbar">
    <label>Pesquisar demonstrações <input aria-label="Pesquisar demonstrações" value={search}
      placeholder="Data, nome ou identificador" onChange={e=>setSearch(e.target.value)}/></label>
    <button type="button" disabled={busy} onClick={()=>void refresh()}>Atualizar histórico</button>
   </div>
   <div className="ctf-audit-summary">{visibleSessions.length} demonstração(ões) · Terminal do professor</div>
   <div className="ctf-audit-session-list">
    {visibleSessions.length===0&&<p>Nenhuma demonstração encontrada. Inicie uma revisão no laboratório do professor.</p>}
    {visibleSessions.map(item=><article className="ctf-audit-session" key={item.id}>
     <div><strong>Demonstração de {formatDate(item.started_at)}</strong>
      <p>{item.closed_at?"Encerrada e salva":"Não encerrada (pode ter sido interrompida)"}</p>
      <small>Terminal do professor · Sem pontuação</small>
     </div>
     <div className="ctf-audit-session-actions">
      <button type="button" disabled={busy} onClick={()=>void inspect(item.id)}>Ver auditoria</button>
      <button type="button" className="ctf-audit-danger" disabled={busy} onClick={()=>void discard(item.id)}>Descartar</button>
     </div>
    </article>)}
   </div>
  </>}
 </section>;
}
