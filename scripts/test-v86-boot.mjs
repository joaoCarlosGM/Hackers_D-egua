import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";

const root=path.resolve("public/ctf-v86");
const mime={".js":"application/javascript",".css":"text/css",".wasm":"application/wasm",".bin":"application/octet-stream"};
const html=[
 "<!doctype html><meta charset='utf-8'><link rel='stylesheet' href='/xterm.css'>",
 "<script src='/libv86.js'></script><script src='/xterm.js'></script><script src='/xterm-addon-fit.js'></script>",
 "<div id='xterm-test' style='width:760px;height:340px'></div>",
 "<script>",
 "window.__result='booting';window.__serial='';",
 "const vm=new V86({wasm_path:'/v86.wasm',bios:{url:'/seabios.bin'},vga_bios:{url:'/vgabios.bin'},",
 "bzimage:{url:'/buildroot-bzimage68.bin',async:false},filesystem:{},memory_size:96*1024*1024,",
 "vga_memory_size:2*1024*1024,cmdline:'tsc=reliable mitigations=off random.trust_cpu=on',",
 "autostart:true,disable_keyboard:true,disable_speaker:true});window.__vm=vm;",
 "const xterm=new Terminal({convertEol:true,cursorBlink:true,fontSize:14});",
 "xterm.open(document.getElementById('xterm-test'));window.__xterm=xterm;",
 "const fit=new FitAddon.FitAddon();xterm.loadAddon(fit);fit.fit();",
 "xterm.onData(data=>vm.serial0_send(data.replace(/\\r/g,'\\n')));",
 "let sent=false;vm.add_listener('serial0-output-byte',byte=>{",
 "const c=String.fromCharCode(byte);xterm.write(c);if(c==='\\r')return;",
 "window.__serial=(window.__serial+c).slice(-4000);",
 "if(!sent && /(?:~% |# |\\$ )$/.test(window.__serial)){",
 "sent=true;vm.serial0_send('printf \"\\\\nHPDE_V86_LINUX_OK\\\\n\"\\n');",
 "}",
 "if(window.__serial.includes('\\nHPDE_V86_LINUX_OK\\n'))window.__result='passed';",
 "});",
 "</script>"
].join("\n");
// Reproduce the strict GitHub Pages CSP including the narrowly-scoped WebAssembly permission.
const bootstrap=html.split("<script>")[1]?.split("</script>")[0];
if(!bootstrap)throw Error("Missing test browser bootstrap script");
const hash=createHash("sha256").update(bootstrap).digest("base64");
const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-"+hash+"'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none';";
const securedHtml=html.replace("<script src=", '<meta http-equiv="Content-Security-Policy" content="'+csp+'"><script src=');
const server=createServer(async(req,res)=>{
 try{
  if(req.url==="/"){res.writeHead(200,{"content-type":"text/html"});return res.end(securedHtml);}
  const name=String(req.url).split("?")[0].slice(1);
  if(!["libv86.js","v86.wasm","seabios.bin","vgabios.bin","buildroot-bzimage68.bin","xterm.js","xterm.css","xterm-addon-fit.js"].includes(name)){
   res.writeHead(404);return res.end();
  }
  const filename=path.join(root,name);
  await stat(filename);
  res.writeHead(200,{"content-type":mime[path.extname(name)]||"application/octet-stream"});
  res.end(await readFile(filename));
 }catch(e){res.writeHead(500);res.end(String(e));}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage();
 page.on("pageerror",error=>process.stderr.write("Browser error: "+error.message+"\n"));
 page.on("console",m=>{if(m.type()==="error"||m.type()==="warning")process.stderr.write("Console "+m.type()+": "+m.text()+"\n");});
 page.on("requestfailed",r=>process.stderr.write("Request failed: "+r.url()+" "+r.failure()?.errorText+"\n"));
 await page.goto("http://127.0.0.1:"+port,{waitUntil:"domcontentloaded"});
 const state=await page.evaluate(()=>({
   boot:window.__result??null,emulatorGlobal:typeof window.V86,instanceCreated:!!window.__vm,
   csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content??null
 }));
 console.log("CSP bootstrap state:",JSON.stringify(state));
 if(!state.instanceCreated)throw Error("Browser VM bootstrap did not execute under CSP");
 await page.waitForFunction(()=>window.__result==="passed",undefined,{timeout:35000});
 await page.evaluate(() => {
  window.__serial="";
  window.__vm.serial0_send("id; ls -ld /etc /var/tmp /home; mkdir -p /var/tmp/hpde-ctf-check; echo v86-ok > /var/tmp/hpde-ctf-check/flag; cat /var/tmp/hpde-ctf-check/flag; echo HPDE_FS_TEST_END"+String.fromCharCode(10));
 });
 await page.waitForFunction(()=>window.__serial.includes("HPDE_FS_TEST_END") && /(?:~% |# |\\$ )$/.test(window.__serial),undefined,{timeout:15000});
 const output=await page.evaluate(()=>window.__serial);
 console.log("Linux filesystem probe:",output.slice(-1400));
 if(!/(?:^|\n)v86-ok\r?\n/.test(output))throw Error("Browser Linux filesystem write failed");

 // Exercise the commands needed by the teacher-only demonstration, not just the boot.
 const stages=[
  "mkdir -p /var/tmp/relatorios/.auditoria /home/aluno/desafios/permissoes /home/aluno/desafios/logs /tmp/ctf-bin",
  "echo 'investigadores:x:1300:' >> /etc/group",
  "printf '%s\n' 'FLAG{ARQUIVO_REVIS_TESTE}' > /var/tmp/relatorios/.auditoria/.relatorio.txt",
  "printf '%s\n' 'FLAG{GRUPO_REVIS_TESTE}' > /home/aluno/desafios/permissoes/segredo.txt",
  "chgrp investigadores /home/aluno/desafios/permissoes/segredo.txt; chmod 600 /home/aluno/desafios/permissoes/segredo.txt",
  "printf '%s\n' '# auth.log (dados fictícios)' > /home/aluno/desafios/logs/auth.log",
  "for i in 1 2 3 4 5 6 7 8 9; do echo 'Failed password from 198.51.100.44' >> /home/aluno/desafios/logs/auth.log; done",
  "for i in 1 2 3 4; do echo 'Failed password from 203.0.113.7' >> /home/aluno/desafios/logs/auth.log; done",
  "printf '%s\n' '#!/bin/sh' 'echo \"ctf.hackerspaidegua.local. IN TXT \\\"FLAG{DNS_REVIS_TESTE}\\\"\"' > /tmp/ctf-bin/dig",
  "chmod +x /tmp/ctf-bin/dig; export PATH=/tmp/ctf-bin:$PATH",
  "printf '%s\n' 'REVISAO PRE-CTF' > /home/aluno/missao.txt"
 ];
 const execute=async(cmd,marker)=>{
  await page.evaluate(code=>{window.__serial="";window.__vm.serial0_send(code+String.fromCharCode(10));},
    cmd+"; printf '\\n"+marker+"\\n'");
  await page.waitForFunction(m=>window.__serial.includes("\n"+m+"\n") &&
    /(?:~% |# |\$ )$/.test(window.__serial),marker,{timeout:15000});
  return page.evaluate(()=>window.__serial);
 };
 for(let i=0;i<stages.length;i++){
  const output=await execute(stages[i],"HPDE_SCENARIO_"+i);
  if(/(?:chgrp:|chmod:|cannot create|not found|Permission denied|Read-only file system)/i.test(output))
    throw Error("Scenario preparation stage "+i+" failed: "+output.slice(-700));
 }
 const check=await execute("ls -la /var/tmp/relatorios/.auditoria; cat /var/tmp/relatorios/.auditoria/.relatorio.txt; ls -l /home/aluno/desafios/permissoes/segredo.txt; grep 'Failed password' /home/aluno/desafios/logs/auth.log | wc -l; dig @127.0.0.1 ctf.hackerspaidegua.local TXT; cat /home/aluno/missao.txt","HPDE_SCENARIO_CHECK");
 console.log("Scenario output:",check.slice(-2200));
 if(!check.includes("FLAG{ARQUIVO_REVIS_TESTE}") ||
    !check.includes("FLAG{DNS_REVIS_TESTE}") ||
    !check.includes("REVISAO PRE-CTF") ||
    !check.includes("13"))
    throw Error("Four-scenario smoke test did not show expected flags, log count or mission.");
 console.log("PASS: scenario files, group permissions, log commands and DNS teaching script executed in browser Linux.");

 // The same xterm.js version used in the teacher prototype must render ANSI
 // and deliver actual keystrokes to the Linux serial port.
 await page.evaluate(()=>{
   window.__serial="";
   window.__xterm.write("\x1b[1;32mHPDE_COLOR_RENDER\x1b[0m\r\n");
 });
 await page.waitForFunction(()=>{
   const buf=window.__xterm.buffer.active;
   for(let row=0;row<buf.length;row++){
    if(buf.getLine(row)?.translateToString().includes("HPDE_COLOR_RENDER"))return true;
   }
   return false;
 },undefined,{timeout:10000});
 const ansi=await page.locator("#xterm-test .xterm-fg-2").count();
 if(!ansi)throw Error("xterm.js did not interpret ANSI green foreground color");
 await page.locator("#xterm-test .xterm-helper-textarea").focus();
 await page.keyboard.type("echo HPDE_XTERM_INPUT_OK");
 await page.keyboard.press("Enter");
 await page.waitForFunction(()=>window.__serial.includes("\nHPDE_XTERM_INPUT_OK\n"),undefined,{timeout:15000});
 console.log("PASS: xterm.js renders ANSI colors and Enter sends real commands to the v86 Linux shell.");

 console.log("PASS: v86 booted real Linux and executed a shell printf through the serial interface.");
 console.log("Terminal tail:",output.slice(-340));
 await page.close();
}catch(e){
 console.error("FAIL v86 Linux boot:",e);
 if(browser){
  const pages=browser.contexts().flatMap(x=>x.pages());
  for(const page of pages)console.error("Last VM output:",await page.evaluate(()=>window.__serial||"").catch(()=>"(not ready)"));
 }
 process.exitCode=1;
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
