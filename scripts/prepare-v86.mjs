// Assets for the teacher-only v86 browser Linux demonstration.
// Downloaded at BUILD time and served from GitHub Pages, not from a running backend.
// Deliberately pinned emulator version, with file signature and size checks.
import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
const root=path.resolve("public/ctf-v86");
const files=[
  ["libv86.js","https://cdn.jsdelivr.net/npm/v86@0.5.476/build/libv86.js",100000],
  ["v86.wasm","https://cdn.jsdelivr.net/npm/v86@0.5.476/build/v86.wasm",100000],
  ["seabios.bin","https://cdn.jsdelivr.net/gh/copy/v86@master/bios/seabios.bin",30000],
  ["vgabios.bin","https://cdn.jsdelivr.net/gh/copy/v86@master/bios/vgabios.bin",10000],
  ["buildroot-bzimage68.bin","https://i.copy.sh/buildroot-bzimage68.bin",300000],
  // The teacher HTML reference uses xterm.js 6 and FitAddon 0.11.
  // Vendor these same versions at build time to keep production CSP self-only.
  ["xterm.js","https://cdnjs.cloudflare.com/ajax/libs/xterm/6.0.0/xterm.js",50000],
  ["xterm.css","https://cdnjs.cloudflare.com/ajax/libs/xterm/6.0.0/xterm.css",3000],
  ["xterm-addon-fit.js","https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.11.0/lib/addon-fit.js",2000],
];
function validate(name,bytes,minSize){
 if(bytes.byteLength<minSize)throw Error(name+": arquivo menor que o mínimo esperado");
 if(name==="v86.wasm" && Buffer.from(bytes.subarray(0,4)).toString("hex")!=="0061736d")
   throw Error("WASM inválido");
 if(name==="libv86.js"&&!Buffer.from(bytes).toString("utf8").includes("V86"))
   throw Error("Script v86 inválido");
}
async function fetchAsset(name,url,min){
 const target=path.join(root,name);
 try{
   const old=await readFile(target);
   validate(name,old,min);console.log("[v86] cache:",name);return;
 }catch{ /* missing or invalid cache */ }
 for(let attempt=0;attempt<3;attempt++){
   try {
     const controller=new AbortController();
     const timeout=setTimeout(()=>controller.abort(),90000);
     const res=await fetch(url,{signal:controller.signal,redirect:"follow"});
     clearTimeout(timeout);
     if(!res.ok)throw Error(res.status+" "+res.statusText);
     const b=new Uint8Array(await res.arrayBuffer());
     validate(name,b,min);
     const tmp=target+".tmp";
     await writeFile(tmp,b);await rename(tmp,target);
     console.log("[v86] downloaded:",name,(b.byteLength/1048576).toFixed(1)+"MB");
     return;
   }catch(e){
     if(attempt===2)throw Error("Falha ao preparar "+name+": "+e.message);
     await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
   }
 }
}
await mkdir(root,{recursive:true});
await Promise.all(files.map(f=>fetchAsset(...f)));
for(const [name] of files){const st=await stat(path.join(root,name));if(!st.isFile())throw Error("Asset ausente "+name);}
console.log("[v86] browser Linux assets ready.");
