// Assets for the teacher-only v86 browser Linux demonstration.
// Downloaded at BUILD time and served from GitHub Pages, not from a running backend.
// Deliberately pinned emulator version, with file signature and size checks.
import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
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
  ["xterm-addon-fit.js","https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.11.0/lib/addon-fit.js",700],
];
function validate(name,bytes,minSize){
 if(bytes.byteLength<minSize)throw Error(name+": arquivo menor que o mínimo esperado");
 if(name==="v86.wasm" && Buffer.from(bytes.subarray(0,4)).toString("hex")!=="0061736d")
   throw Error("WASM inválido");
 if(name==="libv86.js"&&!Buffer.from(bytes).toString("utf8").includes("V86"))
   throw Error("Script v86 inválido");
 if(name==="xterm-addon-fit.js"&&!Buffer.from(bytes).toString("utf8").includes("FitAddon"))
   throw Error("FitAddon.js inválido");
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

/* Aula 7 review fixture: genuine deterministic OpenSSL-compatible AES-256-CBC
 * files. Served only as a demonstrative teacher-only fixture, never graded. */
function encryptAula07(payload,salt){
 const keyiv=pbkdf2Sync("paidegua2026",salt,10000,48,"sha256");
 const cipher=createCipheriv("aes-256-cbc",keyiv.subarray(0,32),keyiv.subarray(32,48));
 return Buffer.concat([Buffer.from("Salted__"),salt,cipher.update(payload,"utf8"),cipher.final()]);
}
const encrypted=[];
for(let i=1;i<=50;i++){
 const n=String(i).padStart(2,"0");
 const salt=Buffer.from(i===37?"HackPaiD":"Fake00"+n);
 const plain=i===37
  ?"FLAG{cr1pt0_sh4256_p41_d3gu4_m0d1} #92968\n"
  :"Arquivo falso #"+n+" - Pista incorreta!\n";
 const data=encryptAula07(plain,salt);
 encrypted.push({name:"evidencia_"+n+".enc",base64:data.toString("base64")});
}
const authentic=Buffer.from(encrypted[36].base64,"base64");
const checksum=createHash("sha256").update(authentic).digest("hex");
if(checksum!=="3d3f540b1656b4f48c5db9e1fad13883c1b59ef7266c43879673ac4d332fe4b2")
 throw Error("Aula 7: o SHA-256 da evidencia autentica mudou: "+checksum);
await writeFile(path.join(root,"aula07-evidencias.json"),JSON.stringify({
 format:"OpenSSL salted AES-256-CBC PBKDF2 SHA-256 10000",
 sha256Evidence37:checksum,
 files:encrypted
}));
console.log("[v86] Aula 7: 50 arquivos AES-256-CBC gerados e validados.");

/* Export a portable tar archive for Kali/Live Boot, where OpenSSL and the
 * official John the Ripper can run. This is professor demo data, not graded. */
function tarOctal(header,offset,length,value){
 const digits=value.toString(8).padStart(length-1,"0");
 header.write(digits.slice(-(length-1))+"\\0",offset,length,"ascii");
}
function tarFile(name,bytes){
 const header=Buffer.alloc(512,0);
 header.write(name,0,Math.min(name.length,99),"utf8");
 tarOctal(header,100,8,0o644);
 tarOctal(header,108,8,0);
 tarOctal(header,116,8,0);
 tarOctal(header,124,12,bytes.length);
 tarOctal(header,136,12,0);
 header.fill(32,148,156);
 header.write("0",156);
 header.write("ustar\\0",257,"ascii");header.write("00",263,"ascii");
 const checksum=header.reduce((sum,byte)=>sum+byte,0);
 tarOctal(header,148,8,checksum);
 const padding=Buffer.alloc((512-bytes.length%512)%512);
 return Buffer.concat([header,bytes,padding]);
}
const wordlist=["123456","admin2026","ufpa_itec","veropeso123","tacaca_quente",
 "acai_com_peixe","mangal_das_garcas","ilha_do_marajo","boto_cor_de_rosa",
 "maniwa_2026","castanha_do_para","paidegua2026","cirio_de_nazare",
 "estacao_docas","guama_ufpa"].join("\\n")+"\\n";
const md5=createHash("md5").update("paidegua2026").digest("hex")+"\\n";
const tarEntries=[
 tarFile("evidencias/dicionario_paraense.txt",Buffer.from(wordlist)),
 tarFile("evidencias/senha_cofre.md5",Buffer.from(md5)),
 ...encrypted.map(f=>tarFile("evidencias/"+f.name,Buffer.from(f.base64,"base64")))
];
await writeFile(path.join(root,"aula07-evidencias.tar"),
 Buffer.concat([...tarEntries,Buffer.alloc(1024)]));
console.log("[v86] Pacote de laboratorio Kali Aula 7 gerado.");
