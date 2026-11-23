import assert from "node:assert/strict";
import { WebSocket } from "ws";
const BASE="http://127.0.0.1:4100";
const key=process.env.CTF_ADMIN_KEY;
assert(key && key.length>=24,"Configure CTF_ADMIN_KEY");
let sessionToken="";
async function req(route,method="GET",payload,staff=false){
 const headers={"content-type":"application/json"};
 if(staff)headers.authorization="Bearer "+key;
 else if(sessionToken)headers.authorization="Bearer "+sessionToken;
 const response=await fetch(BASE+route,{method,headers,body:payload?JSON.stringify(payload):undefined});
 const result=await response.json();assert(response.ok,route+": "+JSON.stringify(result));return result;
}
const admin=await req("/api/admin/state","GET",null,true);
const ctf=admin.ctfs[0];assert(ctf,"CTF demonstrativo ausente");
assert.equal(ctf.challenges.length,4);
await req("/api/admin/ctfs/"+ctf.id+"/publish","POST",{},true);
await req("/api/admin/ctfs/"+ctf.id+"/start","POST",{},true);
const invite=(await req("/api/admin/invites","POST",{ctfId:ctf.id,team:"Dupla de Teste CI"},true)).invite;
const joined=await req("/api/join","POST",{code:invite.code});
sessionToken=joined.token;assert(sessionToken);
let out="";
async function terminal(text,pattern){
 const ticket=(await req("/api/ticket","POST",{})).ticket;
 const socket=new WebSocket("ws://127.0.0.1:4100",["ctf-v1","ticket."+ticket]);
 await new Promise((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});
 out="";
 const seen=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error("Timeout esperando resposta terminal: "+out.slice(-1200))),7000);
  socket.on("message",buffer=>{out+=buffer.toString();if(pattern.test(out)){clearTimeout(timeout);resolve(out);}});
 });
 socket.send(text+"\r");
 try{return await seen;}finally{socket.close();}
}
const nav=await terminal("cat /var/tmp/arquivo/relatorios/.operacao/.relatorio.txt",/FLAG\{ARQUIVO_[A-F0-9]+\}/);
const f1=nav.match(/FLAG\{ARQUIVO_[A-F0-9]+\}/)[0];
assert((await req("/api/flag","POST",{challenge:1,flag:f1})).accepted);
const otherInvite=(await req("/api/admin/invites","POST",{ctfId:ctf.id,team:"Dupla Isolada"},true)).invite;
const otherJoined=await req("/api/join","POST",{code:otherInvite.code});
const originalToken=sessionToken;
sessionToken=otherJoined.token;
assert.equal((await req("/api/flag","POST",{challenge:1,flag:f1})).accepted,false,"Flag de outra dupla deve ser rejeitada");
sessionToken=originalToken;
const permission=await terminal("chmod g+r /home/aluno/desafios/permissoes/segredo.txt; cat /home/aluno/desafios/permissoes/segredo.txt",/FLAG\{GRUPO_[A-F0-9]+\}/);
const f2=permission.match(/FLAG\{GRUPO_[A-F0-9]+\}/)[0];
assert((await req("/api/flag","POST",{challenge:2,flag:f2})).accepted);
const log=await terminal("cat /home/aluno/desafios/logs/auth.log",/198\.51\.100\.[0-9]+/);
const ip=log.match(/198\.51\.100\.[0-9]+/)[0];
const auditTag=log.match(/Token de auditoria:\s*([A-F0-9]{14})/)[1];
assert((await req("/api/flag","POST",{challenge:3,flag:"FLAG{IP_"+ip+"_"+auditTag+"}"})).accepted);
const dns=await terminal("dig @127.0.0.1 ctf.hackerspaidegua.local TXT +short",/FLAG\{DNS_[A-F0-9]+\}/);
const f4=dns.match(/FLAG\{DNS_[A-F0-9]+\}/)[0];
assert((await req("/api/flag","POST",{challenge:4,flag:f4})).accepted);
for(let id=1;id<=4;id++)await req("/api/writeup","POST",{challenge:id,command:"Comando real",reason:"Raciocínio técnico de teste",evidence:"Saída do terminal"});
const me=(await req("/api/me")).session;
assert.equal(me.solved.length,4);
assert.equal(Object.keys(me.writeups).length,4);
const report=(await req("/api/admin/sessions/"+me.id,"GET",null,true));
assert(report.events.some(x=>x.type==="terminal_output"));
assert(report.events.some(x=>x.type==="flag_submission"));
assert(report.events.some(x=>x.type==="writeup_saved"));
await req("/api/admin/ctfs/"+ctf.id+"/close","POST",{},true);
console.log("PASS: 4 desafios Linux reais, DNS, chmod, flags, writeup e auditoria. Nenhum banco/nota oficial utilizado.");
