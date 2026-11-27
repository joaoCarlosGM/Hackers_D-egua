/**
 * Browser-side compatibility bridge for the instructor's Aula 7 OpenSSL exercise.
 * This is NOT the OpenSSL executable. AES-256-CBC/PBKDF2 decrypts with the
 * browser's native Web Crypto API; no plaintext/password goes to a server.
 */
const prefix="HPDE_CRYPT_REQ:";
export type CryptoResult={ok:true;base64:string}|{ok:false;message:string};
function from64(encoded:string):Uint8Array{
 if(encoded.length>1_400_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
  throw Error("Entrada Base64 inválida ou grande demais");
 return Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0));
}
function to64(bytes:Uint8Array):string{
 let out="";for(const b of bytes)out+=String.fromCharCode(b);return btoa(out);
}
export async function decryptAula07Ciphertext(ciphertext64:string,password64:string):Promise<CryptoResult>{
 try{
  const bytes=from64(ciphertext64);
  const passwordBytes=from64(password64);
  if(passwordBytes.length>128)throw Error("Senha excede o limite do laboratório");
  if(bytes.length<32||String.fromCharCode(...bytes.slice(0,8))!=="Salted__")
   throw Error("Arquivo não está no formato OpenSSL Salted__");
  const keyMaterial=await crypto.subtle.importKey("raw",passwordBytes as BufferSource,"PBKDF2",false,["deriveBits"]);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({
   name:"PBKDF2",hash:"SHA-256",salt:bytes.slice(8,16) as BufferSource,iterations:10000
  },keyMaterial,384));
  const key=await crypto.subtle.importKey("raw",derived.slice(0,32) as BufferSource,{name:"AES-CBC"},false,["decrypt"]);
  const plaintext=await crypto.subtle.decrypt({name:"AES-CBC",iv:derived.slice(32,48) as BufferSource},
   key,bytes.slice(16) as BufferSource);
  return {ok:true,base64:to64(new Uint8Array(plaintext))};
 }catch(e){
  return {ok:false,message:"Descriptografia falhou: senha incorreta, arquivo inválido ou recurso indisponível ("+(e as Error).name+")"};
 }
}
/** Returns only completed protocol requests; helper does not parse arbitrary terminal input. */
export function extractAula07CryptoRequest(line:string):{ciphertext64:string;password64:string}|null{
 if(!line.startsWith(prefix)||line.length>1_500_000)return null;
 const pieces=line.slice(prefix.length).split(":");
 if(pieces.length!==2)return null;
 if(!/^[A-Za-z0-9+/=]+$/.test(pieces[0])||!/^[A-Za-z0-9+/=]+$/.test(pieces[1]))return null;
 return {ciphertext64:pieces[0],password64:pieces[1]};
}
