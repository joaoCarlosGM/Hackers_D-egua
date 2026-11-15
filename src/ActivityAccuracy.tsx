import type { Class } from "./api";

export type ActivityAccuracyData = {
  activities: { id: string; title: string }[];
  sessions: { id: string; activity_id: string; class_ids: string[]; status: string }[];
  teams: { id: string; class_id: string }[];
  attempts: { id: string; team_id: string; activity_session_id: string; submitted_at: string | null }[];
  grades: { attempt_id: string; points: number; max_points: number }[];
  questions: { id: string; activity_id: string; points?: number }[];
  options: { id: string; question_id: string; is_correct: boolean }[];
  answers: { attempt_id: string; question_id: string; option_id: string }[];
};

export type ActivityAccuracyRow = {
  key: string;
  title: string;
  className: string;
  classId: string;
  submittedTeams: number;
  correctAnswers: number;
  totalQuestions: number;
  percent: number | null;
  questionCount: number;
  maxScore: number | null;
  averageScore: number | null;
};

/** Aggregate a single *best graded submission per duo per activity* (including retries),
 * and count correct answers against the total questions that were available.
 * Never return student identities or the key to the public site.
 */
export function calculateActivityAccuracy(
  classes: Class[],
  data: ActivityAccuracyData,
  classFilter = "",
): ActivityAccuracyRow[] {
  const activityById = new Map(data.activities.map((a) => [a.id, a]));
  const teamById = new Map(data.teams.map((t) => [t.id, t]));
  const gradeByAttempt = new Map(data.grades.map((g) => [g.attempt_id, g]));
  const questionsByActivity = new Map<string, string[]>();
  const questionPointsByActivity = new Map<string, number[]>();
  for (const q of data.questions) {
    const list = questionsByActivity.get(q.activity_id) ?? [];
    list.push(q.id);
    questionsByActivity.set(q.activity_id, list);
    if (typeof q.points === "number" && Number.isFinite(q.points) && q.points > 0) {
      const points = questionPointsByActivity.get(q.activity_id) ?? [];
      points.push(q.points);
      questionPointsByActivity.set(q.activity_id, points);
    }
  }
  const correctOptionIds = new Set(data.options.filter((o) => o.is_correct).map((o) => o.id));
  const correctAnswersByAttempt = new Map<string, Set<string>>();
  for (const answer of data.answers) {
    if (!correctOptionIds.has(answer.option_id)) continue;
    const list = correctAnswersByAttempt.get(answer.attempt_id) ?? new Set<string>();
    list.add(answer.question_id);
    correctAnswersByAttempt.set(answer.attempt_id, list);
  }

  const groups = new Map<string, { activityId: string; classId: string; sessionIds: Set<string> }>();
  const groupBySessionAndClass = new Map<string, string>();
  for (const s of data.sessions) {
    if (s.status === "draft" || !activityById.has(s.activity_id)) continue;
    for (const classId of s.class_ids) {
      if (classFilter && classFilter !== classId) continue;
      if (!classes.some((c) => c.id === classId)) continue;
      const key = classId + ":" + s.activity_id;
      const current = groups.get(key) ?? {
        activityId: s.activity_id,
        classId,
        sessionIds: new Set<string>(),
      };
      current.sessionIds.add(s.id);
      groups.set(key, current);
      groupBySessionAndClass.set(s.id + ":" + classId, key);
    }
  }

  const best = new Map<string, { attemptId: string; ratio: number; submittedAt: string; points: number; maxPoints: number }>();
  for (const attempt of data.attempts) {
    if (!attempt.submitted_at) continue;
    const team = teamById.get(attempt.team_id);
    const grade = gradeByAttempt.get(attempt.id);
    if (!team || !grade || grade.max_points <= 0) continue;
    const group = groupBySessionAndClass.get(attempt.activity_session_id + ":" + team.class_id);
    if (!group) continue;
    const key = group + ":" + attempt.team_id;
    const ratio = Math.max(0, Math.min(1, grade.points / grade.max_points));
    const previous = best.get(key);
    if (!previous || ratio > previous.ratio ||
      (ratio === previous.ratio && attempt.submitted_at > previous.submittedAt)) {
      best.set(key, { attemptId: attempt.id, ratio, submittedAt: attempt.submitted_at, points: grade.points, maxPoints: grade.max_points });
    }
  }

  const rows: ActivityAccuracyRow[] = [];
  for (const [key, group] of groups) {
    const questionIds = new Set(questionsByActivity.get(group.activityId) ?? []);
    let submittedTeams = 0;
    let correctAnswers = 0;
    let totalGradeRatio = 0;
    const gradedMaxima: number[] = [];
    for (const [teamKey, attempt] of best) {
      if (!teamKey.startsWith(key + ":")) continue;
      submittedTeams += 1;
      totalGradeRatio += attempt.ratio;
      gradedMaxima.push(attempt.maxPoints);
      for (const id of correctAnswersByAttempt.get(attempt.attemptId) ?? []) {
        if (questionIds.has(id)) correctAnswers += 1;
      }
    }
    const totalQuestions = submittedTeams * questionIds.size;
    const definedPoints = questionPointsByActivity.get(group.activityId) ?? [];
    // Prefer the published question weights; historic activities can fall back
    // to the maximum recorded for submitted graded attempts.
    const questionMax = definedPoints.length === questionIds.size && questionIds.size > 0
      ? definedPoints.reduce((total, points) => total + points, 0) : null;
    const maxScore = questionMax ?? (gradedMaxima.length ? Math.max(...gradedMaxima) : null);
    const averageScore = submittedTeams && maxScore !== null
      ? (totalGradeRatio / submittedTeams) * maxScore : null;
    const className = classes.find((c) => c.id === group.classId)?.name ?? "";
    rows.push({
      key, classId: group.classId, className,
      title: activityById.get(group.activityId)?.title ?? "",
      submittedTeams, correctAnswers, totalQuestions,
      questionCount: questionIds.size, maxScore, averageScore,
      percent: totalQuestions ? Math.round(correctAnswers / totalQuestions * 1000) / 10 : null,
    });
  }
  return rows.sort((a, b) =>
    a.title.localeCompare(b.title, "pt-BR") || a.className.localeCompare(b.className, "pt-BR"),
  );
}

export default function ActivityAccuracy({ classes, data, classFilter }: {
  classes: Class[];
  data: ActivityAccuracyData;
  classFilter: string;
}) {
  const rows = calculateActivityAccuracy(classes, data, classFilter);
  return (
    <section className="activity-accuracy" aria-label="Média de acertos por atividade">
      <h2>Desempenho por atividade</h2>
      <p className="muted">Resumo privado da equipe pedagógica. Cada dupla conta uma vez por atividade, considerando sua melhor entrega avaliada. A nota média respeita a pontuação de cada atividade; tentativas não enviadas são desconsideradas.</p>
      {rows.length === 0 ? <p>Nenhuma atividade disponível para o filtro selecionado.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Atividade</th><th>Turma</th><th>Duplas que entregaram</th>
              <th>Questões por atividade</th><th>Nota máxima</th><th>Nota média</th><th>Aproveitamento</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.title}</th>
                  <td>{row.className}</td>
                  <td>{row.submittedTeams}</td>
                  <td>{row.questionCount}</td>
                  <td>{row.maxScore === null ? "—" : row.maxScore.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                  <td>{row.averageScore === null ? "Sem entregas" :
                    row.averageScore.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{row.percent === null ? "—" :
                    row.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
