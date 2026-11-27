import { describe, expect, it } from "vitest";
import { createCipheriv, pbkdf2Sync, webcrypto } from "node:crypto";
import { decryptAula07Ciphertext,extractAula07CryptoRequest } from "../src/ctfReviewCryptoBridge";

describe("Aula 7 — AES real pelo browser (compatibilidade OpenSSL)",()=>{
 const password="paidegua2026";
 const salt=Buffer.from("HackPaiD");
 const keyiv=pbkdf2Sync(password,salt,10000,48,"sha256");
 const cipher=createCipheriv("aes-256-cbc",keyiv.subarray(0,32),keyiv.subarray(32,48));
 const data=Buffer.concat([Buffer.from("Salted__"),salt,
  cipher.update("FLAG{cr1pt0_sh4256_p41_d3gu4_m0d1} #92968\n"),cipher.final()]);
 const encoded=data.toString("base64");
 const pass=Buffer.from(password).toString("base64");
 it("decifra os bytes AES-256-CBC/PBKDF2 originais, sem substituir a flag por texto fixo",async()=>{
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
  const req=extractAula07CryptoRequest("HPDE_CRYPT_REQ:"+encoded+":"+pass);
  expect(req).not.toBeNull();
  const result=await decryptAula07Ciphertext(req!.ciphertext64,req!.password64);
  expect(result.ok).toBe(true);
  if(result.ok)expect(Buffer.from(result.base64,"base64").toString()).toBe("FLAG{cr1pt0_sh4256_p41_d3gu4_m0d1} #92968\n");
 });
 it("rejeita senha incorreta",async()=>{
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
  const result=await decryptAula07Ciphertext(encoded,Buffer.from("senha-errada").toString("base64"));
  expect(result.ok).toBe(false);
 });
 it("não aceita protocolos arbitrários",()=>{
  expect(extractAula07CryptoRequest("HPDE_CRYPT_REQ:abc:xyz:extra")).toBeNull();
  expect(extractAula07CryptoRequest("outro:abc:xyz")).toBeNull();
 });
});
