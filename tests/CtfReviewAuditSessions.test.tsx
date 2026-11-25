// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CtfReviewBrowser from "../src/CtfReviewBrowser";
import CtfReviewAudit from "../src/CtfReviewAudit";
import { rpc } from "../src/api";

const teacherId="00000000-0000-4000-8000-000000000088";
const sampleRun={
 id:teacherId,title:"Terminal do professor — Revisão Pré-CTF",
 started_at:"2026-11-25T10:00:00Z",closed_at:"2026-11-25T11:00:00Z",
 writeup:{"0":{command:"pwd",reason:"Localizar diretório",evidence:"FLAG{EXEMPLO}"}}
};
vi.mock("../src/api",()=>({
 rpc:vi.fn(async(name:string)=>{
  if(name==="ctf_teacher_review_history")return [sampleRun];
  if(name==="ctf_teacher_review_report")return {
   run:sampleRun,truncated:false,
   events:[{id:1,at:"2026-11-25T10:00:00Z",kind:"command",detail:"pwd"}]
  };
  if(name==="ctf_teacher_review_start")return teacherId;
  if(name==="ctf_teacher_review_append")return 1;
  return null;
 })
}));
afterEach(()=>{
 cleanup();vi.clearAllMocks();
 document.querySelectorAll('script[src*="libv86.js"],script[src*="xterm"],link[href*="xterm.css"]').forEach(node=>node.remove());
 vi.unstubAllGlobals();
});

describe("terminal do professor, histórico separado e descarte",()=>{
 it("exibe a auditoria em rota própria, com referência explícita ao professor e link oficial restrito",async()=>{
  render(<CtfReviewAudit canAccessOfficialCtf={true}/>);
  await screen.findByRole("button",{name:"Ver auditoria"});
  expect(screen.getByRole("heading",{name:"Histórico do terminal do professor"})).toBeTruthy();
  expect(screen.getByRole("link",{name:"Ir para CTF oficial"}).getAttribute("href")).toBe("#admin/ctf");
  fireEvent.click(screen.getByRole("button",{name:"Ver auditoria"}));
  expect(await screen.findByRole("heading",{name:/Demonstração de/})).toBeTruthy();
  expect(screen.getAllByText("pwd").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Terminal do professor/).length).toBeGreaterThan(0);
 });
 it("não oferece link administrativo de pontuação oficial a professores",async()=>{
  render(<CtfReviewAudit canAccessOfficialCtf={false}/>);
  await screen.findByRole("button",{name:"Ver auditoria"});
  expect(screen.queryByRole("link",{name:"Ir para CTF oficial"})).toBeNull();
 });
 it("descarta somente a demonstração autorizada após confirmação",async()=>{
  vi.stubGlobal("confirm",vi.fn(()=>true));
  render(<CtfReviewAudit canAccessOfficialCtf={false}/>);
  await screen.findByRole("button",{name:"Ver auditoria"});
  fireEvent.click(screen.getByRole("button",{name:"Descartar"}));
  await waitFor(()=>expect(vi.mocked(rpc)).toHaveBeenCalledWith("ctf_teacher_review_discard",{p_run:teacherId}));
  expect(vi.mocked(rpc).mock.calls.map(args=>args[0])).not.toContain("record_module_ctf");
 });
 it("remove os painéis redundantes do rodapé e fornece ações distintas ao iniciar",async()=>{
  render(<CtfReviewBrowser/>);
  expect(screen.queryByText("Histórico de demonstrações")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Iniciar demonstração"}));
  await screen.findByRole("button",{name:"Encerrar e salvar"});
  expect(screen.getByRole("button",{name:"Descartar sessão"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Ler instruções da VM"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Limpar tela"})).toBeNull();
 });
 it("carrega o emulador após renderizar a área do terminal mesmo com bibliotecas em cache",async()=>{
  const open=vi.fn();
  const onData=vi.fn(()=>({dispose:vi.fn()}));
  const vmAddListener=vi.fn();
  class FakeTerminal{
   options={fontSize:17};
   open=open;write=vi.fn();writeln=vi.fn();focus=vi.fn();clear=vi.fn();dispose=vi.fn();
   onData=onData;loadAddon=vi.fn();
  }
  class FakeV86{
   add_listener=vmAddListener;serial0_send=vi.fn();stop=vi.fn();destroy=vi.fn();
  }
  class FakeFit{fit=vi.fn();}
  class FakeResizeObserver{observe=vi.fn();disconnect=vi.fn();}
  vi.stubGlobal("ResizeObserver",FakeResizeObserver);
  Object.assign(window,{Terminal:FakeTerminal,V86:FakeV86,FitAddon:{FitAddon:FakeFit}});
  render(<CtfReviewBrowser/>);
  fireEvent.click(screen.getByRole("button",{name:"Iniciar demonstração"}));
  await waitFor(()=>expect(open).toHaveBeenCalled(),{timeout:3500});
  expect(vmAddListener).toHaveBeenCalledWith("serial0-output-byte",expect.any(Function));
  expect(screen.getAllByText(/Linux inicializando/).length).toBeGreaterThan(0);
  // This is a cached-asset/mount regression test, not a boot completion test.
  delete (window as unknown as Record<string,unknown>).Terminal;
  delete (window as unknown as Record<string,unknown>).V86;
  delete (window as unknown as Record<string,unknown>).FitAddon;
 });
});
