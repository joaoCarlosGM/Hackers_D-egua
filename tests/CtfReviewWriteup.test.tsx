// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import CtfReviewBrowser from "../src/CtfReviewBrowser";
import { rpc } from "../src/api";

vi.mock("../src/api", () => ({
 rpc:vi.fn(async(name:string)=>{
  if(name==="ctf_teacher_review_history")return [];
  if(name==="ctf_teacher_review_start")return "00000000-0000-4000-8000-000000000001";
  if(name==="ctf_teacher_review_append")return 1;
  return null;
 })
}));
afterEach(()=>{
 cleanup();
 for(const el of document.querySelectorAll('script[src*="libv86.js"], script[src*="xterm"], link[href*="xterm.css"]'))el.remove();
 vi.clearAllMocks();
});

async function startDemo(){
 const result=render(<CtfReviewBrowser/>);
 fireEvent.click(screen.getByRole("button",{name:/Iniciar demonstração/i}));
 await screen.findByRole("heading",{name:/O Rastro Trancado/i});
 // Simulate a failed emulator asset fetch: it settles the asynchronous
 // session bootstrap and enables the form without needing to boot Linux in jsdom.
 await waitFor(()=>expect(document.querySelectorAll('script[src*="libv86.js"]').length).toBeGreaterThan(0));
 const scripts=document.querySelectorAll('script[src*="libv86.js"]');
 fireEvent.error(scripts[scripts.length-1] as HTMLScriptElement);
 await waitFor(()=>expect((screen.getByRole("button",{name:/Encerrar e salvar/i}) as HTMLButtonElement).disabled).toBe(false));
 return result;
}
describe("write-up editing and scrolling for teacher-only CTF review",()=>{
 it("lets the teacher type all three fields in normal mode without xterm stealing focus",async()=>{
  const {container}=await startDemo();
  const main=container.querySelector(".ctf-mission-main");
  expect(main?.querySelector(":scope > .ctf-evidence-panel")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Preencher write-up/i}));
  expect(main?.querySelector(".ctf-browser-terminal")).toBeTruthy();
  const command=screen.getByRole("textbox",{name:/1\. Comando utilizado/i}) as HTMLTextAreaElement;
  const reason=screen.getByRole("textbox",{name:/2\. Raciocínio técnico/i}) as HTMLTextAreaElement;
  const evidence=screen.getByRole("textbox",{name:/3\. Flag obtida e evidência/i}) as HTMLTextAreaElement;
  fireEvent.change(command,{target:{value:"find /var/tmp -type f -name '.*'"}});
  fireEvent.change(reason,{target:{value:"Procurei um arquivo oculto para explicar o incidente."}});
  fireEvent.change(evidence,{target:{value:"FLAG{TESTE} encontrada no arquivo oculto."}});
  expect(command.value).toBe("find /var/tmp -type f -name '.*'");
  expect(reason.value).toContain("Procurei");
  expect(evidence.value).toContain("FLAG{TESTE}");
  fireEvent.click(screen.getByRole("button",{name:/Salvar write-up no Supabase/i}));
  await waitFor(()=>expect(vi.mocked(rpc)).toHaveBeenCalledWith(
   "ctf_teacher_review_writeup",
   expect.objectContaining({p_writeup:expect.objectContaining({
    "0":expect.objectContaining({
     command:"find /var/tmp -type f -name '.*'",
     reason:expect.stringContaining("Procurei"),
     evidence:expect.stringContaining("FLAG{TESTE}")
    })
   })})
  ));
 });
 it("opens a scannable editor in document.body, edits and returns to terminal with draft intact",async()=>{
  const {container}=await startDemo();
  fireEvent.click(screen.getByRole("button",{name:/Preencher write-up/i}));
  const portal=screen.getByTestId("ctf-writeup-portal");
  expect(document.body.contains(portal)).toBe(true);
  expect(container.contains(portal)).toBe(false);
  expect(container.querySelector(".ctf-mission-main > .ctf-evidence-panel")).toBeNull();
  expect(screen.getByRole("dialog",{name:/Evidência e relatório de investigação/i})).toBeTruthy();
  const flag=screen.getByRole("textbox",{name:"Flag encontrada"}) as HTMLInputElement;
  await userEvent.type(flag,"FLAG_TESTE_DIGITADO");
  expect(flag.value).toBe("FLAG_TESTE_DIGITADO");
  const command=screen.getByRole("textbox",{name:/1\. Comando utilizado/i}) as HTMLTextAreaElement;
  fireEvent.change(command,{target:{value:"pwd && ls -la"}});
  expect(command.value).toBe("pwd && ls -la");
  fireEvent.keyDown(command,{key:"Escape"});
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("textbox",{name:/1\. Comando utilizado/i})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Preencher write-up/i}));
  expect((screen.getByRole("textbox",{name:/1\. Comando utilizado/i}) as HTMLTextAreaElement).value).toBe("pwd && ls -la");
 });
 it("allows opening and editing the write-up while the terminal is in Focar mode",async()=>{
  await startDemo();
  fireEvent.click(screen.getByRole("button",{name:/Focar/i}));
  expect(document.querySelector(".ctf-browser")?.classList.contains("ctf-focus-mode")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:/Preencher write-up/i}));
  const reason=screen.getByRole("textbox",{name:/2\. Raciocínio técnico/i}) as HTMLTextAreaElement;
  fireEvent.change(reason,{target:{value:"Li o relatório e comparei o resultado."}});
  expect(reason.value).toContain("comparei");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("button",{name:/Sair do foco/i})).toBeTruthy();
 });
});
