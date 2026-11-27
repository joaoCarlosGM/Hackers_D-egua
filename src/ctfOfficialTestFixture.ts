import { initCommands, type EncryptedBundle } from "./CtfReviewBrowser";

/** Only used for instructor-supervised simulations. Browser can inspect the
 * fixture; never use it as a cheating-resistant official competition target. */
export type Ctf1TestFixture={
 round_id:string;team_id:string;mode:"test";ends_at:string;server_now:string;
 first_flag:string;second_flag:string;third_flag:string;
};
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
function base64(bytes:Uint8Array):string{
 let out="";for(const b of bytes)out+=String.fromCharCode(b);return btoa(out);
}
export async function generateCtf1TestCommands(
 fixture:Ctf1TestFixture,bundle:EncryptedBundle
):Promise<string[]>{
 if(fixture.mode!=="test"||!/^FLAG\{[^}]{4,128}\}$/.test(fixture.first_flag)||
 !/^FLAG\{(?:\d{1,3}\.){3}\d{1,3}\}$/.test(fixture.second_flag)||
 !/^FLAG\{[^}]{4,128}\}$/.test(fixture.third_flag))throw Error("Fixture de teste inválida");
 // Web Crypto requires a secure browsing context (HTTPS or localhost).
 // On HTTP/LAN IPs, crypto.subtle can be missing and calling importKey fails
 // before the terminal is even mounted. Fail with a non-sensitive diagnosis.
 const webCrypto=globalThis.crypto;
 if(!webCrypto?.subtle || typeof webCrypto.subtle.importKey!=="function" ||
    typeof webCrypto.subtle.deriveBits!=="function"){
  const secure=typeof window==="undefined"?"unknown":String(window.isSecureContext);
  const protocol=typeof window==="undefined"?"unknown":window.location.protocol;
  throw new Error("Web Crypto (importKey) indisponível neste navegador. "+
   "Acesse o CTF pelo endereço oficial HTTPS (não por HTTP/IP local), "+
   "utilize Chrome/Edge/Firefox atualizado e recarregue a página. "+
   "Contexto seguro: "+secure+"; protocolo: "+protocol+".");
 }
 const ip=fixture.second_flag.slice(5,-1),salt=webCrypto.getRandomValues(new Uint8Array(8));
 const material=await webCrypto.subtle.importKey("raw",new TextEncoder().encode("paidegua2026"),"PBKDF2",false,["deriveBits"]);
 const bits=new Uint8Array(await webCrypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:10000},material,384));
 const key=await webCrypto.subtle.importKey("raw",bits.slice(0,32),{name:"AES-CBC"},false,["encrypt"]);
 const encrypted=new Uint8Array(await webCrypto.subtle.encrypt({name:"AES-CBC",iv:bits.slice(32,48)},key,new TextEncoder().encode(fixture.third_flag+"\n")));
 const content=new Uint8Array(16+encrypted.length);
 content.set(new TextEncoder().encode("Salted__"));content.set(salt,8);content.set(encrypted,16);
 const checksum=Array.from(new Uint8Array(await webCrypto.subtle.digest("SHA-256",content)),b=>b.toString(16).padStart(2,"0")).join("");
 const modified:EncryptedBundle={sha256Evidence37:bundle.sha256Evidence37,files:bundle.files.map((f,i)=>i===36?{...f,base64:base64(content)}:f)};
 const commands=initCommands(modified);
 const originalIp="185.220.101.42";
 const generated=commands.map(line=>line
  .replaceAll("FLAG{r4str0_0cult0_chm0d_p41_d3gu4}",fixture.first_flag)
  .replaceAll(originalIp,ip)
  .replaceAll("3d3f540b1656b4f48c5db9e1fad13883c1b59ef7266c43879673ac4d332fe4b2",checksum));
 const base=generated.filter(line=>!line.includes("/home/aluno/missao.txt"));
 const last=base.pop();
 if(!last||!last.includes("HPDE_LAB_PRONTO"))throw Error("Validação final de Linux não encontrada");
 const mission=[
 "HACKERS PAI D'EGUA / CTF 01 - TESTE DA DUPLA",
 "Tres desafios, flags exclusivas por dupla e write-ups.",
 "A rodada tem 60 minutos e o professor controla o inicio.",
 "",
 "DESAFIO 1 - O RASTRO TRANCADO",
 "HISTORIA: Um agente ocultou um relatorio confidencial em /var/tmp/",
 "e retirou as permissoes de leitura antes de desaparecer.",
 "MISSAO: localize o arquivo oculto, diagnostique permissoes,",
 "restaure o acesso necessario e capture a primeira flag.",
 "COMANDO DE PARTIDA: ls -la /var/tmp/",
 "",
 "DESAFIO 2 - O INVASOR INSISTENTE",
 "HISTORIA: o servidor recebeu tentativas de forca bruta SSH.",
 "MISSAO: investigue /var/log/auth_simulado.log e identifique",
 "o IP que teve a maior quantidade de senhas incorretas.",
 "Entregue no formato FLAG{ip_do_atacante}.",
 "COMANDO DE PARTIDA: grep 'Failed password' /var/log/auth_simulado.log",
 "",
 "DESAFIO 3 - A IMPRESSAO DIGITAL, MD5 E O COFRE",
 "HISTORIA: ha 50 arquivos .enc em /opt/evidencias,",
 "uma wordlist dicionario_paraense.txt e senha_cofre.md5.",
 "O unico arquivo legitimo tem SHA-256 terminado em "+checksum.slice(-4)+".",
 "MISSAO: identifique o arquivo via SHA-256, recupere a senha",
 "por dicionario MD5 e decifre a evidencia AES-256-CBC.",
 "COMANDO DE PARTIDA: ls -la /opt/evidencias/",
 "",
 "AMBIENTE DE TESTE: john e hashid sao utilitarios didaticos;",
 "openssl usa Web Crypto real no navegador (nao binario oficial).",
 "Registre uma flag e um write-up para cada desafio.",
 "Digite help dos comandos ou consulte o instrutor se necessario."
 ];
 const missionSteps:Array<string>=[];
 for(let i=0;i<mission.length;i+=5){
  missionSteps.push("printf '%s\\n' "+mission.slice(i,i+5).map(quote).join(" ")+
    (i===0?" > ":" >> ")+"/home/aluno/missao.txt");
 }
 return [...base,...missionSteps,last];
}
