import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { createPlatformIntegration } from "./platform.mjs";

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.CTF_PORT || 4100);
const ADMIN_KEY=process.env.CTF_ADMIN_KEY || "";
const IMAGE=process.env.CTF_IMAGE || "hackers-ctf-revisao:local";
if (!Number.isInteger(PORT) || PORT<1024 || PORT>65535) throw Error("Porta inválida");
if (ADMIN_KEY.length<24 || ADMIN_KEY.includes("GERE_UM")) throw Error("Configure CTF_ADMIN_KEY com pelo menos 24 caracteres");
const DATA=path.join(ROOT,".data");
fs.mkdirSync(DATA,{recursive:true});
const STATE_FILE=path.join(DATA,"state.json");
const CHALLENGES=[
  {id:1,title:"Navegação e Arquivos Ocultos",description:"Localize o relatório oculto em /var/tmp/."},
  {id:2,title:"Permissões e Grupos Restritos",description:"Corrija a leitura por grupo no arquivo segredo.txt."},
  {id:3,title:"Mineração de Logs de Força Bruta",description:"Identifique o endereço IP com mais falhas no auth.log."},
  {id:4,title:"A Mensagem Secreta no DNS",description:"Encontre a flag no registro TXT de ctf.hackerspaidegua.local."}
];
const initial=()=>({
  key:randomBytes(32).toString("hex"),
  ctfs:[{id:randomUUID(),title:"Revisão Pré-CTF — Fundamentos",description:"Demonstração pedagógica sem pontuação.",duration:3600,status:"draft",startedAt:null,deadline:null,pausedAt:null,challenges:CHALLENGES}],
  invites:[],sessions:[]
});
const state=fs.existsSync(STATE_FILE)?JSON.parse(fs.readFileSync(STATE_FILE,"utf8")):initial();
let saveTimer;
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const tmp=STATE_FILE+".tmp";fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,STATE_FILE);},150);}
persist();
const iso=()=>new Date().toISOString();
const token=()=>randomBytes(24).toString("base64url");
const eq=(a,b)=>{const x=Buffer.from(String(a||""));const y=Buffer.from(String(b||""));return x.length===y.length&&timingSafeEqual(x,y);};
const clean=(v,max=4000)=>typeof v==="string"?v.trim().slice(0,max):"";
const currentCtf=id=>state.ctfs.find(c=>c.id===id);
const publicCtf=c=>({id:c.id,title:c.title,description:c.description,duration:c.duration,status:c.status,startedAt:c.startedAt,deadline:c.deadline,pausedAt:c.pausedAt,challenges:c.challenges});
const sessionView=s=>({id:s.id,ctf:publicCtf(currentCtf(s.ctfId)),team:s.team,createdAt:s.createdAt,completedAt:s.completedAt,solved:s.solved,writeups:s.writeups,count:s.events.length});
const isRunning=c=>c&&c.status==="running"&&!c.pausedAt&&Date.parse(c.deadline)>Date.now();
const authHeader=req=>String(req.headers.authorization||"").replace(/^Bearer /i,"");
const admin=req=>eq(authHeader(req),ADMIN_KEY);
const student=req=>state.sessions.find(s=>eq(s.token,authHeader(req)));
const record=(s,type,details={})=>{
  const event={at:iso(),type,...details};
  s.events.push(event);
  if(s.events.length>30000)s.events.splice(0,s.events.length-30000);
  if(s.platform)platform.enqueueEvent(s,event);
  persist();
};
const box=s=>"hpde-lab-"+s.id.replace(/-/g,"").slice(0,22);
const digest=(s,n)=>createHmac("sha256",state.key).update(s.id+":"+n).digest("hex").slice(0,14).toUpperCase();
const flag=(s,n)=>"FLAG{"+["ARQUIVO","GRUPO","IP","DNS"][n-1]+"_"+digest(s,n)+"}";
const attacker=s=>s.attackerIp || "198.51.100."+(10+parseInt(digest(s,3).slice(0,4),16)%220);
async function command(bin,args,input="",timeout=30000){
  return new Promise((resolve,reject)=>{
    const p=spawn(bin,args,{stdio:["pipe","pipe","pipe"]});let out="",err="",done=false;
    const finish=(e,value)=>{if(done)return;done=true;clearTimeout(timer);if(e)reject(e);else resolve(value);};
    const timer=setTimeout(()=>{p.kill("SIGKILL");finish(Error("Tempo excedido: "+bin));},timeout);
    p.on("error",e=>finish(e));p.stdout.on("data",d=>out=(out+d).slice(-12000));p.stderr.on("data",d=>err=(err+d).slice(-12000));
    p.on("close",code=>code===0?finish(null,out):finish(Error((err||out||"Código "+code).slice(-1000))));
    p.stdin.on("error",()=>{});p.stdin.end(input);
  });
}
async function createLab(s){
  const name=box(s);
  await command("docker",["run","-d","--rm","--name",name,"--network","none","--cap-drop","ALL","--cap-add","NET_BIND_SERVICE","--cap-add","CHOWN","--cap-add","SETGID","--cap-add","SETUID",
    "--memory","256m","--cpus","0.8","--pids-limit","80","--read-only",
    "--tmpfs","/tmp:rw,nosuid,nodev,size=16m","--tmpfs","/run:rw,nosuid,nodev,size=8m",
    "--tmpfs","/home/aluno:rw,nosuid,nodev,size=64m","--tmpfs","/var/tmp:rw,nosuid,nodev,size=32m",IMAGE]);
  try{
    await command("docker",["exec","-i",name,"/usr/local/bin/ctf-bootstrap"],[flag(s,1),flag(s,2),attacker(s),flag(s,4)].join("\n")+"\n");
    record(s,"lab_started");
  }catch(e){await command("docker",["rm","-f",name]).catch(()=>{});throw e;}
}
async function destroyLab(s){await command("docker",["rm","-f",box(s)],"",15000).catch(()=>{});record(s,"lab_stopped");}
function send(res,code,data){
  res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
  res.end(JSON.stringify(data));
}
async function body(req){
  let chunks="";for await(const d of req){chunks+=d;if(chunks.length>24000)throw Error("Requisição muito grande");}
  return chunks?JSON.parse(chunks):{};
}
const tickets=new Map(),activeSockets=new Map();
const platform=createPlatformIntegration({
 state,token,iso,persist,createLab,destroyLab,record,CHALLENGES,box,command,sessionView,publicCtf,send,body,clean
});
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,"http://localhost").pathname;
    if(pathname.startsWith("/api/platform/"))return await platform.handle(req,res,pathname);
    const vend={
      "/vendor/xterm.js":["@xterm/xterm/lib/xterm.js","application/javascript"],
      "/vendor/xterm.css":["@xterm/xterm/css/xterm.css","text/css"],
      "/vendor/xterm-fit.js":["@xterm/addon-fit/lib/addon-fit.js","application/javascript"]
    };
    if(req.method==="GET"&&vend[pathname]){
      const [p,ct]=vend[pathname],file=path.join(ROOT,"node_modules",p);
      if(!fs.existsSync(file))return send(res,503,{error:"xterm.js não instalado no executor"});
      res.writeHead(200,{"content-type":ct,"cache-control":"public,max-age=3600","x-content-type-options":"nosniff"});
      return res.end(fs.readFileSync(file));
    }
    if(req.method==="GET"&&(pathname==="/"||pathname==="/index.html")){
      res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store",
        "content-security-policy":"default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' ws://127.0.0.1:4100; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"});
      return res.end(fs.readFileSync(path.join(ROOT,"public","index.html")));
    }
    if(req.method==="GET"&&pathname==="/health")return send(res,200,{ok:true,mode:"terminal-linux-real",scoring:false});
    if(req.method==="GET"&&pathname==="/api/ctfs")return send(res,200,{ctfs:state.ctfs.filter(c=>c.status!=="draft").map(publicCtf)});
    if(req.method==="GET"&&pathname==="/api/admin/state"){
      if(!admin(req))return send(res,403,{error:"Acesso administrativo negado"});
      return send(res,200,{ctfs:state.ctfs.map(publicCtf),invites:state.invites.map(i=>({id:i.id,ctfId:i.ctfId,team:i.team,hasSession:!!i.sessionId})),sessions:state.sessions.map(sessionView)});
    }
    if(req.method==="POST"&&pathname==="/api/admin/ctfs"){
      if(!admin(req))return send(res,403,{error:"Acesso administrativo negado"});
      const b=await body(req),title=clean(b.title,120),duration=Math.trunc(Number(b.duration)||3600);
      if(title.length<3||duration<300||duration>7200)return send(res,400,{error:"Título inválido ou duração fora de 5 a 120 minutos"});
      const c={id:randomUUID(),title,description:clean(b.description),duration,status:"draft",startedAt:null,deadline:null,pausedAt:null,challenges:CHALLENGES};
      state.ctfs.push(c);persist();return send(res,201,{ctf:publicCtf(c)});
    }
    const route=pathname.match(/^\/api\/admin\/ctfs\/([a-f0-9-]+)\/(publish|start|pause|resume|extend|close)$/);
    if(req.method==="POST"&&route){
      if(!admin(req))return send(res,403,{error:"Acesso administrativo negado"});
      const c=currentCtf(route[1]),a=route[2];if(!c)return send(res,404,{error:"CTF inexistente"});
      const b=await body(req);
      if(a==="publish"&&c.status==="draft")c.status="published";
      else if(a==="start"&&c.status==="published"){c.status="running";c.startedAt=iso();c.deadline=new Date(Date.now()+c.duration*1000).toISOString();}
      else if(a==="pause"&&isRunning(c)){c.pausedAt=iso();await Promise.all(state.sessions.filter(s=>s.ctfId===c.id).map(s=>command("docker",["pause",box(s)]).catch(()=>{})));}
      else if(a==="resume"&&c.status==="running"&&c.pausedAt){
        c.deadline=new Date(Date.parse(c.deadline)+(Date.now()-Date.parse(c.pausedAt))).toISOString();c.pausedAt=null;
        await Promise.all(state.sessions.filter(s=>s.ctfId===c.id).map(s=>command("docker",["unpause",box(s)]).catch(()=>{})));
      }
      else if(a==="extend"&&c.status==="running"){
        const seconds=Math.trunc(Number(b.seconds)||0);if(seconds<1||seconds>3600)return send(res,400,{error:"Extensão deve ser de 1 a 3600 segundos"});
        c.deadline=new Date(Date.parse(c.deadline)+seconds*1000).toISOString();
      }
      else if(a==="close"&&["published","running"].includes(c.status)){
        c.status="closed";c.pausedAt=null;await Promise.all(state.sessions.filter(s=>s.ctfId===c.id).map(destroyLab));
      }else return send(res,409,{error:"Transição não permitida"});
      persist();return send(res,200,{ctf:publicCtf(c)});
    }
    if(req.method==="POST"&&pathname==="/api/admin/invites"){
      if(!admin(req))return send(res,403,{error:"Acesso administrativo negado"});
      const b=await body(req),c=currentCtf(b.ctfId),team=clean(b.team,80);
      if(!isRunning(c)||team.length<2)return send(res,400,{error:"CTF deve estar em execução e a dupla deve ter nome"});
      const invite={id:randomUUID(),ctfId:c.id,team,code:token(),sessionId:null};state.invites.push(invite);persist();
      return send(res,201,{invite});
    }
    if(req.method==="POST"&&pathname==="/api/join"){
      const b=await body(req),invite=state.invites.find(i=>eq(i.code,b.code));
      if(!invite||!isRunning(currentCtf(invite.ctfId)))return send(res,403,{error:"Código inválido ou revisão indisponível"});
      if(invite.sessionId){
        const s=state.sessions.find(x=>x.id===invite.sessionId);
        return send(res,200,{token:s.token,session:sessionView(s)});
      }
      const reserved=new Set(state.sessions.map(x=>x.attackerIp).filter(Boolean));
      let ipLast=10;while(ipLast<255&&reserved.has("198.51.100."+ipLast))ipLast++;
      if(ipLast>254)return send(res,503,{error:"Limite de 245 sessões locais atingido"});
      const s={id:randomUUID(),ctfId:invite.ctfId,team:invite.team,attackerIp:"198.51.100."+ipLast,token:token(),createdAt:iso(),completedAt:null,solved:[],writeups:{},events:[]};
      await createLab(s);state.sessions.push(s);invite.sessionId=s.id;persist();
      return send(res,201,{token:s.token,session:sessionView(s)});
    }
    if(req.method==="GET"&&pathname==="/api/me"){
      const s=student(req);return s?send(res,200,{session:sessionView(s)}):send(res,401,{error:"Sessão inválida"});
    }
    if(req.method==="POST"&&pathname==="/api/flag"){
      const s=student(req);if(!s)return send(res,401,{error:"Sessão inválida"});
      if(!isRunning(currentCtf(s.ctfId)))return send(res,409,{error:"Revisão pausada ou encerrada"});
      if(s.platform)await platform.sessionAccess(s);
      const b=await body(req),id=Number(b.challenge);
      if(![1,2,3,4].includes(id))return send(res,400,{error:"Desafio inválido"});
      const expected=id===3?"FLAG{"+attacker(s)+"}":flag(s,id);
      const ok=eq(clean(b.flag,120),expected);
      record(s,"flag_submission",{challenge:id,result:ok?"accepted":"rejected"});
      if(ok&&!s.solved.includes(id)){s.solved.push(id);record(s,"solved",{challenge:id});if(s.solved.length===4)s.completedAt=iso();}
      if(s.platform)await platform.saveProgress(s);
      return send(res,200,{accepted:ok,solved:s.solved});
    }
    if(req.method==="POST"&&pathname==="/api/writeup"){
      const s=student(req);if(!s)return send(res,401,{error:"Sessão inválida"});
      if(!isRunning(currentCtf(s.ctfId)))return send(res,409,{error:"Revisão pausada ou encerrada"});
      const b=await body(req),id=Number(b.challenge);if(![1,2,3,4].includes(id))return send(res,400,{error:"Desafio inválido"});
      s.writeups[id]={command:clean(b.command),reason:clean(b.reason),evidence:clean(b.evidence),savedAt:iso()};
      record(s,"writeup_saved",{challenge:id});
      if(s.platform)await platform.saveProgress(s);
      return send(res,200,{ok:true});
    }
    if(req.method==="POST"&&pathname==="/api/ticket"){
      const s=student(req);if(!s)return send(res,401,{error:"Sessão inválida"});
      if(!isRunning(currentCtf(s.ctfId)))return send(res,409,{error:"Revisão pausada ou encerrada"});
      if(s.platform)await platform.sessionAccess(s);
      const t=token();tickets.set(t,{sessionId:s.id,until:Date.now()+30000});
      return send(res,200,{ticket:t});
    }
    const report=pathname.match(/^\/api\/admin\/sessions\/([a-f0-9-]+)$/);
    if(req.method==="GET"&&report){
      if(!admin(req))return send(res,403,{error:"Acesso administrativo negado"});
      const s=state.sessions.find(x=>x.id===report[1]);return s?send(res,200,{session:sessionView(s),events:s.events}):send(res,404,{error:"Sessão não encontrada"});
    }
    send(res,404,{error:"Rota não encontrada"});
  }catch(e){console.error(e);send(res,500,{error:e.message||"Erro interno"});}
});
const wss=new WebSocketServer({noServer:true,handleProtocols:protocols=>protocols.has("ctf-v1")?"ctf-v1":false});
server.on("upgrade",async(req,socket,head)=>{
  const protocols=String(req.headers["sec-websocket-protocol"]||"").split(",").map(x=>x.trim());
  const value=protocols.find(x=>x.startsWith("ticket."))?.slice(7);
  const info=tickets.get(value);if(value)tickets.delete(value);
  const s=info&&info.until>Date.now()?state.sessions.find(x=>x.id===info.sessionId):null;
  if(!s||!isRunning(currentCtf(s.ctfId))){socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");return;}
  if(s.platform){try{await platform.sessionAccess(s);}catch{socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");return;}}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,s));
});
wss.on("connection",(ws,s)=>{
  const other=activeSockets.get(s.id);if(other&&other.readyState===1)other.close(1000,"Nova conexão");
  activeSockets.set(s.id,ws);
  const proc=spawn("script",["-q","-f","-c","docker exec -it -u aluno "+box(s)+" /bin/bash -li","/dev/null"],{stdio:["pipe","pipe","pipe"]});
  record(s,"terminal_open");
  proc.stdout.on("data",chunk=>{
    if(ws.readyState===1)ws.send(chunk);
    // Limite cada frame para respeitar o tamanho máximo dos eventos JSONB no Supabase.
    for(let offset=0;offset<chunk.length;offset+=8192)
      record(s,"terminal_output",{base64:chunk.subarray(offset,offset+8192).toString("base64")});
  });
  proc.stderr.on("data",chunk=>{if(ws.readyState===1)ws.send(chunk);});
  ws.on("message",buf=>{if(buf.length>4096){ws.close(1009,"Input grande");return;}proc.stdin.write(buf);record(s,"terminal_input",{base64:Buffer.from(buf).toString("base64")});});
  proc.on("error",e=>{record(s,"terminal_error",{message:e.message});ws.close();});
  proc.on("close",code=>{record(s,"terminal_closed",{code});if(ws.readyState===1)ws.close();});
  ws.on("close",()=>{if(activeSockets.get(s.id)===ws)activeSockets.delete(s.id);proc.kill("SIGHUP");});
});
setInterval(()=>{
  for(const c of state.ctfs){if(c.status==="running"&&!c.pausedAt&&Date.parse(c.deadline)<=Date.now()){
    c.status="closed";persist();for(const s of state.sessions.filter(s=>s.ctfId===c.id))void destroyLab(s);
  }}
  for(const [key,v] of tickets)if(v.until<=Date.now())tickets.delete(key);
},5000).unref();
server.listen(PORT,"127.0.0.1",()=>console.log("CTF LOCAL SEM PONTOS: http://127.0.0.1:"+PORT));
process.on("SIGINT",()=>{clearTimeout(saveTimer);fs.writeFileSync(STATE_FILE,JSON.stringify(state,null,2),{mode:0o600});process.exit(0);});
