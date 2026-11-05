import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { rpc, type Class } from "./api";
import { csv, download } from "./utils";

type AttendanceStatus = "" | "present" | "absent" | "justified";
export type AttendanceLesson = {
  id: string;
  class_id: string;
  class_name: string;
  title: string;
  lesson_date: string;
  students: number;
  present: number;
  absent: number;
  justified: number;
  unmarked: number;
};
export type AttendanceStudent = {
  member_id: string;
  team_id: string;
  public_name: string;
  full_name: string;
  member_position: number;
  status: string | null;
};

function todayLocal() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
const statusLabels: Record<AttendanceStatus, string> = {
  "": "Não marcado",
  present: "Presente",
  absent: "Faltou",
  justified: "Justificada",
};
const codes: AttendanceStatus[] = ["", "present", "absent", "justified"];

export default function AttendanceManagement({
  classes,
  role,
  classFilter,
}: {
  classes: Class[];
  role: string;
  classFilter: string;
}) {
  const canEdit = role === "admin";
  const [lessons, setLessons] = useState<AttendanceLesson[]>([]);
  const [activeId, setActiveId] = useState("");
  const [roster, setRoster] = useState<AttendanceStudent[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadLessons = useCallback(async () => {
    const list = await rpc<AttendanceLesson[]>("list_attendance_lessons", {
      p_class_id: classFilter || null,
    });
    setLessons(list);
    return list;
  }, [classFilter]);

  useEffect(() => {
    let valid = true;
    setLoading(true);
    setActiveId("");
    setRoster([]);
    setMarks({});
    setError("");
    void loadLessons()
      .catch((err: Error) => { if (valid) setError(err.message); })
      .finally(() => { if (valid) setLoading(false); });
    return () => { valid = false; };
  }, [loadLessons]);

  const openLesson = useCallback(async (lessonId: string) => {
    setActiveId(lessonId);
    setRosterLoading(true);
    setError("");
    try {
      const students = await rpc<AttendanceStudent[]>("list_attendance_roster", {
        p_lesson_id: lessonId,
      });
      setRoster(students);
      setMarks(Object.fromEntries(
        students.map((s) => [
          s.member_id,
          codes.includes(s.status as AttendanceStatus)
            ? (s.status as AttendanceStatus)
            : "",
        ]),
      ));
    } catch (err) {
      setError((err as Error).message);
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }, []);

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const id = await rpc<string>("create_attendance_lesson", {
        p_class_id: String(input.get("class_id")),
        p_title: String(input.get("title")),
        p_lesson_date: String(input.get("lesson_date")),
      });
      await loadLessons();
      setCreating(false);
      await openLesson(id);
      setNotice("Aula cadastrada. Agora selecione cada aluno para registrar a chamada.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAttendance() {
    if (!activeId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await rpc("save_attendance_marks", {
        p_lesson_id: activeId,
        p_entries: roster.map((s) => ({
          member_id: s.member_id,
          status: marks[s.member_id] || null,
        })),
      });
      await loadLessons();
      await openLesson(activeId);
      setNotice("Chamada registrada no Supabase. Cada presença permanece vinculada ao aluno e à aula.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const active = lessons.find((l) => l.id === activeId);
  const visibleRoster = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return roster.filter((s) =>
      !needle || [s.full_name, s.public_name].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(needle)),
    );
  }, [roster, query]);
  const totals = useMemo(() => {
    const count = (status: AttendanceStatus) => roster.filter((s) => (marks[s.member_id] || "") === status).length;
    return { present: count("present"), absent: count("absent"), justified: count("justified"), unmarked: count("") };
  }, [roster, marks]);

  function exportAttendance() {
    if (!active) return;
    download("chamada-" + active.lesson_date + ".csv", csv([
      ["Turma", "Aula", "Data", "Dupla", "Participante", "Presença"],
      ...roster.map((s) => [
        active.class_name, active.title, active.lesson_date,
        s.public_name, s.full_name, statusLabels[marks[s.member_id] || ""],
      ]),
    ]), "text/csv;charset=utf-8");
  }

  return (
    <div className="attendance-management">
      <section className="card">
        <div className="attendance-intro">
          <div>
            <h2>Chamada das aulas</h2>
            <p>Registre a presença de cada integrante, mesmo quando participa em dupla. Somente administradores lançam ou corrigem presenças.</p>
          </div>
          {canEdit && (
            <button type="button" className="primary" onClick={() => setCreating((v) => !v)}>
              {creating ? "Fechar cadastro" : "+ Nova aula"}
            </button>
          )}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="success" role="status">{notice}</p>}
        {creating && canEdit && (
          <form onSubmit={(e) => void createLesson(e)} className="attendance-create">
            <h3>Cadastrar aula para chamada</h3>
            <div className="grid">
              <label>Turma
                <select name="class_id" required defaultValue={classFilter || ""}>
                  <option value="" disabled>Selecione</option>
                  {classes.filter((c) => c.status === "active").map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>Data da aula
                <input type="date" name="lesson_date" defaultValue={todayLocal()} required />
              </label>
            </div>
            <label>Nome ou assunto da aula
              <input name="title" required minLength={3} maxLength={160}
                placeholder="Ex.: Aula 02 — Comandos essenciais Linux" />
            </label>
            <button className="primary" disabled={busy}>Salvar aula</button>
          </form>
        )}
        <p className="muted">Use a seta ao lado de cada aula para visualizar a chamada. “Não marcado” não conta como falta.</p>
        {loading ? <p>Carregando aulas…</p> : lessons.length === 0 ? (
          <p>Nenhuma aula cadastrada {classFilter ? "nesta turma" : "ainda"}.</p>
        ) : (
          <div className="attendance-lessons">
            {lessons.map((lesson) => (
              <details key={lesson.id} className="admin-accordion attendance-lesson">
                <summary>
                  <span className="admin-accordion-title">{lesson.title}<small>{lesson.class_name} · {lesson.lesson_date}</small></span>
                  <span className="attendance-lesson-counts">{lesson.present}/{lesson.students} presentes</span>
                </summary>
                <div className="admin-accordion-body">
                  <p>{lesson.absent} faltas · {lesson.justified} justificadas · {lesson.unmarked} sem marcação</p>
                  <button type="button" disabled={rosterLoading}
                    onClick={() => void openLesson(lesson.id)}>
                    {lesson.id === activeId ? "Atualizar chamada" : "Abrir chamada"}
                  </button>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
      {active && (
        <section className="card" aria-label="Registro de presença">
          <div className="attendance-intro">
            <div>
              <h2>{active.title}</h2>
              <p>{active.class_name} · {active.lesson_date} · {roster.length} estudantes</p>
            </div>
            <button type="button" disabled={rosterLoading} onClick={exportAttendance}>Exportar CSV privado</button>
          </div>
          {rosterLoading ? <p>Carregando participantes…</p> : (
            <>
              <div className="attendance-stats" aria-label="Resumo da chamada">
                <span>Presentes: <strong>{totals.present}</strong></span>
                <span>Faltas: <strong>{totals.absent}</strong></span>
                <span>Justificadas: <strong>{totals.justified}</strong></span>
                <span>Não marcados: <strong>{totals.unmarked}</strong></span>
              </div>
              <label className="admin-filter">Pesquisar aluno ou dupla
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nome do aluno ou da dupla" />
              </label>
              {roster.length === 0 ? <p>Nenhum estudante cadastrado nesta turma. Cadastre as duplas primeiro.</p> : (
                <div className="table-wrap">
                  <table className="attendance-table">
                    <thead><tr><th>Aluno</th><th>Dupla</th><th>Presença</th></tr></thead>
                    <tbody>
                      {visibleRoster.map((student) => (
                        <tr key={student.member_id}>
                          <td>{student.full_name}</td>
                          <td>{student.public_name}</td>
                          <td>
                            <label className="attendance-select">
                              <span className="visually-hidden">Presença de {student.full_name}</span>
                              <select
                                aria-label={"Presença de " + student.full_name}
                                value={marks[student.member_id] || ""}
                                disabled={!canEdit || busy}
                                onChange={(e) => setMarks((current) => ({
                                  ...current,
                                  [student.member_id]: e.target.value as AttendanceStatus,
                                }))}>
                                {codes.map((code) => (
                                  <option key={code} value={code}>{statusLabels[code]}</option>
                                ))}
                              </select>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canEdit && roster.length > 0 && (
                <div className="attendance-save-actions">
                  <button type="button" className="primary" disabled={busy} onClick={() => void saveAttendance()}>
                    {busy ? "Salvando…" : "Salvar chamada"}
                  </button>
                  <p className="muted">As presenças só são registradas após clicar em Salvar chamada.</p>
                </div>
              )}
              {!canEdit && <p className="muted">Consulta somente leitura para professores.</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
