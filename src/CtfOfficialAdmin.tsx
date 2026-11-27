import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc, type Class } from "./api";
import { calculateOfficialCtf1Total, OFFICIAL_CTF1_CAPS, type OfficialCtf1Scores } from "./ctfOfficialScoring";
import "./ctf-official-admin.css";

type Round = { id:string; title:string; state:string; class_ids?:string[]; started_at:string|null; ends_at:string|null; created_at?:string;teams?:number };
type Team = { team_id:string; public_name:string; class_id:string; status:string; excluded_at:string|null; score:OfficialCtf1Scores|null; audited_at:string|null; last_submission:string|null; solved:number[]; writeups:number[] };
type Dashboard={round:Round&{server_now:string;duration_seconds:number};teams:Team[]};
type Audit={team_id:string;round_id:string;score:OfficialCtf1Scores|null;score_reason:string|null;audited_at:string|null;excluded_at:string|null;excluded_reason:string|null;submissions:{challenge:number;accepted:boolean;submitted_at:string}[];writeups:Record<string,Record<string,string>>;events:{at:string;kind:string;detail:unknown}[]};
const zeroScores:OfficialCtf1Scores={mission1:0,mission2:0,mission3:0,writeup1:0,writeup2:0,writeup3:0};
const labels:Record<keyof OfficialCtf1Scores,string>={
 mission1:"Desafio 1 — O Rastro Trancado",
 mission2:"Desafio 2 — O Invasor Insistente",
 mission3:"Desafio 3 — MD5, SHA-256 e o Cofre",
 writeup1:"Write-up do Desafio 1",
 writeup2:"Write-up do Desafio 2",
 writeup3:"Write-up do Desafio 3"
};
function leftTime(round:Dashboard["round"],now:number){
 if(round.state!=="running"||!round.ends_at)return "00:00";
 const seconds=Math.max(0,Math.ceil((Date.parse(round.ends_at)-now)/1000));
 return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}
export default function CtfOfficialAdmin({classes}:{classes:Class[]}){
 const [rounds,setRounds]=useState<Round[]>([]);
 const [selected,setSelected]=useState("");
 const [dashboard,setDashboard]=useState<Dashboard|null>(null);
 const [teamSelected,setTeamSelected]=useState("");
 const [audit,setAudit]=useState<Audit|null>(null);
 const [scores,setScores]=useState<OfficialCtf1Scores>(zeroScores);
 const [reason,setReason]=useState("");
 const [title,setTitle]=useState("CTF 1 — Aula 7");
 const [classIds,setClassIds]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [clock,setClock]=useState(Date.now());
 const [timeDelta,setTimeDelta]=useState(0);
 const [ready,setReady]=useState(false);
 const load=useCallback(async()=>{
  const list=await rpc<Round[]>("ctf1_staff_list_rounds");
  setRounds(list);
  setReady(true);
  setSelected(prev=>prev||list[0]?.id||"");
 },[]);
 const refresh=useCallback(async(id:string)=>{
  if(!id)return;
  const value=await rpc<Dashboard>("ctf1_staff_dashboard",{p_round:id});
  setDashboard(value);
  setTimeDelta(Date.parse(value.round.server_now)-Date.now());
 },[]);
 const refreshAudit=useCallback(async(id:string,team:string)=>{
  if(!id||!team)return;
  const data=await rpc<Audit>("ctf1_staff_audit_team",{p_round:id,p_team:team});
  setAudit(data);setScores(data.score??{...zeroScores});setReason(data.score_reason??"");
 },[]);
 useEffect(()=>{void load().catch((e:Error)=>setError(e.message));},[load]);
 useEffect(()=>{void refresh(selected).catch((e:Error)=>setError(e.message));},[selected,refresh]);
 useEffect(()=>{const timer=setInterval(()=>{
  setClock(Date.now());
  if(selected)void refresh(selected).catch(()=>{});
 },5000);return()=>clearInterval(timer);},[selected,refresh]);
 const selectedRound=dashboard?.round.id===selected?dashboard:null;
 const currentTeam=useMemo(()=>selectedRound?.teams.find(t=>t.team_id===teamSelected),[selectedRound,teamSelected]);
 const total=useMemo(()=>{try{return calculateOfficialCtf1Total(scores);}catch{return 0;}},[scores]);
 async function action(work:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await work();await load();if(selected)await refresh(selected);if(selected&&teamSelected)await refreshAudit(selected,teamSelected);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const display=selectedRound?.round;
 const formatted=display?leftTime(display,clock+timeDelta):"00:00";
 return <section className="ctf-official-admin" aria-label="CTF 1 oficial, painel do professor">
  <header className="ctf-official-heading">
   <div><p className="eyebrow">CTF 01 · CONTROLE DA COMPETIÇÃO</p><h2>Painel do professor</h2>
    <p>Três missões da Aula 7, duplas reais e auditoria separada da revisão.</p></div>
   <div className="ctf-official-clock" aria-live="off"><small>Tempo restante</small><strong>{formatted}</strong>
     <span>{display?.state==="running"?"Em andamento":display?.state==="draft"?"Aguardando professor":display?.state==="ended"?"Encerrada":"Não iniciada"}</span></div>
  </header>
  {error&&<p className="ctf-official-error" role="alert">{error}</p>}
  {notice&&<p className="ctf-official-success" role="status">{notice}</p>}
  {!ready&&<p>Verificando disponibilidade das RPCs do CTF oficial…</p>}
  {ready&&<div className="ctf-official-toolbar">
   <label>Rodada <select value={selected} onChange={e=>{setSelected(e.target.value);setTeamSelected("");setAudit(null);}}>
    <option value="">Selecionar rodada</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.title} · {r.state}</option>)}
   </select></label>
   <button disabled={busy} onClick={()=>void action(async()=>{await load();if(selected)await refresh(selected);})}>Atualizar</button>
  </div>}
  <details className="ctf-official-new">
   <summary>Preparar nova rodada (não inicia automaticamente)</summary>
   <div className="ctf-official-form">
    <label>Título<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100}/></label>
    <fieldset><legend>Turmas participantes (até duas)</legend>
    {classes.map(c=><label key={c.id}><input type="checkbox" checked={classIds.includes(c.id)} onChange={e=>setClassIds(prev=>e.target.checked?[...prev,c.id].slice(0,2):prev.filter(x=>x!==c.id))}/>{c.name}</label>)}</fieldset>
    <button disabled={busy||classIds.length===0} onClick={()=>void action(async()=>{
      const id=await rpc<string>("ctf1_staff_create_round",{p_class_ids:classIds,p_title:title});
      setSelected(id);setNotice("Rodada criada em rascunho. Nenhuma dupla foi iniciada.");await refresh(id);
    })}>Criar rascunho</button>
   </div>
  </details>
  {display&&<section className="ctf-official-hero">
   <div><span className="ctf-official-tag">CTF 01 · REDES & LINUX</span><h3>{display.title}</h3>
    <p>O Rastro Trancado · O Invasor Insistente · A Impressão Digital, Quebra de MD5 e o Cofre</p>
    <small>Uma hora por rodada · 200 pontos máximos · servidor controla o horário</small></div>
   <div className="ctf-official-actions">
    {display.state==="draft"&&<button disabled={busy} onClick={()=>{
      if(!window.confirm("Iniciar agora o CTF por 60 minutos para todas as duplas selecionadas? O relógio não será reiniciado."))return;
      void action(async()=>{await rpc("ctf1_staff_start_round",{p_round:selected});setNotice("Rodada iniciada para as duplas.");});
    }}>Iniciar CTF</button>}
    {display.state==="running"&&<button disabled={busy} onClick={()=>{
      if(!window.confirm("Encerrar antecipadamente a rodada? Novas flags e write-ups serão bloqueados."))return;
      void action(async()=>{await rpc("ctf1_staff_end_round",{p_round:selected});setNotice("Rodada encerrada.");});
    }}>Encerrar rodada</button>}
   </div>
  </section>}
  {selectedRound&&<><div className="ctf-official-kpis">
   <div><small>Duplas na rodada</small><strong>{selectedRound.teams.filter(t=>!t.excluded_at).length}</strong></div>
   <div><small>Três desafios concluídos</small><strong>{selectedRound.teams.filter(t=>t.solved.length===3&&!t.excluded_at).length}</strong></div>
   <div><small>Em investigação</small><strong>{selectedRound.teams.filter(t=>t.solved.length>0&&t.solved.length<3&&!t.excluded_at).length}</strong></div>
   <div><small>Auditorias avaliadas</small><strong>{selectedRound.teams.filter(t=>t.audited_at&&!t.excluded_at).length}</strong></div>
  </div>
  <div className="ctf-official-grid"><section className="ctf-official-panel">
   <h3>Progresso por dupla</h3>
   <div className="ctf-official-table-wrap"><table><thead><tr><th>Dupla</th><th>Turma</th><th>Missões</th><th>Write-ups</th><th>Avaliação</th><th>Ação</th></tr></thead><tbody>
   {selectedRound.teams.map(t=><tr key={t.team_id}>
    <td><strong>{t.public_name}</strong>{t.excluded_at&&<small> · Participação excluída</small>}</td>
    <td>{classes.find(c=>c.id===t.class_id)?.name??"—"}</td>
    <td>{t.solved.length}/3</td><td>{t.writeups.length}/3</td>
    <td>{t.audited_at?"Avaliada":"Pendente"}</td>
    <td><button disabled={busy} onClick={()=>{setTeamSelected(t.team_id);void refreshAudit(selected,t.team_id).catch(e=>setError((e as Error).message));}}>Auditar</button></td>
   </tr>)}</tbody></table></div>
  </section><section className="ctf-official-panel">
   <h3>Auditoria individual</h3>
   {!currentTeam&&<p>Selecione uma dupla para conferir entregas, write-ups e notas.</p>}
   {currentTeam&&<><h4>{currentTeam.public_name}</h4>
    <p>{currentTeam.excluded_at?"Excluída desta rodada":"Participação ativa"} · {currentTeam.solved.length}/3 flags confirmadas</p>
    {audit&&audit.team_id===currentTeam.team_id&&<>
     <details open><summary>Validação de flags e evidências</summary><div className="ctf-official-scroll">
      {audit.submissions.map((s,i)=><p key={i}>D{s.challenge}: {s.accepted?"Flag aceita":"Flag recusada"} · {new Date(s.submitted_at).toLocaleString("pt-BR")}</p>)}
      {audit.submissions.length===0&&<p>Nenhuma flag submetida.</p>}
     </div></details>
     <details><summary>Write-ups salvos</summary>
      {[1,2,3].map(n=><div key={n}><h5>Desafio {n}</h5>
       <pre>{JSON.stringify(audit.writeups[String(n)]??{},null,2)}</pre></div>)}
     </details>
     <details><summary>Eventos de auditoria</summary><div className="ctf-official-scroll">
      {audit.events.map((event,i)=><p key={i}><b>{event.kind}</b> · {new Date(event.at).toLocaleString("pt-BR")} · {JSON.stringify(event.detail)}</p>)}
     </div></details>
     <fieldset><legend>Definir nota (máx. 200 pontos)</legend>
      {(Object.keys(OFFICIAL_CTF1_CAPS) as (keyof OfficialCtf1Scores)[]).map(key=><label key={key}>
       {labels[key]} (máx. {OFFICIAL_CTF1_CAPS[key]})
       <input type="number" min={0} max={OFFICIAL_CTF1_CAPS[key]} step={1} value={scores[key]}
         disabled={busy||!!currentTeam.excluded_at} onChange={e=>setScores(prev=>({...prev,[key]:Number(e.target.value)}))}/>
      </label>)}
      <strong>Total: {total}/200</strong>
      <label>Justificativa obrigatória<textarea rows={3} minLength={10} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button disabled={busy||!!currentTeam.excluded_at||reason.trim().length<10} onClick={()=>void action(async()=>{
       const amount=calculateOfficialCtf1Total(scores);
       await rpc("ctf1_staff_grade",{p_round:selected,p_team:currentTeam.team_id,p_score:scores,p_reason:reason});
       setNotice(`Avaliação auditada: ${amount}/200. Ainda não publicada no ranking.`);
      })}>Salvar avaliação</button>
     </fieldset>
     <div className="ctf-official-danger">
      {!currentTeam.excluded_at?<button disabled={busy} onClick={()=>{
       const message=window.prompt("Motivo para excluir somente o CTF desta dupla (mín. 10 caracteres):");
       if(!message||message.trim().length<10)return;
       if(!window.confirm("Excluir a participação do CTF sem apagar cadastro, avaliações ou histórico?"))return;
       void action(async()=>{await rpc("ctf1_staff_exclude",{p_round:selected,p_team:currentTeam.team_id,p_reason:message});setNotice("Participação excluída. Histórico preservado.");});
      }}>Excluir CTF desta dupla</button>:<button disabled={busy} onClick={()=>{
       const message=window.prompt("Motivo para restaurar a participação (mín. 10 caracteres):");
       if(!message||message.trim().length<10)return;
       void action(async()=>{await rpc("ctf1_staff_restore",{p_round:selected,p_team:currentTeam.team_id,p_reason:message});setNotice("Participação restaurada.");});
      }}>Restaurar CTF da dupla</button>}
     </div>
    </>}
   </>}
  </section></div></>}
  <p className="ctf-official-footnote">As notas deste painel ficam separadas do ranking legado até homologação e publicação administrativa. O histórico enviado pelo navegador é telemetria não confiável: a validação de flags e o horário precisam ser conferidos no servidor.</p>
 </section>;
}
