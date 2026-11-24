import { useEffect, useRef, useState, type FormEvent } from "react";
import { rpc } from "./api";
import "./ctf-review-browser.css";
type Kind="vm_boot"|"vm_ready"|"lab_setup"|"command"|"output"|"challenge"|"writeup"|"vm_stop"|"error";
type E={kind:Kind;detail:string};
type W={command:string;reason:string;evidence:string};
type Run={id:string;title:string;started_at:string;closed_at:string|null;writeup:Record<string,W>};
type Event={id:number;at:string;kind:Kind;detail:string};
type Report={run:Run;events:Event[];truncated:boolean};
type VM={add_listener:(name:string,fn:(byte:number)=>void)=>void;serial0_send:(command:string)=>void;stop:()=>void;destroy:()=>void};
declare global{interface Window{V86?:new(opts:Record<string,unknown>)=>VM}}
const steps=[
 ["Navegação e Arquivos Ocultos","Use pwd, ls -la, find /var/tmp e cat."],
 ["Permissões e Grupos Restritos","Verifique ~/desafios/permissoes/segredo.txt e utilize chmod g+r."],
 ["Mineração de Logs","Encontre o IP com mais falhas em ~/desafios/logs/auth.log com grep, sort, uniq."],
 ["Mensagem Secreta no DNS","Utilize dig @127.0.0.1 ctf.hackerspaidegua.local TXT (zona didática pré-programada)."]
];
const assets=import.meta.env.BASE_URL+"ctf-v86/";
const quote=(v:string)=>"'"+v.replaceAll("'","'\\''")+"'";
const initCommands=(seed:string)=>[
 "mkdir -p /var/tmp/relatorios/.auditoria /home/aluno/desafios/permissoes /home/aluno/desafios/logs /tmp/ctf-bin",
 "echo 'investigadores:x:1300:' >> /etc/group",
 "printf '%s\\n' "+quote("FLAG{ARQUIVO_REVIS_"+seed+"}")+" > /var/tmp/relatorios/.auditoria/.relatorio.txt",
 "printf '%s\\n' "+quote("FLAG{GRUPO_REVIS_"+seed+"}")+" > /home/aluno/desafios/permissoes/segredo.txt",
 "chgrp investigadores /home/aluno/desafios/permissoes/segredo.txt; chmod 600 /home/aluno/desafios/permissoes/segredo.txt",
 "printf '%s\\n' '# auth.log (dados fictícios)' > /home/aluno/desafios/logs/auth.log",
 "for i in 1 2 3 4 5 6 7 8 9; do echo 'Failed password for test from 198.51.100.44 port 2222 ssh2' >> /home/aluno/desafios/logs/auth.log; done",
 "for i in 1 2 3 4; do echo 'Failed password for guest from 203.0.113.7 port 2222 ssh2' >> /home/aluno/desafios/logs/auth.log; done",
 "printf '%s\\n' '#!/bin/sh' 'echo \"ctf.hackerspaidegua.local. IN TXT \\\"FLAG{DNS_REVIS_"+seed+"}\\\"\"' > /tmp/ctf-bin/dig",
 "chmod +x /tmp/ctf-bin/dig; export PATH=/tmp/ctf-bin:$PATH",
 "printf '%s\\n' 'REVISAO PRE-CTF (sem pontos)' '1) find /var/tmp -name \".*\"' '2) chmod g+r /home/aluno/desafios/permissoes/segredo.txt' '3) cat /home/aluno/desafios/logs/auth.log' '4) dig @127.0.0.1 ctf.hackerspaidegua.local TXT' > /home/aluno/missao.txt",
 "cd /home/aluno; echo HPDE_LAB_PRONTO"
];
let scriptPromise:Promise<void>|undefined;
function library(){
 if(window.V86)return Promise.resolve();
 if(!scriptPromise)scriptPromise=new Promise<void>((resolve,reject)=>{
  const s=document.createElement("script");s.src=assets+"libv86.js";s.async=true;
  s.onload=()=>window.V86?resolve():reject(Error("v86 não carregou corretamente"));
  s.onerror=()=>reject(Error("Assets do v86 indisponíveis. Execute o script de preparação antes de compilar."));
  document.head.append(s);
 }).catch(e=>{scriptPromise=undefined;throw e;});
 return scriptPromise;
}
function download(name:string,data:string){const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const date=(s:string)=>new Date(s).toLocaleString("pt-BR");
export default function CtfReviewBrowser(){
 const [run,setRun]=useState<Run|null>(null),[history,setHistory]=useState<Run[]>([]);
 const [report,setReport]=useState<Report|null>(null),[status,setStatus]=useState("Pronto para iniciar");
 const [error,setError]=useState(""),[input,setInput]=useState(""),[ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false),[challenge,setChallenge]=useState(0),[flag,setFlag]=useState("");
 const [solved,setSolved]=useState<number[]>([]),[writeups,setWriteups]=useState<Record<string,W>>({});
 const [saved,setSaved]=useState(0),[pending,setPending]=useState(0);
 const screen=useRef<HTMLTextAreaElement>(null),machine=useRef<VM|null>(null);
 const script=useRef<string[]>([]),stage=useRef(-1),tail=useRef(""),out=useRef("");
 const events=useRef<E[]>([]),locked=useRef(false),activeRun=useRef<string|null>(null);
 const readyRef=useRef(false),mounted=useRef(true);
 const current=writeups[String(challenge)]||{command:"",reason:"",evidence:""};
 useEffect(()=>{mounted.current=true;void rpc<Run[]>("ctf_teacher_review_history").then(setHistory).catch(e=>setError((e as Error).message));
  return()=>{mounted.current=false;machine.current?.stop();machine.current?.destroy();machine.current=null;};},[]);
 const record=(kind:Kind,detail:string)=>{if(!activeRun.current)return;
  for(const part of detail.match(/[\s\S]{1,2400}/g)||[""])events.current.push({kind,detail:part});
  if(events.current.length>2000){events.current.splice(0,events.current.length-2000);setError("Buffer de auditoria cheio.");}
  setPending(events.current.length);};
 async function sync(){if(locked.current||!activeRun.current)return;locked.current=true;
  try{while(events.current.length&&activeRun.current){const batch=events.current.splice(0,20);
   try{const n=await rpc<number>("ctf_teacher_review_append",{p_run:activeRun.current,p_events:batch});
    if(mounted.current){setSaved(x=>x+n);setPending(events.current.length);}
   }catch(e){events.current.unshift(...batch);setError("Auditoria pendente: "+(e as Error).message);break;}
  }}finally{locked.current=false;}}
 useEffect(()=>{const id=setInterval(()=>{if(out.current){record("output",out.current);out.current="";}void sync();},1250);
  return()=>clearInterval(id);});
 const print=(text:string)=>{if(!screen.current)return;const el=screen.current;el.value=(el.value+text).slice(-90000);el.scrollTop=el.scrollHeight;};
 const reload=async()=>setHistory(await rpc<Run[]>("ctf_teacher_review_history"));
 async function start(){if(busy)return;setBusy(true);setError("");setStatus("Criando sessão...");
  try{
   const id=await rpc<string>("ctf_teacher_review_start");activeRun.current=id;
   setRun({id,title:"Revisão Pré-CTF",started_at:new Date().toISOString(),closed_at:null,writeup:{}});
   setSolved([]);setWriteups({});setSaved(0);setReport(null);setReady(false);readyRef.current=false;
   record("vm_boot","Linux emulado v86 iniciado pelo professor");
   setStatus("Carregando imagem Linux...");await library();
   if(!window.V86)throw Error("v86 indisponível");
   script.current=initCommands(Math.random().toString(16).slice(2,8).toUpperCase());
   stage.current=-1;tail.current="";if(screen.current)screen.current.value="Inicializando v86 + Linux...\\n";
   const vm=new window.V86({
     wasm_path:assets+"v86.wasm",bios:{url:assets+"seabios.bin"},vga_bios:{url:assets+"vgabios.bin"},
     bzimage:{url:assets+"buildroot-bzimage68.bin",async:false},filesystem:{},
     memory_size:96*1024*1024,vga_memory_size:2*1024*1024,
     cmdline:"tsc=reliable mitigations=off random.trust_cpu=on",autostart:true,disable_keyboard:true
   });machine.current=vm;setStatus("Linux inicializando...");
   vm.add_listener("serial0-output-byte",byte=>{const char=String.fromCharCode(byte);if(char==="\r")return;
     tail.current=(tail.current+char).slice(-350);
     if(!readyRef.current){
       if(stage.current===-1 && /(?:~% |# |\$ )$/.test(tail.current)){
         stage.current=0;setStatus("Preparando quatro desafios...");
         vm.serial0_send(script.current[0]+"; echo HPDE_STEP_0\n");
       }else if(stage.current>=0&&tail.current.includes("HPDE_STEP_"+stage.current)){
         tail.current="";
         if(stage.current<script.current.length-1){stage.current++;vm.serial0_send(script.current[stage.current]+"; echo HPDE_STEP_"+stage.current+"\n");}
         else{readyRef.current=true;setReady(true);record("vm_ready","Linux e quatro desafios preparados");setStatus("Pronto · digite cat missao.txt");print("\nLinux pronto. Use cat missao.txt\n");}
       }
       return;
     }
     print(char);out.current+=char;if(out.current.length>2000){record("output",out.current);out.current="";}
   });
   await reload();
  }catch(e){setError((e as Error).message);record("error",(e as Error).message);setStatus("Falha ao iniciar");}
  finally{setBusy(false);}
 }
 const send=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!readyRef.current||!machine.current||!input.trim())return;
   record("command",input.trim());machine.current.serial0_send(input+"\n");setInput("");};
 const validate=()=>{const keys=["FLAG{ARQUIVO_REVIS_","FLAG{GRUPO_REVIS_","FLAG{IP_198.51.100.44}","FLAG{DNS_REVIS_"];
  if(flag.trim().startsWith(keys[challenge])&&flag.trim().endsWith("}")){
   if(!solved.includes(challenge)){setSolved(v=>[...v,challenge]);record("challenge","Objetivo "+(challenge+1)+" confirmado sem pontos");}
  }else setError("Flag inválida. Verifique o terminal.");setFlag("");};
 const edit=(field:keyof W,value:string)=>setWriteups(v=>({...v,[String(challenge)]:{...current,[field]:value}}));
 async function saveWriteup(){if(!activeRun.current)return;setBusy(true);
  try{await rpc("ctf_teacher_review_writeup",{p_run:activeRun.current,p_writeup:writeups});record("writeup","Write-up salvo");await sync();setStatus("Write-up salvo no Supabase");}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function close(){if(!activeRun.current)return;setBusy(true);
  try{record("vm_stop","Revisão demonstrativa encerrada");if(out.current){record("output",out.current);out.current="";}
   await sync();await rpc("ctf_teacher_review_close",{p_run:activeRun.current});
   machine.current?.stop();machine.current?.destroy();machine.current=null;activeRun.current=null;
   readyRef.current=false;setReady(false);setRun(null);setStatus("Encerrada; histórico salvo no Supabase");await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function audit(id:string){setBusy(true);try{setReport(await rpc<Report>("ctf_teacher_review_report",{p_run:id}));}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="ctf-browser">
  <div className="ctf-browser-head"><div><p>HACKERS PAI D'ÉGUA / REVISÃO PRÉ-CTF</p>
   <h2>Laboratório Linux do professor</h2><small>v86 + Buildroot · 4 desafios · sem notas nem pontos</small></div>
   {run?<button onClick={()=>void close()} disabled={busy}>Encerrar demonstração</button>:
    <button onClick={()=>void start()} disabled={busy}>Iniciar demonstração</button>}</div>
  <p role="status" className="ctf-browser-status">{status}</p>{error&&<p role="alert" className="error">{error}</p>}
  <div className="ctf-browser-stats"><div>Progresso <strong>{solved.length}/4</strong></div>
    <div>Auditoria <strong>{saved} eventos</strong></div><div>Sincronização <strong>{pending} pendentes</strong></div></div>
  {run&&<><div className="ctf-browser-terminal"><p>Linux real emulado localmente no navegador, sem executor Docker.</p>
    <textarea ref={screen} readOnly aria-label="Saída serial da máquina Linux"/>
    <form onSubmit={send}><label htmlFor="ctf-browser-command">aluno@hackers-ctf:~$</label>
      <input id="ctf-browser-command" disabled={!ready} value={input} onChange={e=>setInput(e.target.value)} spellCheck={false}/>
      <button disabled={!ready}>Executar</button></form>
    <button disabled={!ready} onClick={()=>machine.current?.serial0_send("\x03")}>Ctrl+C</button>
    <button onClick={()=>{if(screen.current)screen.current.value="";}}>Limpar tela</button>
   </div>
   <div className="ctf-browser-tabs">{steps.map(([title],i)=><button key={i} className={i===challenge?"selected":""}
    onClick={()=>{setChallenge(i);setFlag("");}}>{solved.includes(i)?"✓ ":""}{i+1}. {title}</button>)}</div>
   <div className="ctf-browser-card"><h3>{steps[challenge][0]}</h3><p>{steps[challenge][1]}</p>
    {challenge===3&&<p><strong>Aviso:</strong> o DNS TXT é representado por um script da VM; não é consulta a um servidor DNS real.</p>}
    <input value={flag} onChange={e=>setFlag(e.target.value)} placeholder="FLAG{...}"/>
    <button onClick={validate} disabled={!ready}>Confirmar descoberta</button>
    <h3>Write-up formativo</h3>
    <label>Comando utilizado<textarea value={current.command} onChange={e=>edit("command",e.target.value)}/></label>
    <label>Raciocínio técnico<textarea value={current.reason} onChange={e=>edit("reason",e.target.value)}/></label>
    <label>Evidência<textarea value={current.evidence} onChange={e=>edit("evidence",e.target.value)}/></label>
    <button disabled={busy} onClick={()=>void saveWriteup()}>Salvar write-up no Supabase</button>
   </div></>}
  <div className="ctf-browser-card"><h3>Histórico de demonstrações</h3>
   <button onClick={()=>void reload().catch(e=>setError((e as Error).message))}>Atualizar</button>
   {history.map(r=><div key={r.id} className="ctf-browser-history"><span>{date(r.started_at)} · {r.closed_at?"Encerrada":"Em andamento"}</span>
    <button disabled={busy} onClick={()=>void audit(r.id)}>Auditoria</button></div>)}</div>
  {report&&<div className="ctf-browser-card"><h3>Auditoria — {date(report.run.started_at)}</h3>
   <p>{report.events.length} eventos; registros fornecidos pelo navegador, não são prova pericial.</p>
   <button onClick={()=>download("revisao_ctf_auditoria.json",JSON.stringify(report,null,2))}>Exportar JSON</button>
   <div className="ctf-browser-events">{report.events.map(e=><div key={e.id}><time>{date(e.at)}</time><b>{e.kind}</b><span>{e.detail}</span></div>)}</div>
  </div>}
 </section>;
}
