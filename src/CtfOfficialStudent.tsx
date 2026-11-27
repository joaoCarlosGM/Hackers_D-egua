import { useCallback, useEffect, useRef, useState } from "react";
import {
 assets,library,loadTerminal,loadAula07Evidence,
 type VM,type XtermHandle,type XtermFit
} from "./CtfReviewBrowser";
import { decryptAula07Ciphertext,extractAula07CryptoRequest } from "./ctfReviewCryptoBridge";
import { generateCtf1TestCommands,type Ctf1TestFixture } from "./ctfOfficialTestFixture";
import { rpc } from "./api";
import { reviewMissions } from "./ctfReviewMissions";
import "./ctf-review-browser.css";
import "./ctf-official-admin.css";

type R={round_id:string;title:string;state:string;mode:string;ends_at:string;server_now:string;excluded:boolean};
type W={command:string;reason:string;evidence:string};
type Props={token:string;name:string};
export default function CtfOfficialStudent({token,name}:Props){
 const [rounds,setRounds]=useState<R[]>([]),[selected,setSelected]=useState("");
 const [status,setStatus]=useState("Aguardando liberação do professor");
 const [ready,setReady]=useState(false),[error,setError]=useState("");
 const [loading,setLoading]=useState(false),[clock,setClock]=useState(Date.now());
 const [offset,setOffset]=useState(0),[active,setActive]=useState(false);
 const [challenge,setChallenge]=useState(0),[flag,setFlag]=useState("");
 const [solved,setSolved]=useState<number[]>([]);
 const [writeupOpen,setWriteupOpen]=useState(false);
 const [writeups,setWriteups]=useState<Record<number,W>>({});
 const [saveState,setSaveState]=useState("");
 const host=useRef<HTMLDivElement>(null),terminal=useRef<XtermHandle|null>(null),fit=useRef<XtermFit|null>(null);
 const subscription=useRef<{dispose:()=>void}|null>(null),resize=useRef<ResizeObserver|null>(null);
 const vm=useRef<VM|null>(null),readyRef=useRef(false),mounted=useRef(true);
 const stage=useRef(-1),tail=useRef(""),commands=useRef<string[]>([]),isVerified=useRef(false);
 const timeout=useRef<ReturnType<typeof setTimeout>|null>(null),watchdog=useRef<ReturnType<typeof setInterval>|null>(null);
 const pending=useRef(""),payload=useRef<string|null>(null),editing=useRef(false);
 const editor=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const inLine=useRef(""),commandHistory=useRef<string[]>([]);
 useEffect(()=>{
  if(!selected)return;
  void rpc<{solved:number[];writeups:Record<string,W>}>("ctf1_student_progress",{p_token:token,p_round:selected})
   .then(result=>{
    if(!mounted.current)return;
    setSolved((result.solved??[]).map(n=>n-1).filter(n=>n>=0&&n<3));
    const drafts:Record<number,W>={};
    for(const [key,value] of Object.entries(result.writeups??{})){
     const k=Number(key)-1;if(k>=0&&k<3)drafts[k]=value;
    }
    setWriteups(drafts);
   }).catch(()=>{});
 },[selected,token]);
 const round=rounds.find(r=>r.round_id===selected);
 const endsAt=round?.ends_at?Date.parse(round.ends_at):0;
 const seconds=Math.max(0,Math.ceil((endsAt-clock-offset)/1000));
 const running=round?.state==="running"&&!round.excluded&&seconds>0;
 const print=(value:string)=>terminal.current?.write(value.replace(/\r?\n/g,"\r\n"));
 const stop=useCallback(()=>{
  if(timeout.current)clearTimeout(timeout.current);timeout.current=null;
  if(watchdog.current)clearInterval(watchdog.current);watchdog.current=null;
  readyRef.current=false;vm.current?.stop();vm.current?.destroy();vm.current=null;
  resize.current?.disconnect();resize.current=null;subscription.current?.dispose();subscription.current=null;
  terminal.current?.dispose();terminal.current=null;fit.current=null;
  setActive(false);setReady(false);
 },[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[stop]);
 const refresh=useCallback(async()=>{
  const data=await rpc<R[]>("ctf1_student_status",{p_token:token});
  if(!mounted.current)return;
  const sorted=data??[];
  setRounds(sorted);
  setSelected(prev=>sorted.some(r=>r.round_id===prev)?prev:(sorted[0]?.round_id??""));
  const current=sorted.find(r=>r.round_id===selected)||sorted[0];
  if(current?.server_now)setOffset(Date.parse(current.server_now)-Date.now());
 },[token,selected]);
 useEffect(()=>{void refresh().catch(e=>setError((e as Error).message));const timer=setInterval(()=>{setClock(Date.now());void refresh().catch(()=>{});},5000);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{if(active&&!running){stop();setStatus("Rodada encerrada. O terminal foi desligado e novas entregas estão bloqueadas.");}},[active,running,stop]);
 useEffect(()=>{
  if(!writeupOpen)return;
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  const handler=(event:KeyboardEvent)=>{if(editor.current?.contains(event.target as Node)){event.stopImmediatePropagation();if(event.key==="Escape"){event.preventDefault();setWriteupOpen(false);}}};
  document.addEventListener("keydown",handler,true);
  const frame=requestAnimationFrame(()=>input.current?.focus({preventScroll:true}));
  return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",handler,true);cancelAnimationFrame(frame);};
 },[writeupOpen,challenge]);
 function focus(){
  if(editing.current||writeupOpen)return;
  terminal.current?.focus();
 }
 function onData(value:string){
  if(!readyRef.current||!vm.current||!running||writeupOpen||editing.current)return;
  vm.current.serial0_send(value.replace(/\r/g,"\n"));
  for(const ch of value){
   if(ch==="\r"||ch==="\n"){
    if(inLine.current.trim()){
     commandHistory.current.push(inLine.current.slice(0,220));
     // Terminal commands are client telemetry, not a trusted proof of progress.
    }inLine.current="";
   }else if(ch==="\u007f"||ch==="\b")inLine.current=inLine.current.slice(0,-1);
   else if(ch>=" "&&ch<="~")inLine.current=(inLine.current+ch).slice(-220);
  }
 }
 async function start(){
  if(!round||!running||loading||active)return;
  setError("");setLoading(true);setStatus("Preparando Linux real para "+name);
  try{
   const fixture=await rpc<Ctf1TestFixture>("ctf1_student_fixture",{p_token:token,p_round:selected});
   if(fixture.mode!=="test")throw Error("A variante não está autorizada para navegador");
   await Promise.all([library(),loadTerminal()]);
   const bundle=await loadAula07Evidence();
   commands.current=await generateCtf1TestCommands(fixture,bundle);
   if(!window.Terminal||!window.FitAddon?.FitAddon||!window.V86)throw Error("Componentes do terminal indisponíveis");
   setActive(true);
   await new Promise<void>((resolve,reject)=>{
    const limit=Date.now()+7000;const check=()=>{
     if(!mounted.current)return reject(Error("Laboratório desmontado"));
     if(host.current)return resolve();
     if(Date.now()>limit)return reject(Error("Terminal não montado"));
     setTimeout(check,40);
    };check();
   });
   const t=new window.Terminal({cursorBlink:true,convertEol:true,
    fontFamily:'"Cascadia Code", Consolas, monospace',fontSize:16,lineHeight:1.42,
    scrollback:2000,theme:{background:"#091321",foreground:"#dbe8e8",cursor:"#55e0b8"}});
   const a=new window.FitAddon.FitAddon();
   t.loadAddon(a);t.open(host.current!);fit.current=a;terminal.current=t;
   subscription.current=t.onData(onData);
   resize.current=new ResizeObserver(()=>{try{a.fit();}catch{/* Resizing a detached terminal is safe to ignore. */}});
   resize.current.observe(host.current!);
   requestAnimationFrame(()=>{a.fit();t.focus();});
   t.writeln("HACKERS PAI D'EGUA · CTF 01 · LINUX REAL / MODO TESTE");
   t.writeln("Preparando desafios exclusivos desta dupla...");
   stage.current=-1;tail.current="";isVerified.current=false;
   pending.current="";payload.current=null;readyRef.current=false;
   const machine=new window.V86({wasm_path:assets+"v86.wasm",
    bios:{url:assets+"seabios.bin"},vga_bios:{url:assets+"vgabios.bin"},
    bzimage:{url:assets+"buildroot-bzimage68.bin",async:false},
    filesystem:{},memory_size:96*1024*1024,vga_memory_size:2*1024*1024,
    cmdline:"tsc=reliable mitigations=off random.trust_cpu=on",
    autostart:true,disable_keyboard:true,disable_speaker:true});
   vm.current=machine;
   let lastMark=Date.now();
   timeout.current=setTimeout(()=>{if(!readyRef.current&&mounted.current){setError("Inicialização Linux excedeu o limite de três minutos.");setStatus("Falha ao iniciar laboratório");}},180000);
   watchdog.current=setInterval(()=>{if(!readyRef.current&&stage.current>=0&&Date.now()-lastMark>50000)setError("Preparação sem resposta na etapa "+(stage.current+1));},5000);
   machine.add_listener("serial0-output-byte",byte=>{
    if(!mounted.current||vm.current!==machine)return;
    const char=String.fromCharCode(byte);
    if(char!=="\r")tail.current=(tail.current+char).slice(-420);
    if(tail.current.includes("\nHPDE_LAB_PRONTO\n"))isVerified.current=true;
    if(!readyRef.current){
     if(stage.current===-1&&/(?:~% |# |\$ )$/.test(tail.current)){
      stage.current=0;lastMark=Date.now();setStatus("Preparando arquivos e ferramentas...");
      machine.serial0_send(commands.current[0]+"; printf '\\nHPDE_STUDENT_MARK_0\\n'\n");
     }else if(stage.current>=0&&tail.current.includes("\nHPDE_STUDENT_MARK_"+stage.current+"\n")){
      tail.current="";lastMark=Date.now();
      if(stage.current<commands.current.length-1){
       stage.current++;setStatus("Preparando etapa "+(stage.current+1)+"/"+commands.current.length);
       machine.serial0_send(commands.current[stage.current]+"; printf '\\nHPDE_STUDENT_MARK_"+stage.current+"\\n'\n");
      }else if(isVerified.current){
       if(timeout.current)clearTimeout(timeout.current);
       if(watchdog.current)clearInterval(watchdog.current);
       readyRef.current=true;setReady(true);
       setStatus("Linux pronto · digite cat missao.txt");
       print("\nLinux pronto. Digite cat missao.txt para começar.\n\n");
       t.focus();
      }else{setError("A VM não passou na verificação final.");setStatus("Falha na preparação");}
     }
     return;
    }
    // The browser decrypts genuine AES/PBKDF2; encoded plaintext/password are
    // internal, never printed to the xterm or written in audit logs.
    const prefix="\nHPDE_CRYPT_REQ:";
    if(payload.current!==null){
     if(char==="\n"){
      const req=extractAula07CryptoRequest("HPDE_CRYPT_REQ:"+payload.current.replace(/\r$/,""));
      payload.current=null;
      if(req)void decryptAula07Ciphertext(req.ciphertext64,req.password64).then(result=>{
       if(vm.current!==machine||!readyRef.current)return;
       machine.serial0_send(result.ok?"HPDE_CRYPT_OK:"+result.base64+"\n":"HPDE_CRYPT_ERR\n");
      });
      else machine.serial0_send("HPDE_CRYPT_ERR\n");
     }else if(payload.current.length<10000)payload.current+=char;
     else{payload.current=null;machine.serial0_send("HPDE_CRYPT_ERR\n");}
     return;
    }
    pending.current+=char;
    while(pending.current&&!prefix.startsWith(pending.current)){
     t.write(pending.current[0]);pending.current=pending.current.slice(1);
    }
    if(pending.current===prefix){pending.current="";payload.current="";}
   });
  }catch(e){setError((e as Error).message);setStatus("Não foi possível iniciar Linux");stop();}
  finally{setLoading(false);}
 }
 async function submit(){
  if(!running||!ready||!flag.trim())return;
  setLoading(true);setError("");
  try{
   const result=await rpc<{accepted:boolean;solved_count:number}>("ctf1_student_submit_flag",
    {p_token:token,p_round:selected,p_challenge:challenge+1,p_flag:flag.trim()});
   if(result.accepted){setSolved(prev=>prev.includes(challenge)?prev:[...prev,challenge]);setStatus("Flag validada pelo servidor no desafio "+(challenge+1));setFlag("");}
   else setError("Flag não corresponde à dupla e ao desafio selecionado.");
  }catch(e){setError((e as Error).message);}
  finally{setLoading(false);}
 }
 const current=writeups[challenge]??{command:"",reason:"",evidence:""};
 function edit(k:keyof W,value:string){setWriteups(old=>({...old,[challenge]:{...(old[challenge]??{command:"",reason:"",evidence:""}),[k]:value}}));setSaveState("Alterações ainda não salvas");}
 async function saveWriteup(){
  if(!running)return;
  setLoading(true);setError("");
  try{
   await rpc("ctf1_student_save_writeup",{p_token:token,p_round:selected,p_challenge:challenge+1,p_content:current});
   setSaveState("Write-up salvo no Supabase");
  }catch(e){setError((e as Error).message);}
  finally{setLoading(false);}
 }
 const remaining=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
 return <section className="ctf-browser" aria-label="CTF oficial, laboratório da dupla">
  <div className="ctf-browser-head"><div><p>HACKERS PAI D'ÉGUA / CTF 01 · ENSAIO</p>
   <h2>Terminal da dupla · {name}</h2><small>Linux v86 real · três desafios da Aula 7 · credenciais existentes</small></div>
   <div className="ctf-session-controls"><strong>{remaining}</strong>
    {active&&<button type="button" onClick={()=>{stop();setStatus("Sessão local encerrada; a rodada continua no servidor.");}}>Desligar meu Linux</button>}
   </div></div>
  {error&&<p className="error" role="alert">{error}</p>}<p role="status" className="ctf-browser-status">{status}</p>
  <label>Rodada disponível
   <select value={selected} onChange={e=>{stop();setSelected(e.target.value);}} disabled={active}>
    <option value="">Nenhuma rodada liberada</option>
    {rounds.map(r=><option key={r.round_id} value={r.round_id}>{r.title} · {r.mode==="test"?"TESTE":"OFICIAL"} · {r.state}</option>)}
   </select></label>
  {!active&&<div className="ctf-official-hero"><div><h3>{running?"CTF autorizado pelo professor":"Aguardando autorização"}</h3>
    <p>{running?"A rodada já está em andamento; você pode iniciar o Linux e investigar.":"O professor ainda não iniciou esta rodada ou ela já foi encerrada."}</p></div>
    <button disabled={!running||loading} onClick={()=>void start()}>{loading?"Preparando...":"Iniciar meu laboratório Linux"}</button></div>}
  {active&&<>
   <nav className="ctf-browser-tabs" aria-label="Desafios">
    {reviewMissions.map((m,i)=><button key={m.id} type="button" className={challenge===i?"selected":""} onClick={()=>setChallenge(i)}>
      <small>DESAFIO {i+1} {solved.includes(i)?"· FLAG ACEITA":""}</small><strong>{m.subtitle}</strong>
    </button>)}
   </nav>
   <section className="ctf-mission-brief"><h3>{reviewMissions[challenge].subtitle}</h3>
    <p>{reviewMissions[challenge].incident}</p><p>{reviewMissions[challenge].objective}</p></section>
   <section className="ctf-browser-terminal"><div className="ctf-window-head">
    <span>Linux v86 / {name}</span><button onClick={focus}>Focar</button></div>
    <div className="ctf-terminal-toolbar"><strong>{ready?"Terminal ativo":"Preparando laboratório..."}</strong>
     <button disabled={!ready} onClick={()=>setWriteupOpen(true)}>✎ Abrir write-up</button>
    </div>
    <div className="ctf-terminal-display" ref={host} aria-label="Terminal Linux v86 real"/>
    <div className="ctf-terminal-footer">Linux real no navegador · digite cat missao.txt · o relógio é controlado pelo servidor</div>
   </section>
   <div className="ctf-official-panel"><h3>Enviar flag do desafio {challenge+1}</h3>
    <label>Flag descoberta<input value={flag} onChange={e=>setFlag(e.target.value)}
       onFocus={()=>{editing.current=true;}} onBlur={()=>{editing.current=false;}}
       placeholder="FLAG{...}" autoComplete="off" spellCheck={false}/></label>
    <button disabled={!ready||!running||loading||!flag.trim()} onClick={()=>void submit()}>Validar flag no servidor</button>
    <button disabled={!ready} onClick={()=>setWriteupOpen(true)}>Abrir write-up</button>
   </div>
  </>}
  {writeupOpen&&<div className="ctf-writeup-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setWriteupOpen(false);}}>
    <section className="ctf-browser-card ctf-evidence-panel ctf-writeup-open" ref={editor} role="dialog" aria-modal="true" aria-labelledby="official-writeup-title"
      onKeyDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onFocusCapture={()=>{editing.current=true;}}
      onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))editing.current=false;}}>
     <div className="ctf-evidence-header"><h3 id="official-writeup-title">Write-up · Desafio {challenge+1}</h3>
      <button onClick={()=>setWriteupOpen(false)}>✕ Fechar</button></div>
     <p>Explique os procedimentos e a evidência encontrada. As alterações só serão persistidas após salvar.</p>
     <label>Comandos executados<textarea ref={input} value={current.command} onChange={e=>edit("command",e.target.value)}/></label>
     <label>Justificativa técnica<textarea value={current.reason} onChange={e=>edit("reason",e.target.value)}/></label>
     <label>Evidências e conclusão<textarea value={current.evidence} onChange={e=>edit("evidence",e.target.value)}/></label>
     <p role="status">{saveState}</p>
     <button disabled={!running||loading} onClick={()=>void saveWriteup()}>Salvar no Supabase</button>
     <button onClick={()=>setWriteupOpen(false)}>Voltar ao terminal</button>
    </section>
   </div>}
  <p className="ctf-official-footnote">Ambiente de ensaio: as flags ficam acessíveis ao navegador para compor a VM. O modo oficial protegido permanece bloqueado até homologação de isolamento remoto.</p>
 </section>;
}
