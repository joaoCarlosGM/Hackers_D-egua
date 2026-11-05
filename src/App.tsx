import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  configured,
  rpc,
  supabase,
  type Activity,
  type Class,
  type History,
  type Rank,
  type Team,
  type Participation,
} from "./api";
import { download } from "./utils";
import Admin from "./Admin";
import Quiz from "./Quiz";
import Brand, { brandAssets } from "./Brand";

export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1));
  const [classes, setClasses] = useState<Class[]>([]);
  const [error, setError] = useState("");
  const reloadClasses = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("classes")
      .select("id,name,slug,status")
      .order("name");
    if (error) throw new Error(error.message);
    setClasses(data ?? []);
  }, []);
  useEffect(() => {
    const refresh = () =>
      void reloadClasses().catch((e) => setError(e.message));
    const navigate = () => {
      setRoute(location.hash.slice(1));
      refresh();
    };
    addEventListener("hashchange", navigate);
    addEventListener("focus", refresh);
    refresh();
    return () => {
      removeEventListener("hashchange", navigate);
      removeEventListener("focus", refresh);
    };
  }, [reloadClasses]);
  return (
    <>
      <header>
        <Brand />
        <nav>
          <a href="#">Minha dupla</a>
          <a href="#ranking">Ranking CTF</a>
          <a href="#admin">Administração</a>
        </nav>
      </header>
      <main
        className={
          route === "ranking"
            ? "ranking-page"
            : route.startsWith("admin")
              ? "admin-page"
              : "student-page"
        }
      >
        {!configured ? (
          <section className="card">
            <h1>Conecte o Supabase</h1>
            <p>
              Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no
              ambiente de build e aplique as migrations conforme o README.
            </p>
          </section>
        ) : (
          <>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {route === "ranking" ? (
              <Leaderboard classes={classes} />
            ) : route.startsWith("admin") ? (
              <Admin
                classes={classes}
                onClassesChanged={reloadClasses}
                section={
                  route === "admin/atividades" ? "atividades"
                    : route === "admin/turmas" ? "turmas"
                    : route === "admin/duplas" ? "duplas"
                    : route === "admin/notas" ? "notas"
                    : route === "admin/chamada" ? "chamada"
                    : route === "admin/ctf" ? "ctf"
                    : route === "admin/usuarios" ? "usuarios"
                    : "overview"
                }
                resultsActivityId={
                  route.match(/^admin\/atividades\/([^/]+)\/resultados$/)?.[1]
                }
              />
            ) : (
              <TeamFlow
                key={route}
                classes={classes}
                sessionId={
                  route.startsWith("atividade/") ? route.slice(10) : undefined
                }
              />
            )}
          </>
        )}
      </main>
      <footer>
        <img src={brandAssets.mascot} alt="" width={1728} height={1975} />
        <p>
          Hackers Pai D’égua <span>· Aprender, criar e resolver juntos.</span>
        </p>
      </footer>
    </>
  );
}
function Leaderboard({ classes }: { classes: Class[] }) {
  const [rows, setRows] = useState<Rank[]>([]);
  const [filter, setFilter] = useState("");
  const [projector, setProjector] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase!
        .from("public_leaderboard")
        .select("team_id,class_id,public_name,points,solved_count")
        .order("points", { ascending: false })
        .order("solved_count", { ascending: false })
        .order("public_name");
      if (alive) {
        if (error) setError(error.message);
        else {
          setRows(data ?? []);
          setUpdatedAt(new Date());
          setError("");
        }
      }
    };
    void load();
    const channel = supabase!
      .channel("public-ranking")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_leaderboard" },
        () => void load(),
      )
      .subscribe((status) => {
        if (alive && status === "CHANNEL_ERROR")
          setError("Conexão em tempo real interrompida. Tentando reconectar.");
        if (status === "SUBSCRIBED") void load();
      });
    // Recover missed events when reconnecting or bringing a tab into focus.
    const refresh = () => void load();
    addEventListener("focus", refresh);
    return () => {
      alive = false;
      removeEventListener("focus", refresh);
      void supabase!.removeChannel(channel);
    };
  }, []);
  const visible = rows.filter((r) => !filter || r.class_id === filter);
  return (
    <section
      className={`ranking-board${projector ? " projector" : ""}`}
      aria-label="Ranking público CTF"
    >
      <img
        className="ranking-logo"
        src={brandAssets.mascot}
        alt="Mascote original Hackers Pai D’égua"
      />
      <h1>HACKERS PAI D’ÉGUA</h1>
      <p className="ranking-subtitle">
        RANKING OFICIAL DO CTF · Projeto de Extensão
      </p>
      <p className="muted updated-at">
        {updatedAt
          ? `Última atualização: ${updatedAt.toLocaleTimeString("pt-BR")}`
          : "Carregando ranking…"}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="ranking-controls">
        <label>
          Turma
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas as turmas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-pressed={projector}
          onClick={() => setProjector(!projector)}
        >
          Modo projetor
        </button>
      </div>
      <div className="podium">
        {visible.slice(0, 3).map((r, i) => (
          <article className={`card place-${i + 1}`} key={r.team_id}>
            <div className="medal">{["🥇", "🥈", "🥉"][i]}</div>
            <h2>{r.public_name}</h2>
            <strong>{r.points} pontos</strong>
          </article>
        ))}
      </div>
      {visible.length === 0 ? (
        <p>Nenhuma dupla cadastrada nesta turma.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" aria-label="Posição">
                  #
                </th>
                <th>Dupla</th>
                <th>Resolvidos</th>
                <th>Pontos</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.team_id}>
                  <td>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                  <td>
                    <span>{r.public_name}</span>
                    <small className="team-class visually-hidden">
                      {classes.find((c) => c.id === r.class_id)?.name}
                    </small>
                  </td>
                  <td>{r.solved_count}</td>
                  <td className="score">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Ranking público de desafios. As notas pedagógicas são privadas.
      </p>
    </section>
  );
}
function TeamFlow({
  classes,
  sessionId,
}: {
  classes: Class[];
  sessionId?: string;
}) {
  // Keep the bearer only in memory; a reboot can always be recovered with code + credential.
  const [team, setTeam] = useState<Team | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState<Participation | null>(null);
  const [result, setResult] = useState<{
    points: number;
    max_points: number;
    feedback: string;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (sessionId)
      void rpc<Activity>("public_activity", { p_session_id: sessionId })
        .then(setActivity)
        .catch((e) => setError(e.message));
  }, [sessionId]);
  async function refresh(t: Team) {
    setHistory(await rpc<History>("team_history", { p_token: t.token }));
  }
  async function identify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const t =
        mode === "login"
          ? await rpc<Team>("login_team", {
              p_access_code: f.get("code"),
              p_credential: f.get("credential"),
            })
          : await rpc<Team>("register_team", {
              p_class_id: f.get("class"),
              p_public_name: f.get("name"),
              p_member1: f.get("member1"),
              p_member2: f.get("member2"),
            });
      setTeam(t);
      setSaved(!t.credential);
      await refresh(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    if (!team || !sessionId) return;
    setBusy(true);
    setError("");
    try {
      const r = await rpc<Participation>("join_activity", {
        p_token: team.token,
        p_session_id: sessionId,
      });
      if (r.expired)
        throw new Error(
          "Participação expirada. Solicite uma nova tentativa ao professor.",
        );
      setAttempt(r);
      setSubmitted(Boolean(r.submitted));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("hpde:team");
      if (raw) {
        const cached = JSON.parse(raw) as Team;
        if (
          typeof cached.token === "string" &&
          typeof cached.team_id === "string"
        ) {
          setTeam(cached);
          setSaved(true);
          void refresh(cached).catch((e) => setError(e.message));
        }
      }
    } catch {
      /* Start a fresh login if browser storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    try {
      if (team && saved)
        sessionStorage.setItem(
          "hpde:team",
          JSON.stringify({ ...team, credential: undefined }),
        );
      else sessionStorage.removeItem("hpde:team");
    } catch {
      /* The in-memory session still works. */
    }
  }, [team, saved]);
  async function enterCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await rpc<{ session_id: string }>("resolve_assessment_code", {
        p_code: f.get("activity_code"),
      });
      location.hash = `atividade/${r.session_id}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="eyebrow">IDENTIDADE ÚNICA · TODAS AS ATIVIDADES</div>
      <h1>{activity?.title ?? "Sua dupla, uma só vez."}</h1>
      <p>
        {activity?.description ??
          "Cadastrem-se juntos e usem a mesma dupla durante todo o projeto."}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!sessionId && (
        <form className="card narrow" onSubmit={enterCode}>
          <h2>Entrar em uma atividade</h2>
          <label>
            Código da atividade
            <input
              name="activity_code"
              required
              minLength={8}
              maxLength={8}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button className="primary" disabled={busy}>
            Acessar atividade
          </button>
        </form>
      )}
      {!team ? (
        <section className="card narrow">
          <div className="tabs">
            <button
              aria-pressed={mode === "login"}
              onClick={() => setMode("login")}
            >
              Já tenho uma dupla
            </button>
            <button
              aria-pressed={mode === "register"}
              onClick={() => setMode("register")}
            >
              Cadastrar minha dupla
            </button>
          </div>
          <form onSubmit={identify}>
            {mode === "register" ? (
              <>
                <label>
                  Turma
                  <select required name="class" defaultValue="">
                    <option value="" disabled>
                      Selecione a turma
                    </option>
                    {classes
                      .filter(
                        (c) =>
                          c.status === "active" &&
                          (!activity || activity.class_ids.includes(c.id)),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Nome público da dupla
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Nome completo do participante 1
                  <input
                    name="member1"
                    required
                    minLength={3}
                    maxLength={160}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Nome completo do participante 2
                  <input
                    name="member2"
                    required
                    minLength={3}
                    maxLength={160}
                    autoComplete="off"
                  />
                </label>
                <p>
                  Os nomes completos ficam restritos à equipe pedagógica. O
                  apelido aparece no ranking público.
                </p>
              </>
            ) : (
              <>
                <label>
                  Código da dupla
                  <input
                    name="code"
                    required
                    minLength={16}
                    maxLength={16}
                    autoComplete="username"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Código privado de recuperação
                  <input
                    name="credential"
                    type="password"
                    required
                    minLength={48}
                    maxLength={48}
                    autoComplete="off"
                  />
                </label>
                <p>
                  Perdeu a credencial? Peça ao administrador uma nova. Sua dupla
                  e seu histórico serão preservados.
                </p>
              </>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Aguarde…"
                : mode === "login"
                  ? "Entrar com minha dupla"
                  : "Criar cadastro permanente"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>{team.public_name}</h2>
            <p>
              Código da dupla: <strong>{team.access_code}</strong> ·{" "}
              {classes.find((c) => c.id === team.class_id)?.name}
            </p>
            {team.credential && !saved && (
              <div className="credential">
                <h3>Guardem estas credenciais antes de continuar</h3>
                <p>
                  Em computadores Live Boot, os arquivos locais podem
                  desaparecer ao reiniciar. Anotem ou guardem em um local
                  privado durável.
                </p>
                <label>
                  Credencial privada (exibida apenas nesta sessão)
                  <input
                    readOnly
                    value={team.credential}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button
                  onClick={() =>
                    download(
                      "credenciais-da-dupla.txt",
                      `Hackers Pai D'égua\nDupla: ${team.public_name}\nCódigo: ${team.access_code}\nCredencial privada: ${team.credential}\nNão compartilhe publicamente. Guarde fora do Live Boot.`,
                    )
                  }
                >
                  Baixar credenciais
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={saved}
                    onChange={(e) => {
                      setSaved(e.target.checked);
                      if (e.target.checked)
                        setTeam({ ...team, credential: undefined });
                    }}
                  />
                  Guardei o código e a credencial em local seguro
                </label>
              </div>
            )}
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  await rpc("logout_team", { p_token: team.token });
                  setTeam(null);
                  setHistory(null);
                  if (attempt)
                    sessionStorage.removeItem(
                      `hpde:attempt:${attempt.attempt_id}`,
                    );
                  setAttempt(null);
                  setSubmitted(false);
                  setResult(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Sair da dupla
            </button>
          </section>
          {activity &&
            saved &&
            !submitted &&
            (!attempt ? (
              <button
                className="primary"
                onClick={() => void join()}
                disabled={busy}
              >
                Participar desta atividade
              </button>
            ) : (
              <Quiz
                key={attempt.attempt_id}
                activity={activity}
                team={team}
                participation={attempt}
                onComplete={async () => {
                  setSubmitted(true);
                  await refresh(team);
                }}
              />
            ))}
          {submitted && (
            <p role="status" className="success">
              Entrega registrada. Sua participação está vinculada à dupla
              original.
            </p>
          )}
          {submitted && attempt && (
            <section className="card">
              <button
                onClick={async () => {
                  setError("");
                  try {
                    setResult(
                      await rpc("team_result", {
                        p_token: team.token,
                        p_attempt_id: attempt.attempt_id,
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Consultar resultado liberado
              </button>
              {result && (
                <p>
                  Resultado liberado pelo professor: {result.points}/
                  {result.max_points} · {result.feedback}
                </p>
              )}
            </section>
          )}
          {result && !submitted && (
            <p className="success">
              Resultado liberado: {result.points}/{result.max_points} ·{" "}
              {result.feedback}
            </p>
          )}
          <section className="card">
            <h2>Histórico de participações</h2>
            {history?.attempts.length === 0 && (
              <p>
                Seu cadastro já está salvo. Acesse o link ou QR Code de uma
                atividade para participar.
              </p>
            )}
            {history?.attempts.map((a) => (
              <p key={a.id}>
                <a href={`#atividade/${a.activity_session_id}`}>{a.title}</a> ·
                tentativa {a.submission_no} ·{" "}
                {a.submitted_at ? "Entregue" : "Em andamento"}
                {a.submitted_at && (
                  <button
                    onClick={async () => {
                      setError("");
                      try {
                        setResult(
                          await rpc("team_result", {
                            p_token: team.token,
                            p_attempt_id: a.id,
                          }),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Consultar resultado desta entrega
                  </button>
                )}
              </p>
            ))}
          </section>
        </>
      )}
    </>
  );
}
