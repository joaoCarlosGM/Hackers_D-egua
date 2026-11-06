import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import Results from "./Results";
import ClassManagement from "./ClassManagement";
import AdminNavigation, { type AdminSection } from "./AdminNavigation";
import TeamManagement from "./TeamManagement";
import AdminAccessManagement from "./AdminAccessManagement";
import AttendanceManagement from "./AttendanceManagement";
import { brandAssets } from "./Brand";
import "./admin-attendance.css";
import ActivityPreview from "./ActivityPreview";
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
  revision: number;
  revision_of: string | null;
};
type Session = {
  id: string;
  activity_id: string;
  class_ids: string[];
  published: boolean;
  status: "draft" | "published" | "open" | "closed" | "archived";
  access_code: string;
  time_limit_seconds: number | null;
  allow_backtracking: boolean;
  release_results: boolean;
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
  explanation: string;
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
export default function Admin({
  classes,
  resultsActivityId,
  onClassesChanged,
  section = "overview",
}: {
  classes: Class[];
  resultsActivityId?: string;
  onClassesChanged?: () => Promise<void>;
  section?: AdminSection;
}) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Data>(empty);
  const [editing, setEditing] = useState<Act | null>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion()]);
  const [qr, setQr] = useState<{
    url: string;
    image: string;
    code: string;
    title: string;
  } | null>(null);
  const [preview, setPreview] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const visibleTeams = data.teams.filter(
    (t) => !classFilter || t.class_id === classFilter,
  );
  const visibleAttempts = data.attempts.filter(
    (a) => !classFilter || visibleTeams.some((t) => t.id === a.team_id),
  );
  const visibleSessions = data.sessions.filter(
    (s) => !classFilter || s.class_ids.includes(classFilter),
  );
  useEffect(() => {
    if (classFilter && !classes.some((c) => c.id === classFilter))
      setClassFilter("");
  }, [classes, classFilter]);
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
    if (!role) return;
    const refresh = () => void load().catch((e) => setError(e.message));
    refresh();
    const channel = supabase!
      .channel("staff-assessment-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assessment_updates" },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    const timer = setInterval(refresh, 15000);
    addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      removeEventListener("focus", refresh);
      void supabase!.removeChannel(channel);
    };
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
      await rpc("save_assessment", {
        p_title: f.get("title"),
        p_description: f.get("description"),
        p_class_ids: f.getAll("class"),
        p_questions: questions,
        p_settings: {
          time_limit_seconds: f.get("time_limit")
            ? Number(f.get("time_limit")) * 60
            : null,
          allow_backtracking: f.get("backtracking") === "on",
          release_results: f.get("release") === "on",
        },
        p_activity_id: editing?.id ?? null,
      });
      setNotice(
        "Atividade salva como rascunho. Publique e inicie para receber as duplas.",
      );
      setEditing(null);
      setQuestions([newQuestion()]);
      setEditorExpanded(false);
      form.reset();
      await load();
    });
  }
  function edit(a: Act, s: Session) {
    setEditing(a);
    setEditorExpanded(true);
    setQuestions(
      data.questions
        .filter((q) => q.activity_id === a.id)
        .sort((a, b) => a.position - b.position)
        .map((q) => ({
          prompt: q.prompt,
          explanation: q.explanation,
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
    const records = visibleAttempts.map((a) => {
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
  if (role && !checking && resultsActivityId)
    return (
      <AdminNavigation section="notas" role={role}>
        <div className="admin-actions-bar">
          <a href="#admin/notas">← Voltar às notas e entregas</a>
          <button className="admin-signout" onClick={() => void supabase!.auth.signOut()}>
            Sair da administração
          </button>
        </div>
        <Results activityId={resultsActivityId} />
      </AdminNavigation>
    );
  return (
    <>
      {!role && (
        <>
          <div className="eyebrow">EQUIPE PEDAGÓGICA</div>
          <h1>Administração</h1>
        </>
      )}
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
        <div className="admin-auth-layout">
          <form onSubmit={login} className="card admin-login-card">
            <h2>Acesso com Supabase Auth</h2>
            <label>
              E-mail
              <input name="email" type="email" required autoComplete="username" />
            </label>
            <label>
              Senha
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <button className="primary" disabled={busy}>Entrar</button>
            <p>Contas precisam de autorização explícita em admin_users.</p>
          </form>
          <a className="admin-boto-shortcut" href="#ranking" aria-label="Boto pixel art Hackers Pai D’égua — abrir ranking público CTF">
            <img src={brandAssets.pixel} alt="Boto pixel art com o nome Hackers Pai D’égua, arte original do projeto" width={1500} height={1500} />
            <span>Ver ranking CTF <span aria-hidden="true">↗</span></span>
          </a>
        </div>
      ) : (
        <>
          {!role ? (
            <>
              <p role="alert">
                Esta conta não está autorizada. Solicite a inclusão do UUID em
                admin_users ao responsável pelo projeto.
              </p>
              <button onClick={() =>
                void action(async () => {
                  const { data: { user }, error: authError } = await supabase!.auth.getUser();
                  if (authError) throw authError;
                  if (!user) throw new Error("Sessão encerrada. Entre novamente.");
                  const { data, error: roleError } = await supabase!.from("admin_users")
                    .select("role").eq("user_id", user.id).maybeSingle();
                  if (roleError) throw roleError;
                  setRole(data?.role ?? "");
                  if (data?.role) setNotice("Autorização reconhecida com sucesso.");
                  else setNotice("Conta autenticada, mas ainda sem autorização. Solicite ao administrador que libere seu e-mail.");
                })
              }>
                Verificar autorização novamente
              </button>
              <button onClick={() => void supabase!.auth.signOut()}>
                Sair da administração
              </button>
            </>
          ) : (
            <AdminNavigation section={section} role={role}>
              <div className="admin-actions-bar">
                <span>Perfil: {role === "admin" ? "Administrador" : "Professor"}</span>
                <button disabled={busy} onClick={() => void action(load)}>
                  Atualizar dados
                </button>
                {(section === "notas" || section === "overview") && (
                  <button onClick={exportGrades}>
                    Exportar notas CSV (privado)
                  </button>
                )}
                <button
                  className="admin-signout"
                  disabled={busy}
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
                >
                  Sair da administração
                </button>
              </div>
              {section === "overview" && (
                <>
                  <div className="admin-overview-lead">
                    <div className="eyebrow">CENTRAL DE AULAS · TEMPO REAL</div>
                    <h2>Organize as atividades, acompanhe as turmas e pontue o CTF.</h2>
                    <p>Escolha um módulo no menu. Cada operação fica no seu espaço, sem perder o acesso ao histórico de avaliações.</p>
                  </div>
                  <div className="admin-metrics" aria-label="Indicadores pedagógicos">
                    {[
                      { label: "Turmas ativas", value: classes.filter((c) => c.status === "active").length },
                      { label: "Duplas cadastradas", value: data.teams.length },
                      { label: "Atividades criadas", value: data.activities.length },
                      { label: "Entregas concluídas", value: data.attempts.filter((a) => !!a.submitted_at).length },
                    ].map((metric) => (
                      <div className="admin-metric" key={metric.label}>
                        <strong>{metric.value}</strong>
                        <span>{metric.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="admin-quick-actions">
                    <a href="#admin/atividades"><strong>+ Criar uma atividade</strong><span>Múltipla escolha, verdadeiro ou falso e QR Code para a turma.</span></a>
                    <a href="#admin/turmas"><strong>Organizar turmas</strong><span>Gerenciar Poraquê, Pitiú e os demais grupos.</span></a>
                    <a href="#admin/duplas"><strong>Consultar duplas</strong><span>Cadastro permanente, participantes e credenciais.</span></a>
                    <a href="#admin/notas"><strong>Conferir entregas</strong><span>Resultados privados, correções e exportação.</span></a>
                    <a href="#admin/chamada"><strong>Registrar presença</strong><span>Chamada por aluno, turma e data da aula.</span></a>
                    {role === "admin" && <a href="#admin/ctf"><strong>Registrar pontos CTF</strong><span>Classificação pública independente das notas.</span></a>}
                    {role === "admin" && <a href="#admin/usuarios"><strong>Gerenciar acessos</strong><span>Autorizar professores e administradores já cadastrados no Supabase Auth.</span></a>}
                  </div>
                </>
              )}
              {section === "turmas" && (
                <ClassManagement
                canManage={role === "admin"}
                onChanged={onClassesChanged}
                onInspect={(id) => {
                  setClassFilter(id);
                  location.hash = "#admin/notas";
                }}
              />
              )}
              {(["atividades", "duplas", "notas", "chamada", "ctf"] as AdminSection[]).includes(section) && (
              <label className="admin-filter">
                Filtrar por turma
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">Todas as turmas</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === "archived" ? " (arquivada)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              )}
              {section === "chamada" && (
                <AttendanceManagement classes={classes} role={role} classFilter={classFilter} />
              )}
              {section === "atividades" && (
                <>
              <details
                className="admin-accordion admin-activity-editor"
                open={editorExpanded}
                onToggle={(e) => setEditorExpanded(e.currentTarget.open)}
              >
                <summary>
                  <span className="admin-accordion-title">
                    <strong>{editing ? "Editar rascunho" : "Cadastrar nova atividade"}</strong>
                    <small>Múltipla escolha, verdadeiro ou falso, publicação e QR Code</small>
                  </span>
                </summary>
                <div className="admin-accordion-body">
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
                  {classes
                    .filter(
                      (c) =>
                        c.status === "active" ||
                        (editing &&
                          data.sessions.some(
                            (s) =>
                              s.activity_id === editing.id &&
                              s.class_ids.includes(c.id),
                          )),
                    )
                    .map((c) => (
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
                <div className="grid">
                  <label>
                    Cronômetro em minutos (vazio desativa)
                    <input
                      name="time_limit"
                      type="number"
                      min={0.5}
                      max={240}
                      step={0.5}
                      defaultValue={
                        editing
                          ? (data.sessions.find(
                              (s) => s.activity_id === editing.id,
                            )?.time_limit_seconds ?? 0) / 60 || ""
                          : ""
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      name="backtracking"
                      defaultChecked={
                        editing
                          ? data.sessions.find(
                              (s) => s.activity_id === editing.id,
                            )?.allow_backtracking
                          : true
                      }
                    />
                    Permitir voltar às questões anteriores
                  </label>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    name="release"
                    defaultChecked={
                      editing
                        ? data.sessions.find(
                            (s) => s.activity_id === editing.id,
                          )?.release_results
                        : false
                    }
                  />
                  Liberar a própria nota para a dupla após o encerramento
                </label>
                <p>Notas pedagógicas não são convertidas em pontos CTF.</p>
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
                    <label>
                      Explicação opcional (privada durante a atividade)
                      <textarea
                        maxLength={5000}
                        value={q.explanation ?? ""}
                        onChange={(e) =>
                          changeQuestion(i, {
                            ...q,
                            explanation: e.target.value,
                          })
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
                      {q.kind === "multiple_choice" && q.options.length < 5 && (
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
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...questions];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            setQuestions(next);
                          }}
                        >
                          Mover questão para cima
                        </button>
                      )}
                      {i < questions.length - 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...questions];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            setQuestions(next);
                          }}
                        >
                          Mover questão para baixo
                        </button>
                      )}
                      {q.kind === "multiple_choice" && q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = q.options.slice(0, -1);
                            if (!next.some((o) => o.is_correct))
                              next[0] = { ...next[0], is_correct: true };
                            changeQuestion(i, { ...q, options: next });
                          }}
                        >
                          Remover última alternativa
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
                  <button type="button" onClick={() => setPreview(true)}>
                    Visualizar antes de publicar
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
                </div>
              </details>
              {preview && (
                <ActivityPreview
                  questions={questions}
                  onClose={() => setPreview(false)}
                />
              )}
              <section className="card">
                <h2>Atividades e publicação</h2>
                {visibleSessions.map((s) => {
                  const a = data.activities.find((a) => a.id === s.activity_id);
                  if (!a) return null;
                  return (
                    <article className="item" key={s.id}>
                      <details className="admin-accordion admin-activity-item">
                        <summary>
                          <span className="admin-accordion-title"><strong>{a.title}</strong>
                            <small>{classes.filter((c) => s.class_ids.includes(c.id)).map((c) => c.name).join(" · ")} · {s.status}</small>
                          </span>
                        </summary>
                        <div className="admin-accordion-body">
                      <p>
                        {classes
                          .filter((c) => s.class_ids.includes(c.id))
                          .map((c) => c.name)
                          .join(" · ")}{" "}
                        ·{" "}
                        {
                          {
                            draft: "Rascunho",
                            published: "Publicada",
                            open: "Aberta",
                            closed: "Encerrada",
                            archived: "Arquivada",
                          }[s.status]
                        }{" "}
                        · revisão {a.revision}
                      </p>
                      <div className="toolbar">
                        {s.status === "draft" && (
                          <button disabled={busy} onClick={() => edit(a, s)}>
                            Editar rascunho
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await rpc("duplicate_assessment", {
                                p_activity_id: a.id,
                              });
                              setNotice(
                                "Revisão criada como rascunho, com novos identificadores e sem alterar as entregas anteriores.",
                              );
                              await load();
                            })
                          }
                        >
                          Duplicar / criar revisão
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Excluir ${a.title}? Atividades com participações devem ser arquivadas.`,
                              )
                            )
                              void action(async () => {
                                await rpc("delete_assessment", {
                                  p_activity_id: a.id,
                                });
                                await load();
                              });
                          }}
                        >
                          Excluir atividade
                        </button>
                        <a href={`#admin/atividades/${a.id}/resultados`}>
                          Resultados e notas
                        </a>
                        {s.status === "draft" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await rpc("transition_assessment", {
                                  p_session_id: s.id,
                                  p_status: "published",
                                });
                                await load();
                              })
                            }
                          >
                            Publicar
                          </button>
                        )}
                        {s.status === "published" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await rpc("transition_assessment", {
                                  p_session_id: s.id,
                                  p_status: "draft",
                                });
                                await load();
                              })
                            }
                          >
                            Voltar ao rascunho
                          </button>
                        )}
                        {(s.status === "published" ||
                          s.status === "closed") && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await rpc("transition_assessment", {
                                  p_session_id: s.id,
                                  p_status: "open",
                                });
                                const url = activityLink(s.id);
                                setQr({
                                  url,
                                  image: await QRCode.toDataURL(url, {
                                    width: 360,
                                    errorCorrectionLevel: "M",
                                  }),
                                  code: s.access_code,
                                  title: a.title,
                                });
                                await load();
                              })
                            }
                          >
                            {s.status === "closed"
                              ? "Reabrir atividade"
                              : "Iniciar atividade"}
                          </button>
                        )}
                        {s.status === "open" && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await rpc("transition_assessment", {
                                    p_session_id: s.id,
                                    p_status: "closed",
                                  });
                                  await load();
                                })
                              }
                            >
                              Encerrar atividade
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  const url = activityLink(s.id);
                                  setQr({
                                    url,
                                    image: await QRCode.toDataURL(url, {
                                      width: 360,
                                      errorCorrectionLevel: "M",
                                    }),
                                    code: s.access_code,
                                    title: a.title,
                                  });
                                })
                              }
                            >
                              Projetar código e QR Code
                            </button>
                          </>
                        )}
                        {s.status === "closed" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await rpc("transition_assessment", {
                                  p_session_id: s.id,
                                  p_status: "archived",
                                });
                                await load();
                              })
                            }
                          >
                            Arquivar
                          </button>
                        )}
                        {s.status === "archived" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await rpc("transition_assessment", {
                                  p_session_id: s.id,
                                  p_status: "closed",
                                });
                                await load();
                              })
                            }
                          >
                            Retirar do arquivo
                          </button>
                        )}
                      </div>
                      {s.status === "open" && (
                        <form
                          className="toolbar"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            const close = String(f.get("close"));
                            void action(async () => {
                              await rpc("transition_assessment", {
                                p_session_id: s.id,
                                p_status: "open",
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
                      )}
                      {s.closes_at && (
                        <p>
                          Prazo atual:{" "}
                          {new Date(s.closes_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                        </div>
                      </details>
                    </article>
                  );
                })}
              </section>
              {qr && (
                <section
                  className="card projection"
                  aria-label="Tela de projeção da atividade"
                >
                  <h2>{qr.title}</h2>
                  <p>Acesse a plataforma e digite o código:</p>
                  <strong className="access-code">{qr.code}</strong>
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
                </>
              )}
              {section === "notas" && (
              <section className="card">
                <h2 id="class-records" tabIndex={-1}>
                  Entregas e notas privadas
                  {classFilter
                    ? ` · ${classes.find((c) => c.id === classFilter)?.name ?? ""}`
                    : ""}
                </h2>
                {visibleAttempts.length === 0 && (
                  <p>Ainda não há participações.</p>
                )}
                {visibleAttempts.map((a) => {
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
                      {a.submitted_at && (
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
              )}
              {section === "duplas" && (
                <>
              <TeamManagement
                classes={classes}
                canManage={role === "admin"}
                selectedClassId={classFilter}
                onChanged={load}
                onCredential={setCredential}
              />
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
                </>
              )}
              {section === "usuarios" && role === "admin" && identity && (
                <AdminAccessManagement currentUserId={identity} />
              )}
              {section === "ctf" && role !== "admin" && (
                <p role="alert" className="card">Somente administradores podem ajustar a pontuação do CTF.</p>
              )}
              {section === "ctf" && role === "admin" && (
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
                      {visibleTeams.map((t) => (
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
            </AdminNavigation>
          )}
        </>
      )}
    </>
  );
}
