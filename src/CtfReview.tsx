import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { rpc, supabase, type Class, type Team } from "./api";
import "./ctf-review.css";

type Challenge = { id: number; title: string; description: string };
type Review = {
  id: string; title: string; description: string; duration_seconds?: number; duration?: number;
  status?: string; state?: string; started_at?: string | null; startedAt?: string | null;
  deadline_at?: string | null; deadline?: string | null; paused_at?: string | null; pausedAt?: string | null;
  class_ids?: string[]; challenges: Challenge[];
};
type Writeup = { command: string; reason: string; evidence: string; savedAt?: string; saved_at?: string };
type LabSession = {
  id: string; team: string; ctf: Review; solved: number[]; writeups: Record<string, Writeup>;
  joinedAt?: string; createdAt?: string; completedAt?: string | null; count?: number;
};
type ManagedSession = {
  id: string; review_id: string; team_name: string; solved_ids: number[];
  started_at: string; completed_at: string | null; updated_at: string;
  writeups: Record<string, Writeup>;
};
type AuditEvent = { at: string; type: string; base64?: string; challenge?: number; result?: string; [key: string]: unknown };
type AuditReport = { session: LabSession; events: AuditEvent[]; truncated?: boolean };
type TerminalLike = {
  open(element: HTMLElement): void; write(text: string | Uint8Array): void;
  clear(): void; focus(): void; dispose(): void;
  loadAddon(addon: unknown): void;
  onData(handler: (data: string) => void): { dispose(): void };
};
type FitAddonLike = { fit(): void };
type XtermGlobals = Window & {
  Terminal?: (new (opts: Record<string, unknown>) => TerminalLike) | { Terminal: new (opts: Record<string, unknown>) => TerminalLike };
  FitAddon?: { FitAddon: new () => FitAddonLike } | (new () => FitAddonLike);
};

const templates: Challenge[] = [
  { id: 1, title: "Navegação e Arquivos Ocultos", description: "Explore /var/tmp/, arquivos e diretórios ocultos." },
  { id: 2, title: "Permissões e Grupos Restritos", description: "Corrija a permissão de leitura do grupo investigadores." },
  { id: 3, title: "Mineração de Logs de Força Bruta", description: "Analise auth.log e identifique o IP com mais falhas." },
  { id: 4, title: "A Mensagem Secreta no DNS", description: "Consulte o registro TXT de ctf.hackerspaidegua.local." },
];
const route = (path: string) => "/ctf-lab" + path;
const secondsRemaining = (review: Review) => {
  const until = review.deadline ?? review.deadline_at;
  const paused = review.pausedAt ?? review.paused_at;
  if (!until) return review.duration ?? review.duration_seconds ?? 3600;
  const target = Date.parse(until);
  return Math.max(0, Math.floor((target - (paused ? Date.parse(paused) : Date.now())) / 1000));
};
function asClock(secs: number): string {
  return [Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60].map(n => String(n).padStart(2, "0")).join(":");
}
async function request<T>(pathname: string, auth: string, payload?: object, method = payload ? "POST" : "GET"): Promise<T> {
  const response = await fetch(route(pathname), {
    method, cache: "no-store",
    headers: { ...(auth ? { Authorization: "Bearer " + auth } : {}), ...(payload ? { "Content-Type": "application/json" } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  let body: { error?: string } & Record<string, unknown>;
  try { body = await response.json(); } catch { throw Error("Executor Linux indisponível. Execute bash ctf-lab/start-local.sh no WSL2."); }
  if (!response.ok) throw Error(String(body.error || "Operação recusada pelo executor"));
  return body as T;
}
async function teacherToken(): Promise<string> {
  if (!supabase) throw Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw Error("Acesso do professor expirado; entre novamente.");
  return data.session.access_token;
}
function makeScript(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const previous = document.getElementById(id) as HTMLScriptElement | null;
    if (previous?.dataset.ready === "yes") return resolve();
    if (previous) { previous.addEventListener("load", () => resolve(), { once: true }); previous.addEventListener("error", () => reject(Error("Falha ao carregar xterm.js")), { once: true }); return; }
    const script = document.createElement("script");
    script.id = id; script.src = route(src); script.async = true;
    script.onload = () => { script.dataset.ready = "yes"; resolve(); };
    script.onerror = () => reject(Error("xterm.js não disponível no executor local"));
    document.head.append(script);
  });
}
let xtermLoading: Promise<void> | undefined;
function ensureXterm(): Promise<void> {
  if (!xtermLoading) {
    xtermLoading = (async () => {
      if (!document.getElementById("ctf-xterm-css")) {
        const style = document.createElement("link");
        style.id = "ctf-xterm-css"; style.rel = "stylesheet"; style.href = route("/vendor/xterm.css");
        document.head.append(style);
      }
      await makeScript("ctf-xterm-js", "/vendor/xterm.js");
      await makeScript("ctf-xterm-fit-js", "/vendor/xterm-fit.js");
    })().catch(e => { xtermLoading = undefined; throw e; });
  }
  return xtermLoading;
}
function createTerminal(container: HTMLElement, size: number) {
  const w = window as XtermGlobals;
  const T = typeof w.Terminal === "function" ? w.Terminal : w.Terminal?.Terminal;
  const F = typeof w.FitAddon === "function" ? w.FitAddon : w.FitAddon?.FitAddon;
  if (!T) throw Error("xterm.js não carregado");
  const terminal = new T({
    cursorBlink: true, convertEol: true, fontSize: size,
    theme: { background: "#10151f", foreground: "#e0f6e9", cursor: "#ee66a6" },
    scrollback: 8000,
  });
  terminal.open(container);
  let fit: FitAddonLike | null = null;
  if (F) { fit = new F(); terminal.loadAddon(fit); fit.fit(); }
  return { terminal, fit };
}
export function CtfReviewTerminal({ labToken, onError }: { labToken: string; onError: (v: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("Conectando…");
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let terminal: TerminalLike | undefined;
    let resize: ResizeObserver | undefined;
    let cleanupInput: { dispose(): void } | undefined;
    (async () => {
      await ensureXterm();
      if (!container.current || disposed) return;
      const created = createTerminal(container.current, 14);
      terminal = created.terminal;
      resize = new ResizeObserver(() => created.fit?.fit());
      resize.observe(container.current);
      terminal.write("Hackers Pai D'Égua — terminal Linux real, revisão sem pontuação\r\n");
      const { ticket } = await request<{ ticket: string }>("/api/ticket", labToken, {});
      if (disposed) return;
      const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + route("/ws");
      socket = new WebSocket(wsUrl, ["ctf-v1", "ticket." + ticket]);
      socket.binaryType = "arraybuffer";
      socket.onopen = () => { if (disposed) return; setState("Online"); terminal?.focus(); };
      socket.onmessage = e => { if (!disposed && terminal) terminal.write(new Uint8Array(e.data as ArrayBuffer)); };
      socket.onclose = () => { if (!disposed) setState("Desconectado"); };
      socket.onerror = () => { if (!disposed) onError("Falha de conexão com o terminal Linux."); };
      cleanupInput = terminal.onData(data => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(data);
      });
    })().catch(e => { if (!disposed) { setState("Erro"); onError((e as Error).message); } });
    return () => {
      disposed = true; cleanupInput?.dispose(); resize?.disconnect(); socket?.close(); terminal?.dispose();
    };
  }, [labToken, onError]);
  return <div className="ctf-terminal-shell">
    <div className="ctf-terminal-bar"><span>aluno@hackers-ctf:~$</span><span>{state}</span></div>
    <div ref={container} className="ctf-terminal" aria-label="Terminal Linux interativo" />
  </div>;
}
function downloadFile(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function LabWorkshop({ token, onExit }: { token: string; onExit?: () => void }) {
  const [session, setSession] = useState<LabSession | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [challenge, setChallenge] = useState(1);
  const [flagInput, setFlagInput] = useState("");
  const [drafts, setDrafts] = useState<Record<number, Writeup>>({});
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [terminalKey, setTerminalKey] = useState(0);
  const onError = useCallback((v: string) => setError(v), []);
  const refresh = useCallback(async () => {
    const { session: next } = await request<{ session: LabSession }>("/api/me", token);
    setSession(next);
  }, [token]);
  useEffect(() => {
    void refresh().catch(e => setError((e as Error).message));
    const poll = setInterval(() => void refresh().catch(() => {}), 9000);
    return () => clearInterval(poll);
  }, [refresh]);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);
  const current = drafts[challenge] ?? session?.writeups[challenge] ?? { command: "", reason: "", evidence: "" };
  async function saveWriteup(draft: Writeup, id = challenge) {
    if (!session) return;
    await request("/api/writeup", token, { challenge: id, command: draft.command, reason: draft.reason, evidence: draft.evidence });
    await refresh();
  }
  useEffect(() => {
    if (!drafts[challenge]) return;
    const t = setTimeout(() => {
      void saveWriteup(drafts[challenge], challenge).catch(e => setError((e as Error).message));
    }, 1800);
    return () => clearTimeout(t);
    // The edit draft is the source of truth; do not re-run on polling.
  }, [drafts, challenge]);
  async function submitFlag() {
    setBusy(true); setError("");
    try {
      const result = await request<{ accepted: boolean }>("/api/flag", token, { challenge, flag: flagInput.trim() });
      setMessage(result.accepted ? "Flag confirmada. Nenhuma pontuação foi atribuída." : "Flag incorreta; revise a investigação.");
      setFlagInput(""); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function exportMarkdown() {
    if (!session) return;
    const text = ["# Write-up — " + session.team, "", "Revisão Pré-CTF (não avaliativa)", "", ...session.ctf.challenges.flatMap(ch => {
      const w = drafts[ch.id] ?? session.writeups[ch.id] ?? { command: "", reason: "", evidence: "" };
      return ["## " + ch.id + " — " + ch.title, "", "**Comando utilizado:**", w.command || "Pendente", "",
        "**Raciocínio técnico:**", w.reason || "Pendente", "", "**Evidências:**", w.evidence || "Pendente", ""];
    })].join("\n");
    downloadFile("writeup_dupla.md", text, "text/markdown;charset=utf-8");
  }
  if (!session) return <section className="card"><p>Preparando sessão Linux…</p>{error && <p role="alert">{error}</p>}</section>;
  const status = session.ctf.state ?? session.ctf.status;
  return <div className="ctf-review">
    <div className="ctf-topline"><span className="ctf-label">REVISÃO DEMONSTRATIVA · SEM NOTAS OU PONTOS</span>{onExit && <button type="button" onClick={onExit}>Voltar</button>}</div>
    <h2>{session.ctf.title}</h2>
    <p>Equipe: <strong>{session.team}</strong> · Acompanhamento: {session.solved.length}/4 desafios</p>
    <div className="ctf-stats">
      <div><small>Progresso</small><strong>{session.solved.length}/4</strong></div>
      <div><small>Tempo restante</small><strong className={secondsRemaining(session.ctf) < 600 ? "ctf-low-time" : ""}>{asClock(secondsRemaining(session.ctf) + clock * 0)}</strong></div>
      <div><small>Sessão</small><strong>{status === "running" ? "Em andamento" : status === "paused" ? "Pausada" : "Encerrada"}</strong></div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="ctf-note" role="status">{message}</p>}
    {status === "running" ? <><CtfReviewTerminal key={terminalKey} labToken={token} onError={onError} />
      <button type="button" onClick={() => setTerminalKey(v => v + 1)}>Reconectar terminal</button></> :
      <div className="card">Execução indisponível: a revisão está pausada ou encerrada. O relatório permanece disponível ao professor.</div>}
    <section className="card">
      <h3>Objetivos da revisão</h3>
      <div className="ctf-challenge-tabs">
        {session.ctf.challenges.map(ch => <button key={ch.id} type="button" aria-pressed={challenge === ch.id}
          onClick={() => { setChallenge(ch.id); setFlagInput(""); }}>
          {session.solved.includes(ch.id) ? "✓ " : ""}{ch.id}. {ch.title}
        </button>)}
      </div>
      <p>{session.ctf.challenges.find(x => x.id === challenge)?.description}</p>
      <div className="ctf-inline">
        <label>Flag encontrada<input spellCheck={false} autoComplete="off" value={flagInput}
          onChange={e => setFlagInput(e.target.value)} placeholder="FLAG{...}" /></label>
        <button type="button" disabled={busy || status !== "running" || !flagInput.trim()} onClick={() => void submitFlag()}>Validar flag</button>
      </div>
    </section>
    <section className="card">
      <h3>Write-up — desafio {challenge}</h3>
      <p>Explique o comando, o raciocínio técnico e a evidência obtida. Salvo automaticamente, sem nota.</p>
      <label>Comando utilizado<textarea value={current.command} onChange={e => setDrafts(v => ({ ...v, [challenge]: { ...current, command: e.target.value } }))} /></label>
      <label>Raciocínio técnico<textarea value={current.reason} onChange={e => setDrafts(v => ({ ...v, [challenge]: { ...current, reason: e.target.value } }))} /></label>
      <label>Evidências / resultado do terminal<textarea value={current.evidence} onChange={e => setDrafts(v => ({ ...v, [challenge]: { ...current, evidence: e.target.value } }))} /></label>
      <div className="ctf-inline">
        <button type="button" disabled={busy || status !== "running"} onClick={() => void saveWriteup(current).then(() => setMessage("Write-up salvo")).catch(e => setError((e as Error).message))}>Salvar agora</button>
        <button type="button" onClick={exportMarkdown}>Exportar writeup_dupla.md</button>
      </div>
    </section>
  </div>;
}

export function CtfReviewStudent() {
  const [team, setTeam] = useState<Team | null>(() => {
    try {
      const candidate = JSON.parse(sessionStorage.getItem("hpde:team") || "null") as Team | null;
      return candidate?.token ? candidate : null;
    } catch { return null; }
  });
  const [error, setError] = useState("");
  const [ctfs, setCtfs] = useState<Review[]>([]);
  const [labToken, setLabToken] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (token: string) => {
    const items = await rpc<Review[]>("ctf_review_visible", { p_team_token: token });
    setCtfs(items);
  }, []);
  useEffect(() => {
    if (team) void load(team.token).catch(e => setError((e as Error).message));
  }, [team, load]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const f = new FormData(e.currentTarget);
      const result = await rpc<Team>("login_team", { p_access_code: f.get("code"), p_credential: f.get("credential") });
      sessionStorage.setItem("hpde:team", JSON.stringify({ ...result, credential: undefined }));
      setTeam(result);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function join(id: string) {
    if (!team) return;
    setBusy(true); setError("");
    try {
      const { token } = await request<{ token: string }>("/api/platform/team/join", "", { review_id: id, team_token: team.token });
      setLabToken(token);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (!import.meta.env.DEV) return <section className="card"><h1>Revisão Pré-CTF</h1><p>A execução Linux está disponível somente no ambiente de teste local.</p></section>;
  if (labToken) return <LabWorkshop token={labToken} onExit={() => { setLabToken(""); if (team) void load(team.token); }} />;
  return <section className="ctf-review">
    <h1>Revisão Pré-CTF</h1>
    <p className="ctf-label">Laboratório Linux real · 4 desafios · sem pontuação</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!team ? <form className="card narrow" onSubmit={e => void login(e)}>
      <h2>Entrar com as credenciais da dupla</h2>
      <label>Código da dupla<input required name="code" autoComplete="username" /></label>
      <label>Credencial privada<input required name="credential" type="password" autoComplete="current-password" /></label>
      <button className="primary" disabled={busy}>Entrar</button>
    </form> : <>
      <div className="card"><strong>{team.public_name}</strong><p>Seu cadastro e suas credenciais são os mesmos da plataforma de aulas.</p>
        <button type="button" onClick={() => void load(team.token).catch(e => setError((e as Error).message))}>Atualizar revisões</button>
      </div>
      {ctfs.length === 0 && <p>Nenhuma revisão foi liberada para sua turma.</p>}
      {ctfs.map(c => <article className="card" key={c.id}>
        <h2>{c.title}</h2><p>{c.description}</p><p>{c.challenges.length} desafios · {c.duration_seconds ? c.duration_seconds/60 : 60} minutos · {c.status}</p>
        <button disabled={busy || c.status !== "running"} onClick={() => void join(c.id)}>Abrir laboratório</button>
      </article>)}
    </>}
  </section>;
}
function Replay({ report }: { report: AuditReport }) {
  const container = useRef<HTMLDivElement>(null);
  const term = useRef<TerminalLike | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void ensureXterm().then(() => {
      if (cancelled || !container.current) return;
      term.current = createTerminal(container.current, 12).terminal;
    }).catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; term.current?.dispose(); term.current = null; };
  }, [report]);
  useEffect(() => {
    if (!term.current) return;
    term.current.clear();
    for (const event of report.events.slice(0, cursor)) {
      if (event.type !== "terminal_output" || typeof event.base64 !== "string") continue;
      try { term.current.write(Uint8Array.from(atob(event.base64), c => c.charCodeAt(0))); } catch { /* Evento corrompido é ignorado */ }
    }
  }, [cursor, report]);
  useEffect(() => {
    if (!playing || cursor >= report.events.length) return;
    const current = report.events[cursor], next = report.events[cursor + 1];
    const delta = next ? Math.max(10, Math.min(500, Date.parse(next.at)-Date.parse(current.at))) : 60;
    timer.current = setTimeout(() => setCursor(i => i + 1), delta);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [cursor, playing, report]);
  return <div className="ctf-review">
    <h3>Auditoria de {report.session.team}</h3>
    <p>{report.session.solved.length}/4 desafios concluídos · {report.events.length} eventos registrados.</p>
    {report.truncated && <p role="alert">Relatório limitado: existem mais eventos do que os exibidos.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="ctf-terminal-shell"><div ref={container} className="ctf-terminal ctf-replay" /></div>
    <div className="ctf-inline">
      <button onClick={() => setPlaying(true)}>Reproduzir</button>
      <button onClick={() => setPlaying(false)}>Pausar</button>
      <button onClick={() => { setPlaying(false); setCursor(i => Math.min(report.events.length,i+1)); }}>Próximo evento</button>
      <button onClick={() => { setPlaying(false); setCursor(0); }}>Reiniciar</button>
      <span>Evento {cursor}/{report.events.length}</span>
    </div>
    <label>Filtrar eventos
      <select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="">Todos</option>
        <option value="flag_submission">Submissões de flag</option>
        <option value="solved">Desafios concluídos</option>
        <option value="terminal_error">Erros de terminal</option>
        <option value="writeup_saved">Write-ups</option>
      </select>
    </label>
    <div className="ctf-events">
      {report.events.filter(e => !filter || e.type===filter).slice(-250).map((e,i) =>
        <div key={i}><time>{new Date(e.at).toLocaleString("pt-BR")}</time> {e.type}{e.challenge ? " · Desafio "+e.challenge : ""}{e.result ? " · "+e.result : ""}</div>)}
    </div>
    <h3>Write-ups</h3>
    {report.session.ctf.challenges.map(ch => {
      const w = report.session.writeups[ch.id];
      return <article key={ch.id} className="card"><strong>{ch.id}. {ch.title}</strong>
        <p><b>Comando:</b> {w?.command || "Não enviado"}</p>
        <p><b>Raciocínio:</b> {w?.reason || "Não enviado"}</p>
        <p><b>Evidência:</b> {w?.evidence || "Não enviada"}</p></article>;
    })}
    <button type="button" onClick={() => downloadFile("auditoria-revisao.json",JSON.stringify(report,null,2),"application/json")}>Exportar relatório JSON</button>
  </div>;
}
export function CtfReviewAdmin({ classes }: { classes: Class[] }) {
  const [catalog, setCatalog] = useState<Review[]>([]);
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("Revisão Pré-CTF — Fundamentos");
  const [description, setDescription] = useState("Demonstração guiada pelo professor, sem qualquer pontuação.");
  const [duration, setDuration] = useState(60);
  const [classIds, setClassIds] = useState<string[]>(classes.filter(c => c.status==="active").map(c=>c.id));
  const [instructions, setInstructions] = useState(templates.map(t=>t.description));
  const [demoToken, setDemoToken] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const staffRequest = useCallback(async <T,>(path: string,payload?:object):Promise<T> =>
    request<T>(path,await teacherToken(),payload),[]);
  const load = useCallback(async () => {
    const data=await staffRequest<{ctfs:Review[];sessions:ManagedSession[]}>("/api/platform/staff/state");
    setCatalog(data.ctfs);setSessions(data.sessions);
  },[staffRequest]);
  useEffect(()=>{
    void load().catch(e=>setError((e as Error).message));
    const interval=setInterval(()=>void load().catch(()=>{}),5500);
    return()=>clearInterval(interval);
  },[load]);
  async function action(id:string,verb:string){
    setBusy(true);setError("");
    try{
      await staffRequest("/api/platform/staff/reviews/"+id+"/"+verb,verb==="extend"?{seconds:300}:{});
      setMessage("Revisão atualizada: "+verb+".");await load();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError("");
    try{
      await staffRequest("/api/platform/staff/create",{title,description,class_ids:classIds,duration_seconds:duration*60,instructions});
      setMessage("Revisão salva em rascunho. Nenhuma pontuação criada.");await load();
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function demo(id:string){
    setBusy(true);setError("");
    try{
      const result=await staffRequest<{token:string}>("/api/platform/staff/demo",{review_id:id});
      setDemoToken(result.token);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function inspect(id:string){
    setBusy(true);setError("");
    try{setReport(await staffRequest<AuditReport>("/api/platform/staff/report/"+id));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  if(!import.meta.env.DEV) return <section className="card"><p>Revisões Linux disponíveis no ambiente de desenvolvimento local.</p></section>;
  if(demoToken) return <LabWorkshop token={demoToken} onExit={()=>setDemoToken("")}/>;
  return <section className="ctf-review">
    <p className="ctf-label">REVISÃO PRÉ-CTF · AMBIENTE DE TREINAMENTO · SEM NOTAS, PONTOS OU RANKING</p>
    <p>Cadastre e publique revisões diretamente na plataforma. Os quatro laboratórios são templates Linux aprovados, preservando seus caminhos e nomes originais.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="ctf-note">{message}</p>}
    <form className="card" onSubmit={e=>void create(e)}>
      <h2>Cadastrar uma revisão</h2>
      <label>Título<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>Descrição<textarea value={description} maxLength={5000} onChange={e=>setDescription(e.target.value)}/></label>
      <label>Duração (minutos)<input type="number" min={5} max={120} required value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>
      <div className="ctf-grid">
        <div><h3>Turmas participantes</h3>{classes.filter(c=>c.status==="active").map(c=>
          <label className="ctf-check" key={c.id}><input type="checkbox" checked={classIds.includes(c.id)}
            onChange={e=>setClassIds(v=>e.target.checked?[...v,c.id]:v.filter(x=>x!==c.id))}/>{c.name}</label>)}</div>
        <div><h3>Os quatro desafios</h3>{templates.map((t,i)=>
          <label key={t.id}>{t.id}. {t.title}<textarea maxLength={800} value={instructions[i]}
            onChange={e=>setInstructions(v=>v.map((x,j)=>j===i?e.target.value:x))}/></label>)}</div>
      </div>
      <button className="primary" disabled={busy||classIds.length===0}>Salvar rascunho de revisão</button>
    </form>
    <div className="card">
      <h2>Revisões cadastradas</h2>
      {catalog.length===0&&<p>Nenhuma revisão cadastrada.</p>}
      {catalog.map(c=><article className="ctf-entry" key={c.id}>
        <h3>{c.title}</h3><p>{c.description}</p>
        <p>{c.challenges.length} desafios · {(c.duration_seconds||3600)/60} minutos · Estado: <strong>{c.status}</strong></p>
        <div className="ctf-inline">
          {c.status==="draft"&&<button disabled={busy} onClick={()=>void action(c.id,"publish")}>Publicar</button>}
          {c.status==="published"&&<button disabled={busy} onClick={()=>void action(c.id,"start")}>Iniciar revisão</button>}
          {c.status==="running"&&<><button disabled={busy} onClick={()=>void demo(c.id)}>Abrir demonstração do professor</button>
            <button disabled={busy} onClick={()=>void action(c.id,"pause")}>Pausar</button></>}
          {c.status==="paused"&&<button disabled={busy} onClick={()=>void action(c.id,"resume")}>Retomar</button>}
          {["running","paused"].includes(c.status||"")&&<button disabled={busy} onClick={()=>void action(c.id,"extend")}>+5 minutos</button>}
          {["published","running","paused"].includes(c.status||"")&&
            <button disabled={busy} onClick={()=>{if(confirm("Encerrar a revisão e os laboratórios?"))void action(c.id,"close");}}>Encerrar</button>}
        </div>
      </article>)}
    </div>
    <div className="card">
      <div className="ctf-topline"><h2>Acompanhamento das duplas</h2><button onClick={()=>void load().catch(e=>setError((e as Error).message))}>Atualizar</button></div>
      {sessions.length===0&&<p>Sem sessões registradas.</p>}
      <div className="ctf-grid">{sessions.map(s=>{
        const idleMinutes=Math.max(0,Math.floor((Date.now()-Date.parse(s.updated_at))/60000));
        const status=s.solved_ids.length===4?"Concluída":idleMinutes<2?"Ativa":"Ociosa há "+idleMinutes+" min";
        return <article key={s.id} className="ctf-entry">
          <h3>{s.team_name}</h3>
          <p><strong>{status}</strong> · Progresso: {s.solved_ids.length}/4 desafios · Write-ups: {Object.keys(s.writeups||{}).length}/4</p>
          <p>Última atividade: {new Date(s.updated_at).toLocaleString("pt-BR")}</p>
          <button disabled={busy} onClick={()=>void inspect(s.id)}>Abrir auditoria e playback</button>
        </article>;
      })}</div>
    </div>
    {report&&<div className="card"><button onClick={()=>setReport(null)}>Fechar auditoria</button><Replay key={report.session.id} report={report}/></div>}
  </section>;
}
