import type { Class } from "./api";

export const SCORING_PLAN = [
  { label: "Atividades avaliativas", detail: "16 listas × 10 pontos", raw: 160, final: 200, weight: 20 },
  { label: "CTF 1 — Iniciante", detail: "1 evento", raw: 200, final: 200, weight: 20 },
  { label: "CTF 2 — Intermediário", detail: "1 evento", raw: 250, final: 250, weight: 25 },
  { label: "CTF 3 — Avançado", detail: "1 evento", raw: 350, final: 350, weight: 35 },
] as const;

type Team = { id: string; class_id: string };
type Session = { id: string; class_ids: string[] };
type Attempt = { id: string; team_id: string; activity_session_id: string; submitted_at: string | null };
type Grade = { attempt_id: string; points: number; max_points: number };
type Question = { id: string; activity_id: string };
type Activity = { id: string };
type Answer = { attempt_id: string; question_id: string; option_id: string };
type Option = { id: string; is_correct: boolean };
type SessionWithActivity = Session & { activity_id: string };

export type ClassAccuracy = {
  id: string; name: string; activitiesWithSubmissions: number;
  teamCount: number; submittedTeams: number; checkedAnswers: number;
  correctAnswers: number; percent: number;
};
export function classAccuracy(
  classes: Class[],
  data: {
    teams: Team[]; sessions: SessionWithActivity[];
    activities: Activity[]; attempts: Attempt[];
    grades: Grade[]; questions: Question[]; answers: Answer[]; options: Option[];
  },
): ClassAccuracy[] {
  const gradeMap = new Map(data.grades.map((g) => [g.attempt_id, g]));
  const optionMap = new Map(data.options.map((o) => [o.id, o.is_correct]));
  const answersByAttempt = new Map<string, Answer[]>();
  for (const ans of data.answers) {
    const list = answersByAttempt.get(ans.attempt_id) ?? [];
    list.push(ans);
    answersByAttempt.set(ans.attempt_id, list);
  }
  const teamMap = new Map(data.teams.map((team) => [team.id, team]));
  const sessionMap = new Map(data.sessions.map((s) => [s.id, s]));
  const best = new Map<string, Attempt>();
  for (const a of data.attempts.filter((item) => !!item.submitted_at && gradeMap.has(item.id))) {
    const team = teamMap.get(a.team_id);
    const session = sessionMap.get(a.activity_session_id);
    if (!team || !session || !session.class_ids.includes(team.class_id)) continue;
    const key = a.team_id + ":" + session.id;
    const existing = best.get(key);
    const ratio = (g: Grade | undefined) => g?.max_points ? g.points / g.max_points : 0;
    if (!existing || ratio(gradeMap.get(a.id)) > ratio(gradeMap.get(existing.id))) best.set(key, a);
  }
  return classes.map((c) => {
    const teamsInClass = data.teams.filter((t) => t.class_id === c.id);
    const attempts = [...best.values()].filter((a) => teamMap.get(a.team_id)?.class_id === c.id);
    let checkedAnswers = 0;
    let correctAnswers = 0;
    for (const attempt of attempts) {
      const sess = sessionMap.get(attempt.activity_session_id);
      const numberOfQuestions = data.questions.filter((q) => q.activity_id === sess?.activity_id).length;
      if (!numberOfQuestions) continue;
      checkedAnswers += numberOfQuestions;
      correctAnswers += (answersByAttempt.get(attempt.id) ?? [])
        .filter((answer) => optionMap.get(answer.option_id) === true).length;
    }
    return {
      id: c.id, name: c.name,
      activitiesWithSubmissions: new Set(attempts.map((a) => a.activity_session_id)).size,
      teamCount: teamsInClass.length,
      submittedTeams: new Set(attempts.map((a) => a.team_id)).size,
      checkedAnswers, correctAnswers,
      percent: checkedAnswers ? Math.round(1000 * correctAnswers / checkedAnswers) / 10 : 0,
    };
  });
}

export function ScoringOverview({ classes, data }: {
  classes: Class[];
  data: Parameters<typeof classAccuracy>[1];
}) {
  const stats = classAccuracy(classes, data);
  return (
    <section className="card" aria-label="Pesos da avaliação e médias por turma">
      <h2>Composição da avaliação — próximo ciclo</h2>
      <p>Os pontos já exibidos no ranking pertencem às atividades avaliativas anteriores.
        Eles serão preservados como histórico, sem conversão automática em CTF e sem
        duplicação nas novas listas.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Avaliação</th><th>Quantidade</th><th>Bruto máximo</th><th>Placar final</th><th>Peso</th></tr></thead>
          <tbody>
            {SCORING_PLAN.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.detail}</td><td>{r.raw} pts</td><td>{r.final} pts</td><td>{r.weight}%</td>
              </tr>
            ))}
            <tr><th scope="row">Total geral</th><td>16 listas + 3 CTFs</td>
              <td>960 pts</td><td><strong>1.000 pts</strong></td><td><strong>100%</strong></td></tr>
          </tbody>
        </table>
      </div>
      <p className="muted">Listas: 160 pontos brutos × 1,25 = 200 pontos. O CTF soma 800 pontos,
        distribuídos em 200 + 250 + 350. Nenhuma pontuação histórica foi recalculada.</p>
      <h3>Acertos nas atividades por turma</h3>
      <p className="muted">Média de questões corretas nas melhores entregas de cada dupla e aula.
        Tentativas não enviadas são excluídas; o quadro é exclusivo da equipe autorizada.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Turma</th><th>Duplas participantes</th><th>Aulas respondidas</th><th>Acertos</th><th>Média de acertos</th></tr></thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.id}><th scope="row">{row.name}</th>
                <td>{row.submittedTeams} de {row.teamCount}</td>
                <td>{row.activitiesWithSubmissions}</td>
                <td>{row.correctAnswers} / {row.checkedAnswers}</td>
                <td>{row.checkedAnswers ? row.percent.toLocaleString("pt-BR") + "%" : "Sem entregas"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
