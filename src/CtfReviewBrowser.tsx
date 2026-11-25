import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rpc } from "./api";
import { explainReviewCommand, reviewMissions } from "./ctfReviewMissions";
import { reviewHashFixture } from "./ctfReviewHashFixture";
import "./ctf-review-browser.css";
type Kind="vm_boot"|"vm_ready"|"lab_setup"|"command"|"output"|"challenge"|"writeup"|"vm_stop"|"error";
type E={kind:Kind;detail:string};
type W={command:string;reason:string;evidence:string};
type Run={id:string;title:string;started_at:string;closed_at:string|null;writeup:Record<string,W>};
type VM={add_listener:(name:string,fn:(byte:number)=>void)=>void;serial0_send:(command:string)=>void;stop:()=>void;destroy:()=>void};
type XtermFit={fit:()=>void;dispose?:()=>void};
type XtermHandle={
 open:(element:HTMLElement)=>void;write:(data:string)=>void;writeln:(text:string)=>void;
 focus:()=>void;clear:()=>void;dispose:()=>void;
 onData:(callback:(data:string)=>void)=>{dispose:()=>void};
 loadAddon:(addon:XtermFit)=>void;options:{fontSize:number};
};
declare global{interface Window{
 V86?:new(opts:Record<string,unknown>)=>VM;
 Terminal?:new(opts:Record<string,unknown>)=>XtermHandle;
 FitAddon?:{FitAddon:new()=>XtermFit};
}}
const assets=import.meta.env.BASE_URL+"ctf-v86/";
const quote=(v:string)=>"'"+v.replaceAll("'","'\\''")+"'";
const initCommands=(seed:string)=>[
 "mkdir -p /var/tmp/relatorios/.auditoria /opt/desafio_dac /var/log /opt/evidencias /home/aluno /tmp/ctf-bin",
 "echo 'alunos:x:1300:' >> /etc/group",
 "printf '%s\\n' "+quote("FLAG{ARQUIVO_REVIS_"+seed+"}")+" > /var/tmp/relatorios/.auditoria/.relatorio.txt",
 "printf '%s\\n' "+quote("FLAG{GRUPO_REVIS_"+seed+"}")+" > /opt/desafio_dac/flag.txt",
 "chgrp alunos /opt/desafio_dac/flag.txt; chmod 600 /opt/desafio_dac/flag.txt",
 "printf '%s\\n' '# auth.log (dados fictícios)' > /var/log/auth_simulado.log",
 "for i in 1 2 3 4 5 6 7 8 9; do echo 'Failed password for test from 198.51.100.44 port 2222 ssh2' >> /var/log/auth_simulado.log; done",
 "for i in 1 2 3 4; do echo 'Failed password for guest from 203.0.113.7 port 2222 ssh2' >> /var/log/auth_simulado.log; done",
 "printf '%s\\n' '#!/bin/sh' 'echo \"ctf.hackerspaidegua.local. IN TXT \\\"FLAG{DNS_REVIS_"+seed+"}\\\"\"' > /tmp/ctf-bin/dig",
 "chmod +x /tmp/ctf-bin/dig; export PATH=/tmp/ctf-bin:$PATH",
 "i=1; while [ \"$i\" -le 50 ]; do n=$(printf '%02d' \"$i\"); printf 'Registro tecnico %s\\nDado sintetico %s\\n' \"$n\" \"$n\" > /opt/evidencias/registro_$n.txt; i=$((i+1)); done",
 "printf '%s\\n' "+quote(reviewHashFixture.fileHeader)+" "+quote(reviewHashFixture.flag)+" > "+reviewHashFixture.evidenceFile,
 "printf '%s\\n' 'REVISAO PRE-CTF (sem pontos)' '1) find /var/tmp -name \".*\"' '2) ls -l /opt/desafio_dac/flag.txt e chmod g+r' '3) cat /var/log/auth_simulado.log' '4) dig @192.168.56.1 ctf.hackerspaidegua.local TXT (script didatico)' '5) sha256sum /opt/evidencias/* e MD5 da flag' > /home/aluno/missao.txt",
 "test -f /var/tmp/relatorios/.auditoria/.relatorio.txt && test -f /opt/desafio_dac/flag.txt && test -f /var/log/auth_simulado.log && test -x /tmp/ctf-bin/dig && test \"$(find /opt/evidencias -type f | wc -l)\" -eq 50 && command -v sha256sum >/dev/null && command -v md5sum >/dev/null && sha256sum "+reviewHashFixture.evidenceFile+" | grep -q '"+reviewHashFixture.sha256File+"' && cd /home/aluno && printf '\\nHPDE_LAB_PRONTO\\n' || printf '\\nHPDE_LAB_FALHOU\\n'"
];
let scriptPromise:Promise<void>|undefined;
let terminalPromise:Promise<void>|undefined;
function loadScript(name:string){
 return new Promise<void>((resolve,reject)=>{
  const script=document.createElement("script");script.src=assets+name;script.async=true;
  script.onload=()=>resolve();script.onerror=()=>reject(Error("Falha ao carregar "+name+" para o terminal."));
  document.head.append(script);
 });
}
function loadTerminal(){
 if(window.Terminal&&window.FitAddon?.FitAddon)return Promise.resolve();
 if(!terminalPromise)terminalPromise=(async()=>{
  const css=document.createElement("link");css.rel="stylesheet";css.href=assets+"xterm.css";
  const styleReady=new Promise<void>((resolve,reject)=>{
   css.onload=()=>resolve();css.onerror=()=>reject(Error("O estilo do terminal xterm.js não carregou."));
  });
  document.head.append(css);
  await Promise.all([styleReady,loadScript("xterm.js")]);
  await loadScript("xterm-addon-fit.js");
  if(!window.Terminal||!window.FitAddon?.FitAddon)throw Error("Bibliotecas xterm.js incompatíveis.");
 })().catch(e=>{terminalPromise=undefined;throw e;});
 return terminalPromise;
}
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
function download(name:string,data:string,type="application/json"){const url=URL.createObjectURL(new Blob([data],{type}));
 const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function formatReviewWriteup(entries:Record<string,W>) {
 return [
  "# Write-up CTF 1 — Hackers Pai D'Égua",
  "**Tipo:** Revisão demonstrativa do professor — sem pontuação",
  ...reviewMissions.map((m,i)=>{
   const v=entries[String(i)]??{command:"",reason:"",evidence:""};
   return [
    "## Desafio "+m.id+": "+m.title,
    "**Comando utilizado:**\n"+(v.command||"(não preenchido)"),
    "**Raciocínio técnico:**\n"+(v.reason||"(não preenchido)"),
    "**Flag obtida / evidência:**\n"+(v.evidence||"(não preenchido)")
   ].join("\n\n");
  })
 ].join("\n\n");
}

export default function CtfReviewBrowser(){
 const [run,setRun]=useState<Run|null>(null),[status,setStatus]=useState("Pronto para iniciar");
 const [error,setError]=useState(""),[ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false),[challenge,setChallenge]=useState(0),[flag,setFlag]=useState("");
 const [solved,setSolved]=useState<number[]>([]),[writeups,setWriteups]=useState<Record<string,W>>({});
 const [saved,setSaved]=useState(0),[pending,setPending]=useState(0);
 const [projector,setProjector]=useState(false),[terminalFocusMode,setTerminalFocusMode]=useState(false),[fontSize,setFontSize]=useState(17);
 const [writeupOpen,setWriteupOpen]=useState(false),[writeupDirty,setWriteupDirty]=useState(false);
 const machine=useRef<VM|null>(null),terminalHost=useRef<HTMLDivElement>(null);
 const fullscreenHost=useRef<HTMLElement|null>(null);
 const writeupFirstInput=useRef<HTMLTextAreaElement|null>(null);
 const writeupEditing=useRef(false);
 const terminal=useRef<XtermHandle|null>(null),fitAddon=useRef<XtermFit|null>(null);
 const termResize=useRef<ResizeObserver|null>(null);
 const terminalInput=useRef(""),termSubscription=useRef<{dispose:()=>void}|null>(null);
 const bootTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const script=useRef<string[]>([]),stage=useRef(-1),tail=useRef(""),out=useRef("");
 const events=useRef<E[]>([]),locked=useRef(false),activeRun=useRef<string|null>(null);
 const readyRef=useRef(false),mounted=useRef(true),labSeed=useRef(""),setupValid=useRef(false);
 const current=writeups[String(challenge)]||{command:"",reason:"",evidence:""};
 const mission=reviewMissions[challenge];
 const [showExplanations,setShowExplanations]=useState(false);
 const [lastAction,setLastAction]=useState<{command:string;what:string;why:string}|null>(null);
 useEffect(()=>{mounted.current=true;
  return()=>{mounted.current=false;
   if(bootTimer.current)clearTimeout(bootTimer.current);
   machine.current?.stop();machine.current?.destroy();machine.current=null;
   termResize.current?.disconnect();termSubscription.current?.dispose();
   terminal.current?.dispose();terminal.current=null;};},[]);
 useEffect(()=>{
  const syncFullscreen=()=>{
    const active=document.fullscreenElement===fullscreenHost.current;
    setProjector(active);
    requestAnimationFrame(()=>requestAnimationFrame(refitTerminal));
  };
  const onEscape=(event:KeyboardEvent)=>{
   if(event.key==="Escape"&&writeupOpen){
    setWriteupOpen(false);
    event.stopPropagation();
    return;
   }
   if(event.key==="Escape"&&projector&&document.fullscreenElement!==fullscreenHost.current)
    setProjector(false);
   if(event.key==="Escape"&&terminalFocusMode)setTerminalFocusMode(false);
  };
  document.addEventListener("fullscreenchange",syncFullscreen);
  window.addEventListener("keydown",onEscape);
  return()=>{
   document.removeEventListener("fullscreenchange",syncFullscreen);
   window.removeEventListener("keydown",onEscape);
  };
 },[projector,terminalFocusMode,writeupOpen]);
 useEffect(()=>{if(ready)focusTerminal();},[ready]);
 useEffect(()=>{
  if(!writeupOpen)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  return()=>{document.body.style.overflow=previousOverflow;};
 },[writeupOpen]);
 useEffect(()=>{
  if(!writeupOpen)return;
  const frame=requestAnimationFrame(()=>writeupFirstInput.current?.focus({preventScroll:true}));
  return()=>cancelAnimationFrame(frame);
 },[writeupOpen,challenge]);
  useEffect(()=>{
   if(!terminal.current)return;
   terminal.current.options.fontSize=fontSize;
   requestAnimationFrame(()=>fitAddon.current?.fit());
  },[fontSize,projector,terminalFocusMode]);
 const record=(kind:Kind,detail:string)=>{if(!activeRun.current)return;
  for(const part of detail.match(/[\s\S]{1,2400}/g)||[""])events.current.push({kind,detail:part});
  if(events.current.length>2000){events.current.splice(0,events.current.length-2000);setError("Buffer de auditoria cheio.");}
  setPending(events.current.length);};
 async function sync(){if(locked.current||!activeRun.current)return;
  const session=activeRun.current;
  locked.current=true;
  try{while(events.current.length&&activeRun.current===session){
   const batch=events.current.splice(0,20);
   try{
    const n=await rpc<number>("ctf_teacher_review_append",{p_run:session,p_events:batch});
    if(activeRun.current===session&&mounted.current){
     setSaved(x=>x+n);setPending(events.current.length);
    }
   }catch(e){
    // Do not resurrect events for a discarded session in a new demonstration.
    if(activeRun.current===session){
     events.current.unshift(...batch);
     setError("Auditoria pendente: "+(e as Error).message);
    }
    break;
   }
  }}finally{locked.current=false;}}
 useEffect(()=>{const id=setInterval(()=>{if(out.current){record("output",out.current);out.current="";}void sync();},1250);
  return()=>clearInterval(id);});
 const print=(text:string)=>terminal.current?.write(text.replace(/\r?\n/g,"\r\n"));
 function destroyTerminal(){
  termResize.current?.disconnect();termResize.current=null;
  termSubscription.current?.dispose();termSubscription.current=null;
  terminal.current?.dispose();terminal.current=null;fitAddon.current=null;
  terminalInput.current="";
 }
 function refitTerminal(){
  try{fitAddon.current?.fit();}catch{/* terminal unmounted */}
 }
 function focusTerminal(force=false){
  if(!terminal.current||!terminalHost.current)return;
  if(!force&&(writeupEditing.current||document.activeElement===writeupFirstInput.current))return;
  refitTerminal();
  terminal.current.focus();
  const input=terminalHost.current.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
  input?.focus({preventScroll:true});
  requestAnimationFrame(()=>{
   terminal.current?.focus();
   input?.focus({preventScroll:true});
  });
 }
 function openWriteup(){
  writeupEditing.current=true;
  setWriteupOpen(true);
 }
 function closeWriteup(){
  setWriteupOpen(false);
  writeupEditing.current=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(readyRef.current)focusTerminal(true);
  }));
 }
 function toggleFocusMode(){
  setTerminalFocusMode(current=>!current);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   refitTerminal();focusTerminal();
  }));
 }
 function toggleProjection(){
  const target=fullscreenHost.current;
  if(!target)return;
  if(document.fullscreenElement===target){
   void document.exitFullscreen().catch(e=>setError("Não foi possível sair da projeção: "+String(e)));
  }else if(target.requestFullscreen){
   // Acione diretamente a partir do clique: Fullscreen API exige gesto do usuário.
   void target.requestFullscreen().then(()=>{
    setTerminalFocusMode(false);
    setProjector(true);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
     refitTerminal();focusTerminal();
    }));
   }).catch(e=>{
    setError("O navegador impediu a projeção em tela cheia. Abra o site em uma aba normal e pressione F11. Detalhe: "+String(e));
   });
  }else{
   setError("Este navegador não oferece a API de tela cheia. Use F11 para projetar.");
  }
 }
 function recordCommand(text:string){
  if(!text.trim())return;
  const command=text.trim().slice(0,512);
  record("command",command);
  setLastAction({command,...explainReviewCommand(command)});
 }
 function ingestTerminalInput(data:string){
  if(!readyRef.current||!machine.current)return;
  // xterm.js renders the cursor and edits; BusyBox/Linux handles command execution.
  machine.current.serial0_send(data.replace(/\r/g,"\n"));
  for(let i=0;i<data.length;i++){
   const key=data[i];
   if(key==="\r"||key==="\n"){
    recordCommand(terminalInput.current);
    terminalInput.current="";
   }else if(key==="\u0003")terminalInput.current="";
   else if(key==="\u007f"||key==="\b")terminalInput.current=terminalInput.current.slice(0,-1);
   else if(key==="\u001b"){
    const sequence=/^\[[0-9;]*[A-Za-z~]/.exec(data.slice(i+1));
    if(sequence)i+=sequence[0].length;
   }else if(key>=" "&&key!=="\u007f")terminalInput.current=(terminalInput.current+key).slice(-512);
  }
 }
 function sendQuickCommand(value:string){
  if(!readyRef.current||!machine.current)return;
  recordCommand(value);
  machine.current.serial0_send(value+"\n");
  terminal.current?.focus();
 }
 async function start(){if(busy)return;setBusy(true);setError("");setStatus("Criando sessão...");
  try{
   const id=await rpc<string>("ctf_teacher_review_start");activeRun.current=id;
   setRun({id,title:"Revisão Pré-CTF",started_at:new Date().toISOString(),closed_at:null,writeup:{}});
   setSolved([]);setWriteups({});setSaved(0);setPending(0);setReady(false);readyRef.current=false;
   setShowExplanations(false);setLastAction(null);setTerminalFocusMode(false);setWriteupOpen(false);setWriteupDirty(false);
   if(bootTimer.current)clearTimeout(bootTimer.current);
   bootTimer.current=setTimeout(()=>{
    if(activeRun.current===id&&!readyRef.current&&mounted.current){
     const reason="O Linux não concluiu a inicialização. Atualize a página (Ctrl+Shift+R), encerre a sessão e inicie novamente. Se persistir, verifique o console do navegador.";
     setStatus("Tempo limite de inicialização");
     setError(reason);record("error",reason);
     print("\n"+reason+"\n");
    }
   },90000);
   record("vm_boot","Linux emulado v86 iniciado pelo professor");
   setStatus("Carregando o terminal xterm.js e a imagem Linux...");
   await Promise.all([library(),loadTerminal()]);
   if(!window.V86)throw Error("v86 indisponível");
   await new Promise<void>((resolve,reject)=>{
    // Cached assets can resolve before React commits the xterm host.
    const deadline=Date.now()+7000;
    const check=()=>{
     if(!mounted.current||activeRun.current!==id)return reject(Error("Inicialização cancelada."));
     if(terminalHost.current)return resolve();
     if(Date.now()>deadline)return reject(Error("A área do terminal não foi montada. Encerre ou descarte e tente novamente."));
     setTimeout(check,30);
    };
    check();
   });
   labSeed.current=Math.random().toString(16).slice(2,8).toUpperCase();
   script.current=initCommands(labSeed.current);
   stage.current=-1;tail.current="";setupValid.current=false;
   destroyTerminal();
   if(!terminalHost.current||!window.Terminal||!window.FitAddon?.FitAddon)
    throw Error("Não foi possível montar o terminal xterm.js no painel.");
   const xterm=new window.Terminal({
     cursorBlink:true,convertEol:true,fontFamily:'"Cascadia Code", "JetBrains Mono", Consolas, monospace',
     fontSize,lineHeight:1.45,scrollback:2000,allowTransparency:false,
     theme:{
       background:"#091321",foreground:"#dbe8e8",cursor:"#55e0b8",
       selectionBackground:"#255f66",black:"#0e1624",red:"#fb807d",
       green:"#72e2ad",yellow:"#f8c579",blue:"#8ab7f5",magenta:"#d7a3ef",
       cyan:"#6bdad3",white:"#eefaf6"
     }
   });
   const fit=new window.FitAddon.FitAddon();
   xterm.loadAddon(fit);
   xterm.open(terminalHost.current);terminal.current=xterm;fitAddon.current=fit;
   termSubscription.current=xterm.onData(ingestTerminalInput);
   termResize.current=new ResizeObserver(()=>{try{fit.fit();}catch{/* unmounted */}});
   termResize.current.observe(terminalHost.current);
   requestAnimationFrame(()=>{fit.fit();xterm.focus();});
   xterm.writeln("\x1b[1;36mHACKERS PAI D'ÉGUA  /  LABORATÓRIO LINUX · xterm.js\x1b[0m");
   xterm.writeln("\x1b[90m────────────────────────────────────────────────────────────\x1b[0m");
   xterm.writeln("\x1b[33m[PROFESSOR]\x1b[0m Iniciando Linux real emulado no navegador...");
   xterm.writeln("\x1b[90mAguarde a preparação dos cinco desafios.\x1b[0m");
   xterm.writeln("");
   const vm=new window.V86({
     wasm_path:assets+"v86.wasm",bios:{url:assets+"seabios.bin"},vga_bios:{url:assets+"vgabios.bin"},
     bzimage:{url:assets+"buildroot-bzimage68.bin",async:false},filesystem:{},
     memory_size:96*1024*1024,vga_memory_size:2*1024*1024,
     cmdline:"tsc=reliable mitigations=off random.trust_cpu=on",autostart:true,disable_keyboard:true,disable_speaker:true
   });machine.current=vm;setStatus("Linux inicializando...");
   vm.add_listener("serial0-output-byte",byte=>{const char=String.fromCharCode(byte);
     if(char!=="\r")tail.current=(tail.current+char).slice(-350);
     if(tail.current.includes("\nHPDE_LAB_PRONTO\n"))setupValid.current=true;
     // Oculta o boot inicial e os comandos de provisionamento, incluindo as flags.
     if(!readyRef.current){
       if(stage.current===-1 && /(?:~% |# |\$ )$/.test(tail.current)){
         stage.current=0;setStatus("Preparando cinco desafios...");
         print("\x1b[36mLinux iniciado. Preparando arquivos e ferramentas da missão...\x1b[0m\n");
         vm.serial0_send(script.current[0]+"; printf '\\nHPDE_MARK_0\\n'\n");
       }else if(stage.current>=0&&tail.current.includes("\nHPDE_MARK_"+stage.current+"\n")){
         tail.current="";
         if(stage.current<script.current.length-1){stage.current++;vm.serial0_send(script.current[stage.current]+"; printf '\\nHPDE_MARK_"+stage.current+"\\n'\n");}
         else if(setupValid.current){
           if(bootTimer.current)clearTimeout(bootTimer.current);
           readyRef.current=true;setReady(true);
           record("vm_ready","Linux e cinco desafios preparados, incluindo SHA-256 e MD5");
           setStatus("Linux pronto · digite cat missao.txt");
           print("\x1b[1;32m✓ Linux pronto.\x1b[0m Use \x1b[1mcat missao.txt\x1b[0m para começar.\n\n");
           terminal.current?.focus();
         }
         else{
           if(bootTimer.current)clearTimeout(bootTimer.current);
           record("error","Falha ao preparar filesystem da VM");
           setError("O Linux iniciou, mas não conseguiu preparar os quatro desafios. Encerre e inicie novamente.");
           setStatus("Falha na preparação do laboratório");
           print("\nFalha ao preparar o laboratório.\n");
         }
       }
       return;
     }
     terminal.current?.write(char);out.current+=char;if(out.current.length>2000){record("output",out.current);out.current="";}
   });
  }catch(e){setError((e as Error).message);record("error",(e as Error).message);setStatus("Falha ao iniciar o Linux — encerre ou descarte para tentar outra vez");}
  finally{setBusy(false);}
 }
 
 const validate=()=>{const keys=["FLAG{ARQUIVO_REVIS_"+labSeed.current+"}","FLAG{GRUPO_REVIS_"+labSeed.current+"}","FLAG{IP_198.51.100.44}","FLAG{DNS_REVIS_"+labSeed.current+"}",reviewHashFixture.flag];
  if(flag.trim()===keys[challenge]){
   if(!solved.includes(challenge)){
    setSolved(v=>[...v,challenge]);
    record("challenge","Objetivo "+(challenge+1)+" confirmado sem pontos");
   }
   setWriteupDirty(true);
   setWriteups(prev=>{
    const currentValue=prev[String(challenge)]??{command:"",reason:"",evidence:""};
    const submitted=flag.trim();
    if(currentValue.evidence.includes(submitted))return prev;
    return {...prev,[String(challenge)]:{...currentValue,evidence:
      [currentValue.evidence,"Flag obtida: "+submitted].filter(Boolean).join("\n")}};
   });
   openWriteup();
  }else setError("Flag inválida. Verifique o terminal.");setFlag("");};
 const edit=(field:keyof W,value:string)=>{
  setWriteupDirty(true);
  setWriteups(prev=>({
   ...prev,
   [String(challenge)]:{...(prev[String(challenge)]??{command:"",reason:"",evidence:""}),[field]:value}
  }));
 };
 async function saveWriteup(){if(!activeRun.current)return;setBusy(true);
  try{await rpc("ctf_teacher_review_writeup",{p_run:activeRun.current,p_writeup:writeups});record("writeup","Write-up salvo");await sync();setWriteupDirty(false);setStatus("Write-up salvo no Supabase");}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function close(){
  if(!activeRun.current||busy)return;
  setBusy(true);setError("");
  if(document.fullscreenElement===fullscreenHost.current){
   try{await document.exitFullscreen();}catch{/* already exited */}
  }
  try{
   await rpc("ctf_teacher_review_writeup",{p_run:activeRun.current,p_writeup:writeups});
   setWriteupDirty(false);
   record("writeup","Write-up preservado ao encerrar a demonstração do professor");
   record("vm_stop","Terminal do professor — demonstração encerrada e salva");
   if(out.current){record("output",out.current);out.current="";}
   await sync();
   if(events.current.length)throw Error("Auditoria ainda não foi sincronizada. Tente encerrar novamente.");
   await rpc("ctf_teacher_review_close",{p_run:activeRun.current});
   if(bootTimer.current)clearTimeout(bootTimer.current);
   machine.current?.stop();machine.current?.destroy();machine.current=null;
   activeRun.current=null;destroyTerminal();
   readyRef.current=false;setReady(false);setRun(null);setWriteupOpen(false);
   setProjector(false);setTerminalFocusMode(false);
   setStatus("Encerrada e salva: write-up e auditoria disponíveis na página Auditoria CTF.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function discardSession(){
  const id=activeRun.current;
  if(!id||busy)return;
  if(!window.confirm("Descartar permanentemente esta demonstração do terminal do professor? O write-up e todos os eventos serão apagados do Supabase. O CTF oficial, as notas e o ranking NÃO serão afetados."))return;
  setBusy(true);setError("");
  try{
   readyRef.current=false;
   activeRun.current=null; // stop new browser-generated audit events
   if(bootTimer.current)clearTimeout(bootTimer.current);
   machine.current?.stop();machine.current?.destroy();machine.current=null;
   destroyTerminal();events.current=[];out.current="";
   setPending(0);
   await rpc("ctf_teacher_review_discard",{p_run:id});
   setRun(null);setWriteupOpen(false);setWriteups({});setWriteupDirty(false);
   setProjector(false);setTerminalFocusMode(false);setReady(false);setSaved(0);
   setStatus("Demonstração descartada: nenhum registro mantido no histórico.");
  }catch(e){
   activeRun.current=id;
   setError("Não foi possível descartar. O Linux foi interrompido; tente descartar ou encerrar novamente. "+(e as Error).message);
  }finally{setBusy(false);}
 }
 const writeupPanel=(
   <section className={"ctf-browser-card ctf-evidence-panel"+(writeupOpen?" ctf-writeup-open":"")}
    role={writeupOpen?"dialog":undefined} aria-modal={writeupOpen?true:undefined}
    aria-labelledby="ctf-writeup-title" onKeyDown={event=>{
     event.stopPropagation();
     if(event.key==="Escape"){event.preventDefault();closeWriteup();}
    }}
    onFocusCapture={()=>{writeupEditing.current=true;}}
    onBlurCapture={event=>{
     if(!event.currentTarget.contains(event.relatedTarget as Node | null)){
      writeupEditing.current=writeupOpen;
     }
    }}>
    <div className="ctf-evidence-header">
     <div><div className="ctf-guide-eyebrow">ENTREGA DA MISSÃO {String(mission.id).padStart(2,"0")}</div>
      <h3 id="ctf-writeup-title">Evidência e relatório de investigação</h3></div>
     <div className="ctf-evidence-header-actions">
      <span className="ctf-evidence-status">{solved.includes(challenge)?"Evidência encontrada":"Aguardando evidência"}</span>
      {writeupOpen&&<button type="button" className="ctf-writeup-close" onClick={closeWriteup}
       aria-label="Fechar editor de write-up e voltar ao terminal">✕ Fechar</button>}
     </div>
    </div>
    <p>Ao concluir a investigação, registre a flag encontrada no terminal e documente como chegou ao resultado. A revisão não concede pontos.</p>
    <p><strong>Formato esperado:</strong> <code>{mission.flagFormat}</code></p>
    {mission.caveat&&<p className="ctf-pedagogical-warning">{mission.caveat}</p>}
    <input value={flag} onChange={e=>setFlag(e.target.value)} placeholder="FLAG{...}"/>
    <button onClick={validate} disabled={!ready}>Confirmar descoberta</button>
    <div className="ctf-writeup-heading">
     <h4>Write-up: o que você fez e por quê?</h4>
     <p>Explique o problema, o procedimento usado, o motivo da escolha dos comandos e a evidência obtida. É isso que o professor analisará nos CTFs oficiais.</p>
    </div>
    <label>1. Comando utilizado (o que você fez?)<textarea ref={writeupFirstInput} value={current.command} placeholder="Registre os comandos utilizados na investigação..." onChange={e=>edit("command",e.target.value)}/></label>
    <label>2. Raciocínio técnico (por que fez isso?)<textarea value={current.reason} placeholder="Explique a hipótese e por que escolheu esse procedimento..." onChange={e=>edit("reason",e.target.value)}/></label>
    <label>3. Flag obtida e evidência (o que encontrou?)<textarea value={current.evidence} placeholder="Inclua a FLAG{...}, o resultado do comando e sua interpretação. No desafio 5 registre SHA-256 e MD5." onChange={e=>edit("evidence",e.target.value)}/></label>
    {writeupDirty&&<p className="ctf-writeup-unsaved" role="status">
      Há alterações no write-up que ainda não foram salvas no Supabase.
     </p>}
    <div className="ctf-evidence-actions">
     <button type="button" disabled={busy} onClick={()=>void saveWriteup()}>Salvar write-up no Supabase</button>
     <button type="button" onClick={()=>download("writeup_revisao_professor.md",formatReviewWriteup(writeups),"text/markdown;charset=utf-8")}>Exportar .md</button>
     <button type="button" disabled={challenge>=reviewMissions.length-1} onClick={()=>{setChallenge(i=>i+1);setFlag("");setShowExplanations(false);setLastAction(null);setWriteupOpen(false);}}>Próximo desafio →</button>
    </div>
   </section>
 );
 return <section ref={fullscreenHost} className={"ctf-browser"+(projector?" ctf-projector":"")+(terminalFocusMode?" ctf-focus-mode":"")}>
  <div className="ctf-browser-head"><div><p>HACKERS PAI D'ÉGUA / REVISÃO PRÉ-CTF</p>
   <h2>Laboratório Linux do professor</h2><small>v86 + Buildroot · {reviewMissions.length} desafios · sem notas nem pontos</small></div>
   <div className="ctf-session-controls">
    {run?<>
     <button type="button" disabled={busy} onClick={()=>void close()}>Encerrar e salvar</button>
     <button type="button" className="ctf-session-discard" disabled={busy} onClick={()=>void discardSession()}>Descartar sessão</button>
    </>:<>
     <button type="button" disabled={busy} onClick={()=>void start()}>Iniciar demonstração</button>
     <a href="#admin/auditoria-ctf">Histórico do terminal do professor</a>
    </>}
   </div></div>
  <p role="status" className="ctf-browser-status">{status}</p>{error&&<p role="alert" className="error">{error}</p>}
  <div className="ctf-browser-stats"><div>Progresso <strong>{solved.length}/{reviewMissions.length}</strong></div>
    <div>Auditoria <strong>{saved} eventos</strong></div><div>Sincronização <strong>{pending} pendentes</strong></div></div>
  {run&&<>
      <nav className="ctf-browser-tabs" aria-label="Escolher desafio da revisão">
    {reviewMissions.map((item,i)=><button key={item.id} type="button" className={i===challenge?"selected":""}
      aria-current={i===challenge?"step":undefined}
      onClick={()=>{setChallenge(i);setFlag("");setShowExplanations(false);setLastAction(null);}}>
      <small>DESAFIO {String(item.id).padStart(2,"0")}{solved.includes(i)?" · CONCLUÍDO":""}</small>
      <strong>{solved.includes(i)?"✓ ":""}{item.subtitle}</strong>
    </button>)}
   </nav>
   <div className="ctf-mission-workspace">
    <div className="ctf-mission-main">
     <section className="ctf-mission-brief" aria-labelledby="ctf-current-mission">
      <div className="ctf-mission-meta">
       <span className="ctf-mission-tag">CTF REVISÃO · {String(mission.id).padStart(2,"0")}/{String(reviewMissions.length).padStart(2,"0")}</span>
       <span>{mission.category}</span>
       <span>{mission.difficulty}</span>
      </div>
      <h3 id="ctf-current-mission">{mission.subtitle}</h3>
      <p className="ctf-incident"><strong>O problema:</strong> {mission.incident}</p>
      <p><strong>Seu papel:</strong> {mission.context}</p>
      <div className="ctf-mission-objectives">
       <div><span>MISSÃO</span><p>{mission.objective}</p></div>
       <div><span>O QUE ENTREGAR</span><p>{mission.deliverable}</p></div>
      </div>
     </section>
     <div className="ctf-browser-terminal">
    <div className="ctf-window-head">
      <div className="ctf-window-lights" aria-hidden="true"><i/><i/><i/></div>
      <span>ghost@lab-professor: ~ / xterm.js</span>
      <button type="button" aria-pressed={terminalFocusMode} onMouseDown={event=>event.preventDefault()}
        onClick={toggleFocusMode} title="Expandir ou restaurar o terminal, sem perder a sessão Linux">
        {terminalFocusMode?"✕ Sair do foco (Esc)":"⌨ Focar"}
      </button>
    </div>
    <div className="ctf-terminal-toolbar">
      <span><strong>Linux v86 · Terminal interativo</strong><small>{ready?"● Terminal ativo":"● "+status}</small></span>
      <div className="ctf-terminal-controls">
        <button type="button" className="ctf-writeup-shortcut" onClick={openWriteup}
          title="Preencher o relatório da missão sem interromper o Linux">✎ Preencher write-up</button>
        <button type="button" onClick={()=>setFontSize(n=>Math.max(12,n-2))} aria-label="Diminuir fonte do terminal">A−</button>
        <button type="button" onClick={()=>setFontSize(n=>Math.min(30,n+2))} aria-label="Aumentar fonte do terminal">A+</button>
        <button type="button" aria-pressed={projector} onClick={toggleProjection}
          title="Abrir o roteiro e o terminal em tela cheia do navegador">
          {projector?"Sair da projeção (Esc)":"⛶ Ampliar para projeção"}
        </button>
      </div>
    </div>
    <div className="ctf-terminal-display" ref={terminalHost} role="application" aria-label="Terminal Linux real, com cursor, cores ANSI e comandos digitados diretamente"/>
    <div className="ctf-terminal-footer">
      <span>{ready?"● LINUX ATIVO":"● PREPARANDO LINUX"}</span>
      <span>↑↓ histórico · Ctrl+C interromper · Enter executar</span>
    </div>
   </div>
   {writeupOpen?createPortal(
    <div className="ctf-writeup-portal" data-testid="ctf-writeup-portal">
     <button type="button" className="ctf-writeup-backdrop" onClick={closeWriteup}
      aria-label="Fechar editor de write-up"/>
     {writeupPanel}
    </div>,
    document.fullscreenElement===fullscreenHost.current&&fullscreenHost.current
      ? fullscreenHost.current : document.body
   ):writeupPanel}
   </div>
    <aside className="ctf-mission-guide" aria-label="Orientações para a investigação">
     <section className="ctf-guide-panel">
      <div className="ctf-guide-eyebrow">GUIA DE INVESTIGAÇÃO</div>
      <h3>Por onde começar?</h3>
      <p>{mission.startingPoint}</p>
      {lastAction&&<div className="ctf-command-explanation" role="status">
       <div className="ctf-guide-eyebrow">ÚLTIMO COMANDO EXECUTADO</div>
       <code>{lastAction.command}</code>
       <p><b>O que ele faz:</b> {lastAction.what}</p>
       <p><b>Por que usar:</b> {lastAction.why}</p>
      </div>}
      <h4>O que fazer e por quê</h4>
      <ol className="ctf-investigation-steps">
       {mission.steps.map((item,i)=><li key={i}>
        <div className="ctf-step-heading"><span>{i+1}</span><strong>{item.title}</strong></div>
        <p><b>O que fazer:</b> {item.doing}</p>
        <p><b>Por quê:</b> {item.why}</p>
        {showExplanations&&<div className="ctf-step-example">
         <code>{item.example}</code>
         <button type="button" disabled={!ready}
          onClick={()=>sendQuickCommand(item.example)}>Executar</button>
        </div>}
       </li>)}
      </ol>
      <button type="button" className="ctf-reveal-btn" aria-expanded={showExplanations}
       onClick={()=>setShowExplanations(v=>!v)}>
       {showExplanations?"Ocultar exemplos de comandos":"Professor: revelar exemplos de comandos"}
      </button>
     </section>
     <section className="ctf-guide-panel ctf-guide-reflection">
      <div className="ctf-guide-eyebrow">ENTENDENDO A MISSÃO</div>
      <h3>Por que aprender isso?</h3>
      <p>{mission.realWorld}</p>
      <h4>Pergunta para a turma</h4>
      <p>{mission.studentQuestion}</p>
      <details>
       <summary>Conclusão para o professor</summary>
       <p>{mission.closing}</p>
       {mission.caveat&&<p className="ctf-pedagogical-warning">{mission.caveat}</p>}
      </details>
     </section>
    </aside>
   </div>
</>}

  </section>;
}
