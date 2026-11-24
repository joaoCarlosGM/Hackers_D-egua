import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root=path.resolve("public/ctf-v86");
const mime={".js":"application/javascript",".wasm":"application/wasm",".bin":"application/octet-stream"};
const html=[
 "<!doctype html><meta charset='utf-8'><script src='/libv86.js'></script>",
 "<script>",
 "window.__result='booting';window.__serial='';",
 "const vm=new V86({wasm_path:'/v86.wasm',bios:{url:'/seabios.bin'},vga_bios:{url:'/vgabios.bin'},",
 "bzimage:{url:'/buildroot-bzimage68.bin',async:false},filesystem:{},memory_size:96*1024*1024,",
 "vga_memory_size:2*1024*1024,cmdline:'tsc=reliable mitigations=off random.trust_cpu=on',",
 "autostart:true,disable_keyboard:true});window.__vm=vm;",
 "let sent=false;vm.add_listener('serial0-output-byte',byte=>{",
 "const c=String.fromCharCode(byte);if(c==='\\r')return;",
 "window.__serial=(window.__serial+c).slice(-4000);",
 "if(!sent && /(?:~% |# |\\$ )$/.test(window.__serial)){",
 "sent=true;vm.serial0_send('printf \"\\\\nHPDE_V86_LINUX_OK\\\\n\"\\n');",
 "}",
 "if(window.__serial.includes('\\nHPDE_V86_LINUX_OK\\n'))window.__result='passed';",
 "});",
 "</script>"
].join("\n");
const server=createServer(async(req,res)=>{
 try{
  if(req.url==="/"){res.writeHead(200,{"content-type":"text/html"});return res.end(html);}
  const name=String(req.url).split("?")[0].slice(1);
  if(!["libv86.js","v86.wasm","seabios.bin","vgabios.bin","buildroot-bzimage68.bin"].includes(name)){
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
 await page.goto("http://127.0.0.1:"+port,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.__result==="passed",undefined,{timeout:90000});
 await page.evaluate(() => {
  window.__serial="";
  window.__vm.serial0_send("id; ls -ld /etc /var/tmp /home; mkdir -p /var/tmp/hpde-ctf-check; echo v86-ok > /var/tmp/hpde-ctf-check/flag; cat /var/tmp/hpde-ctf-check/flag; echo HPDE_FS_TEST_END"+String.fromCharCode(10));
 });
 await page.waitForFunction(()=>window.__serial.includes("HPDE_FS_TEST_END") && /(?:~% |# |\\$ )$/.test(window.__serial),undefined,{timeout:15000});
 const output=await page.evaluate(()=>window.__serial);
 console.log("Linux filesystem probe:",output.slice(-1400));
 if(!/(?:^|\n)v86-ok\r?\n/.test(output))throw Error("Browser Linux filesystem write failed");
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
