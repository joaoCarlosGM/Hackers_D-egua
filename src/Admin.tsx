import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { rpc, supabase, type Class } from "./api";
import {
  activityLink,
  csv,
  download,
  newQuestion,
  type DraftQuestion,
} from "./utils";

type Act = {
  id: string;
  title: string;
  description: string;
  locked_at: string | null;
};
type Session = {
  id: string;
  activity_id: string;
  class_ids: string[];
  published: boolean;
  ctf_enabled: boolean;
  closes_at: string | null;
};
type Attempt = {
  id: string;
  team_id: string;
  activity_session_id: string;
  submission_no: number;
  submitted_at: string | null;
  retry_available: boolean;
};
type Grade = {
  attempt_id: string;
  points: number;
  max_points: number;
  feedback: string;
};
type AdminTeam = {
  id: string;
  public_name: string;
  class_id: string;
  access_code: string;
};
type Member = { team_id: string; position: number; full_name: string };
type Q = {
  id: string;
  activity_id: string;
  prompt: string;
  kind: DraftQuestion["kind"];
  points: number;
  position: number;
};
type Option = {
  id: string;
  question_id: string;
  label: string;
  is_correct: boolean;
  position: number;
};
type Answer = { attempt_id: string; question_id: string; option_id: string };
type Data = {
  activities: Act[];
  sessions: Session[];
  attempts: Attempt[];
  grades: Grade[];
  teams: AdminTeam[];
  members: Member[];
  questions: Q[];
  options: Option[];
  answers: Answer[];
};
const empty: Data = {
  activities: [],
  sessions: [],
  attempts: [],
  grades: [],
  teams: [],
  members: [],
  questions: [],
  options: [],
  answers: [],
};
async function rows<T>(table: string, columns = "*"): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase!
      .from(table)
      .select(columns)
      .order("id")
      .range(start, start + 499);
    if (error) throw new Error(error.message);
    result.push(...(data as unknown as T[]));
    if (data.length < 500) return result;
  }
}
export default function Admin({ classes }: { classes: Class[] }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Data>(empty);
  const [editing, setEditing] = useState<Act | null>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion()]);
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [credential, setCredential] = useState<{
    access_code: string;
    credential: string;
  } | null>(null);
  const load = useCallback(async () => {
    const [
      activities,
      sessions,
      attempts,
      grades,
      teams,
      members,
      questions,
      options,
      answers,
    ] = await Promise.all([
      rows<Act>("activities"),
      rows<Session>("activity_sessions"),
      rows<Attempt>("attempts"),
      rows<Grade>("grades"),
      rows<AdminTeam>("teams", "id,public_name,class_id,access_code"),
      rows<Member>("team_members"),
      rows<Q>("questions"),
      rows<Option>("question_options"),
      rows<Answer>("answers"),
    ]);
    setData({
      activities,
      sessions,
      attempts,
      grades,
      teams,
      members,
      questions,
      options,
      answers,
    });
  }, []);
  useEffect(() => {
    let alive = true;
    const check = async (id?: string) => {
      if (!alive) return;
      setChecking(true);
      setIdentity(id ?? null);
      setRole("");
      setData(empty);
      setCredential(null);
      setQr(null);
      try {
        if (id) {
          const { data, error } = await supabase!
            .from("admin_users")
            .select("role")
            .eq("user_id", id)
            .maybeSingle();
          if (error) throw error;
          if (alive) setRole(data?.role ?? "");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setChecking(false);
      }
    };
    void supabase!.auth
      .getSession()
      .then(({ data }) => check(data.session?.user.id));
    const { data: listener } = supabase!.auth.onAuthStateChange(
      (_event, session) => {
        // Defer Supabase queries outside the Auth callback lock.
        setTimeout(() => {
          void check(session?.user.id);
        }, 0);
      },
    );
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (role) void load().catch((e) => setError(e.message));
  }, [role, load]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      const { error } = await supabase!.auth.signInWithPassword({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      if (error) throw error;
    });
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await action(async () => {
      await rpc("save_activity", {
        p_title: f.get("title"),
        p_description: f.get("description"),
        p_class_ids: f.getAll("class"),
        p_questions: questions,
        p_ctf: f.get("ctf") === "on",
        p_activity_id: editing?.id ?? null,
      });
      setNotice(
        "Atividade salva como rascunho. Publique para disponibilizar o link.",
      );
      setEditing(null);
      setQuestions([newQuestion()]);
      form.reset();
      await load();
    });
  }
  function edit(a: Act, s: Session) {
    setEditing(a);
    setQuestions(
      data.questions
        .filter((q) => q.activity_id === a.id)
        .sort((a, b) => a.position - b.position)
        .map((q) => ({
          prompt: q.prompt,
          kind: q.kind,
          points: q.points,
          options: data.options
            .filter((o) => o.question_id === q.id)
            .sort((a, b) => a.position - b.position)
            .map((o) => ({ label: o.label, is_correct: o.is_correct })),
        })),
    );
    setNotice(
      `Editando ${a.title}. Turmas: ${classes
        .filter((c) => s.class_ids.includes(c.id))
        .map((c) => c.name)
        .join(", ")}.`,
    );
  }
  function changeQuestion(i: number, next: DraftQuestion) {
    setQuestions(questions.map((q, j) => (i === j ? next : q)));
  }
  function exportGrades() {
    const records = data.attempts.map((a) => {
      const t = data.teams.find((t) => t.id === a.team_id);
      const g = data.grades.find((g) => g.attempt_id === a.id);
      const s = data.sessions.find((s) => s.id === a.activity_session_id);
      return [
        a.id,
        t?.id,
        t?.public_name,
        classes.find((c) => c.id === t?.class_id)?.name,
        ...[1, 2].map(
          (p) =>
            data.members.find((m) => m.team_id === t?.id && m.position === p)
              ?.full_name,
        ),
        data.activities.find((act) => act.id === s?.activity_id)?.title,
        a.submission_no,
        a.submitted_at,
        g?.points,
        g?.max_points,
        g?.feedback,
      ];
    });
    download(
      "notas-privadas.csv",
      csv([
        [
          "Participação UUID",
          "Dupla UUID",
          "Dupla",
          "Turma",
          "Participante 1",
          "Participante 2",
          "Atividade",
          "Tentativa",
          "Entrega",
          "Nota",
          "Máximo",
          "Comentário",
        ],
        ...records,
      ]),
      "text/csv;charset=utf-8",
    );
  }
  return (
    <>
      <div className="eyebrow">EQUIPE PEDAGÓGICA</div>
      <h1>Administração</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {checking ? (
        <p>Verificando autorização…</p>
      ) : !identity ? (
        <form onSubmit={login} className="card narrow">
          <h2>Acesso com Supabase Auth</h2>
          <label>
            E-mail
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button className="primary" disabled={busy}>
            Entrar
          </button>
          <p>Contas precisam de autorização explícita em admin_users.</p>
        </form>
      ) : (
        <>
          <button
            onClick={() =>
              void action(async () => {
                const { error } = await supabase!.auth.signOut();
                if (error) throw error;
                setData(empty);
                setCredential(null);
                setRole("");
                setIdentity(null);
              })
            }
            disabled={busy}
          >
            Sair da administração
          </button>
          {!role ? (
            <p role="alert">
              Esta conta não está autorizada. Solicite a inclusão do UUID em
              admin_users ao responsável pelo projeto.
            </p>
          ) : (
            <>
              <div className="toolbar">
                <span>
                  Perfil: {role === "admin" ? "Administrador" : "Professor"}
                </span>
                <button disabled={busy} onClick={() => void action(load)}>
                  Atualizar entregas
                </button>
                <button onClick={exportGrades}>
                  Exportar notas CSV (privado)
                </button>
              </div>
              <form key={editing?.id ?? "new"} onSubmit={save} className="card">
                <h2>{editing ? "Editar rascunho" : "Nova atividade"}</h2>
                <label>
                  Título
                  <input
                    required
                    minLength={3}
                    maxLength={160}
                    name="title"
                    defaultValue={editing?.title}
                  />
                </label>
                <label>
                  Descrição
                  <textarea
                    maxLength={5000}
                    name="description"
                    defaultValue={editing?.description}
                  />
                </label>
                <fieldset>
                  <legend>Turmas</legend>
                  {classes.map((c) => (
                    <label className="check" key={c.id}>
                      <input
                        type="checkbox"
                        name="class"
                        value={c.id}
                        defaultChecked={
                          editing
                            ? data.sessions
                                .find((s) => s.activity_id === editing.id)
                                ?.class_ids.includes(c.id)
                            : false
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </fieldset>
                <label className="check">
                  <input
                    type="checkbox"
                    name="ctf"
                    defaultChecked={
                      editing
                        ? data.sessions.find(
                            (s) => s.activity_id === editing.id,
                          )?.ctf_enabled
                        : false
                    }
                  />
                  Contabilizar primeiras resoluções no ranking CTF
                </label>
                <p>
                  As notas são calculadas separadamente, inclusive quando o CTF
                  está desativado.
                </p>
                {questions.map((q, i) => (
                  <fieldset key={i}>
                    <legend>Questão {i + 1}</legend>
                    <label>
                      Enunciado
                      <textarea
                        required
                        maxLength={3000}
                        value={q.prompt}
                        onChange={(e) =>
                          changeQuestion(i, { ...q, prompt: e.target.value })
                        }
                      />
                    </label>
                    <div className="grid">
                      <label>
                        Tipo
                        <select
                          value={q.kind}
                          onChange={(e) =>
                            changeQuestion(i, {
                              ...q,
                              kind: e.target.value as DraftQuestion["kind"],
                              options:
                                e.target.value === "true_false"
                                  ? [
                                      { label: "Verdadeiro", is_correct: true },
                                      { label: "Falso", is_correct: false },
                                    ]
                                  : newQuestion().options,
                            })
                          }
                        >
                          <option value="multiple_choice">
                            Múltipla escolha
                          </option>
                          <option value="true_false">
                            Verdadeiro ou falso
                          </option>
                        </select>
                      </label>
                      <label>
                        Pontos
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          required
                          value={q.points}
                          onChange={(e) =>
                            changeQuestion(i, {
                              ...q,
                              points: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    {q.options.map((o, j) => (
                      <div className="option" key={j}>
                        <input
                          aria-label={`Marcar alternativa ${j + 1} como correta na questão ${i + 1}`}
                          type="radio"
                          name={`correct-${i}`}
                          checked={o.is_correct}
                          onChange={() =>
                            changeQuestion(i, {
                              ...q,
                              options: q.options.map((o, k) => ({
                                ...o,
                                is_correct: k === j,
                              })),
                            })
                          }
                        />
                        <input
                          aria-label={`Texto da alternativa ${j + 1} da questão ${i + 1}`}
                          required
                          maxLength={1000}
                          readOnly={q.kind === "true_false"}
                          value={o.label}
                          onChange={(e) =>
                            changeQuestion(i, {
                              ...q,
                              options: q.options.map((o, k) =>
                                k === j ? { ...o, label: e.target.value } : o,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    <small>Selecione a alternativa correta no círculo.</small>
                    <div className="toolbar">
                      {q.kind === "multiple_choice" && q.options.length < 8 && (
                        <button
                          type="button"
                          onClick={() =>
                            changeQuestion(i, {
                              ...q,
                              options: [
                                ...q.options,
                                { label: "", is_correct: false },
                              ],
                            })
                          }
                        >
                          Adicionar alternativa
                        </button>
                      )}
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions(questions.filter((_, j) => i !== j))
                          }
                        >
                          Remover questão
                        </button>
                      )}
                    </div>
                  </fieldset>
                ))}
                <div className="toolbar">
                  <button
                    type="button"
                    disabled={questions.length >= 100}
                    onClick={() => setQuestions([...questions, newQuestion()])}
                  >
                    Adicionar questão
                  </button>
                  <button className="primary" disabled={busy}>
                    Salvar rascunho
                  </button>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setQuestions([newQuestion()]);
                      }}
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
              </form>
              <section className="card">
                <h2>Atividades e publicação</h2>
                {data.sessions.map((s) => {
                  const a = data.activities.find((a) => a.id === s.activity_id);
                  if (!a) return null;
                  return (
                    <article className="item" key={s.id}>
                      <h3>{a.title}</h3>
                      <p>
                        {classes
                          .filter((c) => s.class_ids.includes(c.id))
                          .map((c) => c.name)
                          .join(" · ")}{" "}
                        · {s.published ? "Publicada" : "Indisponível"} ·{" "}
                        {s.ctf_enabled ? "Com CTF" : "Pedagógica"}
                      </p>
                      <div className="toolbar">
                        {!a.locked_at && (
                          <button disabled={busy} onClick={() => edit(a, s)}>
                            Editar rascunho
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await rpc("set_session_publication", {
                                p_session_id: s.id,
                                p_published: !s.published,
                                p_closes_at: s.closes_at,
                              });
                              await load();
                            })
                          }
                        >
                          {s.published ? "Retirar publicação" : "Publicar"}
                        </button>
                        <button
                          disabled={!s.published || busy}
                          onClick={() =>
                            void action(async () => {
                              const url = activityLink(s.id);
                              setQr({
                                url,
                                image: await QRCode.toDataURL(url, {
                                  width: 360,
                                  errorCorrectionLevel: "M",
                                }),
                              });
                            })
                          }
                        >
                          Link e QR Code
                        </button>
                      </div>
                      <form
                        className="toolbar"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const close = String(f.get("close"));
                          void action(async () => {
                            await rpc("set_session_publication", {
                              p_session_id: s.id,
                              p_published: s.published,
                              p_closes_at: close
                                ? new Date(close).toISOString()
                                : null,
                            });
                            await load();
                          });
                        }}
                      >
                        <label>
                          Encerramento (horário local)
                          <input type="datetime-local" name="close" />
                        </label>
                        <button disabled={busy}>
                          Definir prazo (vazio remove)
                        </button>
                      </form>
                      {s.closes_at && (
                        <p>
                          Prazo atual:{" "}
                          {new Date(s.closes_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </article>
                  );
                })}
              </section>
              {qr && (
                <section className="card">
                  <h2>Compartilhar atividade</h2>
                  <img
                    className="qr"
                    src={qr.image}
                    alt="QR Code do link da atividade"
                  />
                  <p>
                    <a href={qr.url}>{qr.url}</a>
                  </p>
                  <a download="atividade-qr.png" href={qr.image}>
                    Baixar QR Code
                  </a>
                  <button onClick={() => setQr(null)}>Fechar</button>
                </section>
              )}
              <section className="card">
                <h2>Entregas e notas privadas</h2>
                {data.attempts.length === 0 && (
                  <p>Ainda não há participações.</p>
                )}
                {data.attempts.map((a) => {
                  const t = data.teams.find((t) => t.id === a.team_id);
                  const g = data.grades.find((g) => g.attempt_id === a.id);
                  const s = data.sessions.find(
                    (s) => s.id === a.activity_session_id,
                  );
                  return (
                    <article key={a.id} className="item">
                      <h3>
                        {t?.public_name} ·{" "}
                        {
                          data.activities.find(
                            (act) => act.id === s?.activity_id,
                          )?.title
                        }
                      </h3>
                      <p>
                        Tentativa {a.submission_no} ·{" "}
                        {a.submitted_at
                          ? `Entregue em ${new Date(a.submitted_at).toLocaleString("pt-BR")}`
                          : "Em andamento"}{" "}
                        ·{" "}
                        {g
                          ? `${g.points} / ${g.max_points} pontos`
                          : "Sem nota"}
                      </p>
                      <p>
                        {data.members
                          .filter((m) => m.team_id === t?.id)
                          .sort((a, b) => a.position - b.position)
                          .map((m) => m.full_name)
                          .join(" e ")}
                      </p>
                      <details>
                        <summary>Respostas</summary>
                        {data.answers
                          .filter((ans) => ans.attempt_id === a.id)
                          .map((ans) => (
                            <p key={ans.question_id}>
                              {
                                data.questions.find(
                                  (q) => q.id === ans.question_id,
                                )?.prompt
                              }
                              :{" "}
                              <strong>
                                {
                                  data.options.find(
                                    (o) => o.id === ans.option_id,
                                  )?.label
                                }
                              </strong>
                            </p>
                          ))}
                      </details>
                      {g && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void action(async () => {
                              await rpc("adjust_grade", {
                                p_attempt_id: a.id,
                                p_points: Number(f.get("points")),
                                p_feedback: f.get("feedback"),
                              });
                              await load();
                            });
                          }}
                        >
                          <label>
                            Nota
                            <input
                              name="points"
                              type="number"
                              required
                              min={0}
                              max={g.max_points}
                              defaultValue={g.points}
                            />
                          </label>
                          <label>
                            Comentário
                            <textarea
                              name="feedback"
                              maxLength={5000}
                              defaultValue={g.feedback}
                            />
                          </label>
                          <button disabled={busy}>
                            Salvar correção pedagógica
                          </button>
                        </form>
                      )}
                      {role === "admin" && a.submitted_at && (
                        <button
                          disabled={busy || a.retry_available}
                          onClick={() =>
                            void action(async () => {
                              await rpc("authorize_retry", {
                                p_attempt_id: a.id,
                              });
                              await load();
                            })
                          }
                        >
                          {a.retry_available
                            ? "Nova entrega autorizada"
                            : "Autorizar nova entrega"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </section>
              <section className="card">
                <h2>Duplas permanentes</h2>
                {data.teams.map((t) => (
                  <article className="item" key={t.id}>
                    <h3>
                      {t.public_name} ·{" "}
                      {classes.find((c) => c.id === t.class_id)?.name}
                    </h3>
                    <p>Código: {t.access_code}</p>
                    <p>
                      {data.members
                        .filter((m) => m.team_id === t.id)
                        .sort((a, b) => a.position - b.position)
                        .map((m) => m.full_name)
                        .join(" e ")}
                    </p>
                    {role === "admin" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Redefinir a credencial de ${t.public_name}? Todas as sessões da dupla serão encerradas. Confirme a identidade dos dois integrantes antes de entregar a nova credencial.`,
                            )
                          )
                            void action(async () => {
                              setCredential(
                                await rpc("rotate_team_credential", {
                                  p_team_id: t.id,
                                }),
                              );
                            });
                        }}
                      >
                        Emitir nova credencial
                      </button>
                    )}
                  </article>
                ))}
              </section>
              {credential && (
                <section className="card credential">
                  <h2>Entregue em canal privado</h2>
                  <p>Código: {credential.access_code}</p>
                  <label>
                    Nova credencial
                    <input readOnly value={credential.credential} />
                  </label>
                  <p>
                    A credencial anterior e as sessões anteriores foram
                    revogadas. Histórico e notas foram preservados.
                  </p>
                  <button
                    onClick={() => {
                      download(
                        "nova-credencial.txt",
                        `Código: ${credential.access_code}\nCredencial: ${credential.credential}\nGuarde em local privado fora do Live Boot.`,
                      );
                    }}
                  >
                    Baixar
                  </button>
                  <button onClick={() => setCredential(null)}>
                    Já entreguei, ocultar
                  </button>
                </section>
              )}
              {role === "admin" && (
                <form
                  className="card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    const eventId = crypto.randomUUID();
                    void action(async () => {
                      await rpc("adjust_ctf", {
                        p_event_id: eventId,
                        p_team_id: f.get("team"),
                        p_points: Number(f.get("points")),
                        p_reason: f.get("reason"),
                      });
                      form.reset();
                      setNotice(
                        "Ajuste CTF registrado em auditoria. As notas pedagógicas não foram alteradas.",
                      );
                    });
                  }}
                >
                  <h2>Ajustar pontos CTF</h2>
                  <label>
                    Dupla
                    <select name="team" required>
                      <option value="">Selecione</option>
                      {data.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.public_name} ·{" "}
                          {classes.find((c) => c.id === t.class_id)?.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ajuste de pontos (positivo ou negativo)
                    <input
                      name="points"
                      type="number"
                      required
                      min={-100000}
                      max={100000}
                    />
                  </label>
                  <label>
                    Justificativa
                    <input name="reason" required maxLength={500} />
                  </label>
                  <button disabled={busy}>Registrar ajuste auditado</button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
