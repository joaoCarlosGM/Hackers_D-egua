import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc, type Class } from "./api";
import { splitCtfRounds, ctfRoundLabel } from "./ctfRoundHistory";
import { calculateOfficialCtf1Total, OFFICIAL_CTF1_CAPS, type OfficialCtf1Scores } from "./ctfOfficialScoring";
import "./ctf-official-admin.css";

type Round = { id:string; title:string; state:string; mode?:"test"|"official"; class_ids?:string[]; started_at:string|null; ends_at:string|null; created_at?:string;teams?:number };
type Team = { team_id:string; public_name:string; class_id:string; status:string; excluded_at:string|null; score:OfficialCtf1Scores|null; audited_at:string|null; last_submission:string|null; first_activity_at:string|null; last_activity_at:string|null; mission_opened_at:string|null; solved:number[]; writeups:number[]; delivered?:number[]; correct?:number[]; challenge_times?:{challenge:number;seconds:number|null;started_at:string|null;submitted_at:string;flag_accepted:boolean|null}[];total_seconds?:number|null };
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
function duration(seconds:number|null|undefined){if(seconds==null)return "—";const s=Math.max(0,seconds);return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}
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
 const [historyOpen,setHistoryOpen]=useState(false);
 const [classId,setClassId]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [clock,setClock]=useState(Date.now());
 const [timeDelta,setTimeDelta]=useState(0);
 const [ready,setReady]=useState(false);
 const [discardTarget,setDiscardTarget]=useState("");
 const [discardReason,setDiscardReason]=useState("");
 const load=useCallback(async()=>{
  const list=await rpc<Round[]>("ctf1_staff_list_rounds");
  setRounds(list);
  setReady(true);
  setSelected(prev=>list.some(r=>r.id===prev)?prev:(list[0]?.id||""));
 },[]);
 const refresh=useCallback(async(id:string)=>{
  if(!id)return;
  const [value,progress]=await Promise.all([
   rpc<Dashboard>("ctf1_staff_dashboard",{p_round:id}),
   rpc<{team_id:string;delivered:number[];correct:number[];challenge_times:Team["challenge_times"];total_seconds:number|null}[]>("ctf1_staff_challenge_results",{p_round:id})
  ]);
  const byTeam=new Map((progress??[]).map(item=>[item.team_id,item]));
  setDashboard({...value,teams:value.teams.map(team=>({...team,...byTeam.get(team.team_id)}))});
  setTimeDelta(Date.parse(value.round.server_now)-Date.now());
 },[]);
 const refreshAudit=useCallback(async(id:string,team:string)=>{
  if(!id||!team)return;
  const data=await rpc<Audit>("ctf1_staff_audit_team",{p_round:id,p_team:team});
  setAudit(data);setScores(data.score??{...zeroScores});setReason(data.score_reason??"");
 },[]);
 useEffect(()=>{void load().catch((e:Error)=>setError(e.message));},[load]);
 useEffect(()=>{
  // Suggested next group only; do not create or start rounds implicitly.
  if(classId)return;
  const next=classes.find(c=>c.slug==="pitiu"&&c.status==="active");
  if(next){setClassId(next.id);setTitle("CTF 1 — Pitiú · próxima turma");}
 },[classes,classId]);
 useEffect(()=>{void refresh(selected).catch((e:Error)=>setError(e.message));},[selected,refresh]);
 useEffect(()=>{const timer=setInterval(()=>{
  setClock(Date.now());
  if(selected)void refresh(selected).catch(()=>{});
 },5000);return()=>clearInterval(timer);},[selected,refresh]);
 const selectedRound=dashboard?.round.id===selected?dashboard:null;
 const currentTeam=useMemo(()=>selectedRound?.teams.find(t=>t.team_id===teamSelected),[selectedRound,teamSelected]);
 const investigating=useMemo(()=>selectedRound?.teams.filter(t=>!t.excluded_at&&!!t.first_activity_at)??[],[selectedRound]);
 function closeAudit(){setTeamSelected("");setAudit(null);setScores({...zeroScores});setReason("");}
 async function discardRound(id:string){
  if(busy||!id||discardTarget!==id||discardReason.trim().length<10)return;
  setBusy(true);setError("");setNotice("");
  try{
   await rpc("ctf1_staff_discard_round",{p_round:id,p_reason:discardReason.trim()});
   const remaining=await rpc<Round[]>("ctf1_staff_list_rounds");
   if(remaining.some(r=>r.id===id))throw Error("O servidor ainda apresenta a rodada como ativa. Atualize o painel e confira o descarte.");
   setRounds(remaining);
   setDashboard(null);
   setSelected(remaining[0]?.id??"");
   closeAudit();
   setDiscardTarget("");setDiscardReason("");
   setNotice("Rodada de teste descartada e retirada das listas. Histórico e auditoria preservados.");
  }catch(e){setError("Não foi possível descartar: "+(e as Error).message);}
  finally{setBusy(false);}
 }
 const total=useMemo(()=>{try{return calculateOfficialCtf1Total(scores);}catch{return 0;}},[scores]);
 async function action(work:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await work();await load();if(selected)await refresh(selected);if(selected&&teamSelected)await refreshAudit(selected,teamSelected);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const {history:historicalRounds,upcoming:currentRounds}=splitCtfRounds(rounds,clock+timeDelta);
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
  {ready&&<>
   <div className="ctf-official-toolbar">
    <label>Rodada <select value={selected} onChange={e=>{setSelected(e.target.value);setTeamSelected("");setAudit(null);setDiscardTarget("");setDiscardReason("");}}>
     <option value="">Selecionar rodada</option>
     {currentRounds.length>0&&<optgroup label="Preparadas ou em andamento">{currentRounds.map(r=><option key={r.id} value={r.id}>{r.title} · {ctfRoundLabel(r,clock+timeDelta)}</option>)}</optgroup>}
     {historicalRounds.length>0&&<optgroup label="Histórico de CTFs">{historicalRounds.map(r=><option key={r.id} value={r.id}>{r.title} · finalizado</option>)}</optgroup>}
    </select></label>
    <button disabled={busy} onClick={()=>void action(async()=>{await load();if(selected)await refresh(selected);})}>Atualizar</button>
   </div>
   <details className="ctf-official-history" open={historyOpen} onToggle={e=>setHistoryOpen(e.currentTarget.open)}>
    <summary>Histórico de CTFs — atividades anteriores <span>({historicalRounds.length})</span></summary>
    <p>As rodadas finalizadas permanecem arquivadas por turma, com flags, write-ups, tempos e histórico de comandos para consulta e avaliação. Elas não são reiniciadas ao criar outra rodada.</p>
    {historicalRounds.length===0?<p>Nenhuma rodada concluída.</p>:<div className="ctf-official-table-wrap">
     <table><thead><tr><th>Atividade</th><th>Turma</th><th>Início</th><th>Encerramento</th><th>Duplas</th><th>Consulta</th></tr></thead>
      <tbody>{historicalRounds.map(r=><tr key={r.id}>
       <td><strong>{r.title}</strong></td>
       <td>{classes.filter(c=>r.class_ids?.includes(c.id)).map(c=>c.name).join(", ")||"—"}</td>
       <td>{r.started_at?new Date(r.started_at).toLocaleString("pt-BR"):"—"}</td>
       <td>{r.ends_at?new Date(r.ends_at).toLocaleString("pt-BR"):"—"}</td>
       <td>{r.teams??0}</td>
       <td><button type="button" disabled={busy} onClick={()=>{setSelected(r.id);closeAudit();setHistoryOpen(true);}}>Ver resultados e auditoria</button></td>
      </tr>)}</tbody></table>
    </div>}
   </details>
  </>}
  <details className="ctf-official-new" open>
   <summary>Preparar CTF para a próxima turma (não inicia automaticamente)</summary>
   <div className="ctf-official-form">
    <label>Título<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100}/></label>
    <fieldset><legend>Turma da rodada — selecione apenas uma</legend>
     {classes.filter(c=>c.status==="active").map(c=><label key={c.id}>
      <input type="radio" name="ctf-round-class" checked={classId===c.id}
       onChange={()=>{setClassId(c.id);setTitle("CTF 1 — "+c.name);}}/>
      {c.name} · todas as duplas ativas desta turma
     </label>)}
    </fieldset>
    <p><strong>Independente do CTF da tarde.</strong> Esta operação cria um novo identificador de rodada e inscreve apenas as duplas ativas da turma escolhida. As rodadas anteriores, notas, write-ups, flags e comandos permanecem disponíveis no histórico.</p>
    <button disabled={busy||!classId} onClick={()=>void action(async()=>{
      const classroom=classes.find(c=>c.id===classId);
      if(!classroom)throw Error("Selecione uma turma ativa para o novo CTF.");
      const id=await rpc<string>("ctf1_staff_create_round",{p_class_ids:[classId],p_title:title,p_mode:"test",p_team_ids:null});
      setSelected(id);setNotice("CTF independente criado para "+classroom.name+" como rascunho. O CTF anterior e suas auditorias permanecem preservados.");await refresh(id);
    })}>Criar novo CTF em rascunho</button>
   </div>
  </details>
  {display&&<section className="ctf-official-hero">
   <div><span className="ctf-official-tag">CTF 01 · REDES & LINUX</span><h3>{display.title}</h3>
    <p>O Rastro Trancado · O Invasor Insistente · A Impressão Digital, Quebra de MD5 e o Cofre</p>
    <small>Uma hora por rodada · 200 pontos máximos · servidor controla o horário</small>{historicalRounds.some(r=>r.id===display.id)&&<p><strong>Atividade anterior: resultados e auditoria preservados.</strong> A nova turma usa outra rodada.</p>}</div>
   <div className="ctf-official-actions">
    {display.state==="draft"&&<button disabled={busy} onClick={()=>{
      if(!window.confirm("Iniciar agora o CTF por 60 minutos para todas as duplas selecionadas? O relógio não será reiniciado."))return;
      void action(async()=>{await rpc("ctf1_staff_start_round",{p_round:selected});setNotice("Rodada iniciada para as duplas.");});
    }}>Iniciar CTF</button>}
    {display.state==="running"&&rounds.some(r=>r.id===display.id&&r.mode==="test")&&
     <button type="button" disabled={busy||!display.ends_at||Date.now()+timeDelta>=Date.parse(display.ends_at)} title="Acrescentar 10 minutos ao horário final, sem reiniciar o Linux" onClick={()=>{
      if(!window.confirm("Acrescentar 10 minutos ao CTF desta turma? A rodada e os terminais continuam em andamento. Esta ação fica registrada na auditoria."))return;
      const roundId=display.id;
      void action(async()=>{
       const change=await rpc<{minutes_added:number;new_ends_at:string}>("ctf1_staff_extend_round_10m",{p_round:roundId});
       await refresh(roundId);
       setNotice("Mais 10 minutos concedidos. Novo encerramento: "+
        new Date(change.new_ends_at).toLocaleTimeString("pt-BR")+
        ". Terminais, write-ups e auditoria preservados.");
      });
     }}>+10 minutos</button>}
    {display.state==="running"&&<button disabled={busy} onClick={()=>{
      if(!window.confirm("Encerrar antecipadamente a rodada? Novas flags e write-ups serão bloqueados."))return;
      void action(async()=>{await rpc("ctf1_staff_end_round",{p_round:selected});setNotice("Rodada encerrada.");});
    }}>Encerrar rodada</button>}
    {rounds.some(r=>r.id===display.id&&r.mode==="test")&&(display.state==="draft"||display.state==="running"||display.state==="ended")&&
      <button className="ctf-official-discard" type="button" disabled={busy}
       aria-expanded={discardTarget===display.id}
       onClick={()=>{setDiscardTarget(previous=>previous===display.id?"":display.id);setDiscardReason("");}}>
       {discardTarget===display.id?"Cancelar descarte":"Descartar rodada de teste"}
      </button>}
   </div>
   {discardTarget===display.id&&<div className="ctf-official-discard-form" role="group" aria-label="Confirmar descarte da rodada">
    <p><strong>Descartar somente “{display.title}”?</strong> Essa ação encerra a rodada e a retira das listas dos alunos e professores, mas preserva notas, evidências e auditorias. Não pode ser desfeita.</p>
    <label>Justificativa do descarte (10 a 500 caracteres)
     <textarea value={discardReason} maxLength={500} rows={2} onChange={e=>setDiscardReason(e.target.value)} placeholder="Ex.: Rodada criada somente para testes de funcionamento"/></label>
    <button type="button" className="ctf-official-discard" disabled={busy||discardReason.trim().length<10} onClick={()=>void discardRound(display.id)}>
     {busy?"Descartando...":"Confirmar descarte definitivo"}</button>
   </div>}
  </section>}
  {selectedRound&&<><div className="ctf-official-kpis">
   <div><small>Duplas na rodada</small><strong>{selectedRound.teams.filter(t=>!t.excluded_at).length}</strong></div>
   <div><small>Três desafios concluídos</small><strong>{selectedRound.teams.filter(t=>t.delivered?.length===3&&!t.excluded_at).length}</strong></div>
   <div><small>Iniciaram o laboratório</small><strong>{investigating.length}</strong><small>Atividade registrada no terminal</small></div>
   <div><small>Auditorias avaliadas</small><strong>{selectedRound.teams.filter(t=>t.audited_at&&!t.excluded_at).length}</strong></div>
  </div>
  <details className="ctf-official-panel ctf-official-collapsible" aria-label="Duplas que iniciaram o laboratório">
   <summary>Duplas que iniciaram o laboratório <span>{investigating.length} duplas</span></summary>
   <p className="ctf-official-footnote">Atualização a cada 5 segundos. <code>cat missao.txt</code> é identificado quando o comando completo foi registrado. Atividade registrada não garante conexão ativa neste instante.</p>
   {investigating.length===0?<p>Aguardando os primeiros comandos das duplas.</p>:<div className="ctf-official-table-wrap"><table>
    <thead><tr><th>Dupla</th><th>Primeira atividade</th><th>Missão</th><th>Última atividade</th><th>Ação</th></tr></thead>
    <tbody>{investigating.map(t=><tr key={t.team_id}>
     <td><strong>{t.public_name}</strong></td>
     <td>{new Date(t.first_activity_at!).toLocaleTimeString("pt-BR")}</td>
     <td>{t.mission_opened_at?"missao.txt consultado":"Terminal em uso"}</td>
     <td>{new Date(t.last_activity_at!).toLocaleTimeString("pt-BR")}</td>
     <td><button type="button" disabled={busy} onClick={()=>{setTeamSelected(t.team_id);setAudit(null);void refreshAudit(selected,t.team_id).catch(e=>setError((e as Error).message));}}>Auditar</button></td>
    </tr>)}</tbody>
   </table></div>}
  </details>
  <div className={teamSelected?"ctf-official-grid":"ctf-official-grid ctf-official-grid--single"}><details className="ctf-official-panel ctf-official-collapsible" open>
   <summary>Progresso por dupla <span>{selectedRound.teams.length} duplas</span></summary>
   <div className="ctf-official-table-wrap"><table><thead><tr><th>Dupla</th><th>Turma</th><th>Desafio atual</th><th>Flags corretas</th><th>Entregues</th><th>Tempo total</th><th>Atividade</th><th>Avaliação</th><th>Ação</th></tr></thead><tbody>
   {selectedRound.teams.map(t=><tr key={t.team_id}>
    <td><strong>{t.public_name}</strong>{t.excluded_at&&<small> · Participação excluída</small>}</td>
    <td>{classes.find(c=>c.id===t.class_id)?.name??"—"}</td>
    <td>{t.delivered?.length===3?"Concluído":`Desafio ${[1,2,3].find(n=>!t.delivered?.includes(n))??1}`}</td><td><strong>{t.correct?.length??0}/3</strong></td><td>{t.delivered?.length??0}/3</td><td>{duration(t.total_seconds)}</td><td>{t.mission_opened_at?"Missão lida":t.first_activity_at?"Investigando":"Aguardando"}</td>
    <td>{t.audited_at?"Avaliada":"Pendente"}</td>
    <td><button disabled={busy} onClick={()=>{setTeamSelected(t.team_id);setAudit(null);void refreshAudit(selected,t.team_id).catch(e=>setError((e as Error).message));}}>Auditar</button></td>
   </tr>)}</tbody></table></div>
  </details>{teamSelected&&<section className="ctf-official-panel">
   <div className="ctf-official-audit-heading"><h3>Auditoria individual</h3><button type="button" onClick={closeAudit} aria-label="Fechar auditoria individual">✕ Fechar auditoria</button></div>
   {!currentTeam&&<p>Selecione uma dupla para conferir entregas, write-ups e notas.</p>}
   {currentTeam&&<><h4>{currentTeam.public_name}</h4>
    <p>{currentTeam.excluded_at?"Excluída desta rodada":"Participação ativa"} · {currentTeam.correct?.length??0}/3 flags corretas · {currentTeam.delivered?.length??0}/3 desafios entregues</p>
    {audit&&audit.team_id===currentTeam.team_id&&<>
     <details open><summary>Resultado por desafio e tempo</summary>
      <div className="ctf-official-table-wrap"><table><thead><tr><th>Desafio</th><th>Entrega</th><th>Flag</th><th>Tempo</th></tr></thead><tbody>
       {[1,2,3].map(n=>{const item=currentTeam.challenge_times?.find(c=>c.challenge===n);return <tr key={n}><td>Desafio {n}</td><td>{item?"Entregue":"Pendente"}</td><td>{!item?"—":item.flag_accepted===true?"Correta":item.flag_accepted===false?"Incorreta":"Não verificada"}</td><td>{duration(item?.seconds)}</td></tr>;})}
      </tbody></table></div><p><strong>Tempo total da dupla: {duration(currentTeam.total_seconds)}</strong></p>
     </details>
     <details><summary>Validação de flags e evidências</summary><div className="ctf-official-scroll">
      {audit.submissions.map((s,i)=><p key={i}>D{s.challenge}: {s.accepted?"Flag correta":"Flag incorreta"} · {new Date(s.submitted_at).toLocaleString("pt-BR")}</p>)}
      {audit.submissions.length===0&&<p>Nenhuma flag submetida.</p>}
     </div></details>
     <details><summary>Write-ups salvos</summary>
      {[1,2,3].map(n=><div key={n}><h5>Desafio {n}</h5>
       <pre>{JSON.stringify(audit.writeups[String(n)]??{},null,2)}</pre></div>)}
     </details>
     <details className="ctf-audit-history"><summary>Histórico de comandos por desafio</summary>
      <p className="ctf-official-footnote">Somente comandos recebidos pelo servidor. Os comandos anteriores à classificação por desafio permanecem em "Sem classificação", sem atribuição presumida.</p>
      {[1,2,3,0].map(n=>{
       const entries=audit.events.filter(e=>e.kind==="terminal_event"&&(typeof e.detail==="object"&&e.detail!==null&&"challenge_no" in e.detail&&Number((e.detail as {challenge_no?:unknown}).challenge_no)===n || n===0&&!(typeof e.detail==="object"&&e.detail!==null&&"challenge_no" in e.detail)));
       return <details key={n} className="ctf-audit-command-group">
        <summary>{n===0?"Sem classificação (histórico anterior)":"Desafio "+n} <span>{entries.length} comandos</span></summary>
        {entries.length===0?<p>Nenhum comando registrado.</p>:<ol className="ctf-audit-command-list">
         {entries.map((e,i)=><li key={i}><time>{new Date(e.at).toLocaleTimeString("pt-BR")}</time><code>{String((e.detail as {command?:unknown})?.command??"")}</code></li>)}
        </ol>}
       </details>;
      })}
     </details>
     <details><summary>Demais eventos de auditoria</summary><div className="ctf-official-scroll">
      {audit.events.filter(e=>e.kind!=="terminal_event").map((event,i)=><p key={i}><b>{event.kind}</b> · {new Date(event.at).toLocaleString("pt-BR")} · {JSON.stringify(event.detail)}</p>)}
     </div></details>
     <fieldset><legend>Sugerir pontuação para lançamento (máx. 200 pontos)</legend>
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
       setNotice(`Sugestão de ${amount}/200 salva na auditoria. Acesse CTF Pontuação para conferir o tempo e registrar oficialmente.`);
      })}>Salvar sugestão da auditoria</button>
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
  </section>}</div></>}
  <p className="ctf-official-footnote">Entregar todos os desafios não significa acertar todas as flags. O tempo por desafio é calculado no servidor entre o início registrado e a entrega. As notas continuam separadas do ranking legado. O histórico enviado pelo navegador é telemetria não confiável: a validação de flags e o horário precisam ser conferidos no servidor.</p>
 </section>;
}
