import { useEffect, useState, type FormEvent } from "react";
import {
  configured,
  rpc,
  supabase,
  type Activity,
  type Class,
  type History,
  type Rank,
  type Team,
} from "./api";
import { download } from "./utils";
import Admin from "./Admin";
import logo from "./assets/logo-oficial.png";

export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1));
  const [classes, setClasses] = useState<Class[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const navigate = () => setRoute(location.hash.slice(1));
    addEventListener("hashchange", navigate);
    if (supabase)
      void supabase
        .from("classes")
        .select("id,name,slug")
        .order("name")
        .then(({ data, error }) => {
          if (error) setError(error.message);
          else setClasses(data ?? []);
        });
    return () => removeEventListener("hashchange", navigate);
  }, []);
  return (
    <>
      <header>
        <a className="brand" href="#">
          HACKERS <span>PAI D’ÉGUA</span>
        </a>
        <nav>
          <a href="#">Minha dupla</a>
          <a href="#ranking">Ranking CTF</a>
          <a href="#admin">Administração</a>
        </nav>
      </header>
      <main>
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
            ) : route === "admin" ? (
              <Admin classes={classes} />
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
      <footer>Hackers Pai D’égua · Aprender, criar e resolver juntos.</footer>
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
        src={logo}
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
      <div className="ranking-controls">
        <button
          aria-pressed={projector}
          onClick={() => setProjector(!projector)}
        >
          Modo projetor
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
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
      <div className="podium">
        {visible.slice(0, 3).map((r, i) => (
          <article className={`card place-${i + 1}`} key={r.team_id}>
            <div className="medal">{["🥇", "🥈", "🥉"][i]}</div>
            <h2>{r.public_name}</h2>
            <strong>{r.points} pontos</strong>
            <p>{r.solved_count} desafios resolvidos</p>
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
                <th>Posição</th>
                <th>Dupla</th>
                <th>Turma</th>
                <th>Resolvidos</th>
                <th>Pontos</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.team_id}>
                  <td>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                  <td>{r.public_name}</td>
                  <td>{classes.find((c) => c.id === r.class_id)?.name}</td>
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
  const [attempt, setAttempt] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
      const r = await rpc<{ attempt_id: string }>("join_activity", {
        p_token: team.token,
        p_session_id: sessionId,
      });
      setAttempt(r.attempt_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!team || !activity) return;
    setBusy(true);
    setError("");
    try {
      await rpc("submit_attempt", {
        p_token: team.token,
        p_attempt_id: attempt,
        p_answers: activity.questions.map((q) => ({
          question_id: q.id,
          option_id: answers[q.id],
        })),
      });
      setSubmitted(true);
      await refresh(team);
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
                        (c) => !activity || activity.class_ids.includes(c.id),
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
                  Credencial privada
                  <input
                    name="credential"
                    type="password"
                    required
                    minLength={48}
                    maxLength={48}
                    autoComplete="current-password"
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
                  setAttempt("");
                  setSubmitted(false);
                  setAnswers({});
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
              <form className="card" onSubmit={submit}>
                {activity.questions.map((q, i) => (
                  <fieldset key={q.id}>
                    <legend>
                      {i + 1}. {q.prompt} <small>({q.points} pontos)</small>
                    </legend>
                    {q.options.map((o) => (
                      <label className="check" key={o.id}>
                        <input
                          type="radio"
                          name={q.id}
                          required
                          value={o.id}
                          checked={answers[q.id] === o.id}
                          onChange={() =>
                            setAnswers({ ...answers, [q.id]: o.id })
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <p>
                  A entrega é definitiva. Apenas a administração pode autorizar
                  outra tentativa.
                </p>
                <button className="primary" disabled={busy}>
                  Enviar respostas
                </button>
              </form>
            ))}
          {submitted && (
            <p role="status" className="success">
              Entrega registrada. Sua participação está vinculada à dupla
              original.
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
              </p>
            ))}
          </section>
        </>
      )}
    </>
  );
}
