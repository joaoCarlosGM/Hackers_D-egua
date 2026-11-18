import { useState } from "react";
import { assessmentPointsFromRatios } from "./ranking";
import "./score-calculator.css";

const lessons = Array.from({ length: 16 }, (_, index) => ({
  title: index === 0 ? "Aula 02" : index === 1 ? "Aula 03" : index === 2 ? "Aula 04" : `Atividade ${index + 1}`,
  maximum: index === 0 ? 8 : 10,
}));

function formatNumber(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default function ScoreCalculator() {
  // Empty fields represent assessments that have not yet been applied.
  // Enter 0 for an eligible assessment not delivered.
  const [grades, setGrades] = useState<string[]>(Array(16).fill(""));
  const [ctfs, setCtfs] = useState<string[]>(["0", "0", "0"]);
  const [expanded, setExpanded] = useState(false);
  const ratios = grades.flatMap((grade, index) => grade.trim() === "" ? [] :
    [Number(grade) / lessons[index].maximum]);
  const invalidGrades = grades.some((grade, index) => grade.trim() !== "" &&
    (!Number.isFinite(Number(grade)) || Number(grade) < 0 || Number(grade) > lessons[index].maximum));
  const ctfLimits = [200, 250, 350];
  const invalidCtfs = ctfs.some((value, index) => value.trim() === "" ||
    !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > ctfLimits[index]);
  const valid = !invalidGrades && !invalidCtfs;
  const assessment = assessmentPointsFromRatios(ratios);
  const ctfPoints = ctfs.reduce((total, n) => total + (Number(n) || 0), 0);
  const total = assessment.points + ctfPoints;
  function editGrade(index: number, value: string) {
    setGrades(previous => previous.map((grade, i) => i === index ? value : grade));
  }
  function editCtf(index: number, value: string) {
    setCtfs(previous => previous.map((score, i) => i === index ? value : score));
  }
  return (
    <section className="score-calculator" aria-label="Calculadora de pontos">
      <div className="score-calculator-intro">
        <p className="eyebrow">SIMULAÇÃO · SEM ALTERAR NOTAS</p>
        <h1>Calculadora de pontos</h1>
        <p>Simule o aproveitamento das avaliações (até 200 pontos) e os três CTFs (até 800 pontos). Nenhum dado digitado é enviado ou salvo.</p>
      </div>
      <div className="score-calculator-layout">
        <section className="card score-calculator-form">
          <h2>Atividades avaliativas</h2>
          <p className="muted">Digite a nota original. Aula 02 vale 8; as demais, 10. Deixe em branco o que ainda não foi aplicado. Digite 0 para uma atividade aplicada e não entregue.</p>
          <div className="score-calculator-fields">
            {lessons.slice(0, expanded ? 16 : 3).map((lesson, index) => (
              <label className="score-calculator-grade" key={index}>
                <span>{lesson.title}</span>
                <span className="score-calculator-input">
                  <input type="number" min={0} max={lesson.maximum} step="0.01"
                    value={grades[index]} placeholder="—" inputMode="decimal"
                    aria-label={`Nota ${lesson.title}`}
                    onChange={event => editGrade(index, event.target.value)}/>
                  <span>/ {lesson.maximum}</span>
                </span>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Ocultar próximas atividades" : "Preencher as 13 próximas atividades"}
          </button>
          <p className="muted">Reposição de 20 questões: nota máxima 10. Para simular uma substituição, preencha a nota na atividade original que ela substitui, em vez de somá-la como 17ª atividade.</p>
          <h2>CTFs</h2>
          <div className="score-calculator-fields">
            {ctfLimits.map((limit, index) => (
              <label className="score-calculator-grade" key={index}>
                <span>{`CTF ${index + 1}`}</span>
                <span className="score-calculator-input">
                  <input type="number" min={0} max={limit} step="1"
                    inputMode="numeric" value={ctfs[index]}
                    aria-label={`Pontos CTF ${index + 1}`}
                    onChange={event => editCtf(index, event.target.value)}/>
                  <span>/ {limit}</span>
                </span>
              </label>
            ))}
          </div>
          {!valid && <p role="alert" className="error">Confira os valores: cada nota e CTF deve estar entre zero e seu máximo.</p>}
          <button type="button" onClick={() => {setGrades(Array(16).fill(""));setCtfs(["0","0","0"]);}}>
            Limpar simulação
          </button>
        </section>
        <aside className="card score-calculator-results" aria-live="polite">
          <h2>Resultado simulado</h2>
          <div className="score-calculator-total">{valid ? formatNumber(total) : "—"} <small>/ 1.000 pontos</small></div>
          <dl>
            <div><dt>Atividades</dt><dd>{valid ? formatNumber(assessment.points) : "—"} / 200</dd></div>
            <div><dt>Aproveitamento médio</dt><dd>{valid && ratios.length ? formatNumber(assessment.average * 100) + "%" : "—"}</dd></div>
            <div><dt>Aproveitamento arredondado</dt><dd>{valid && ratios.length ? assessment.band + "%" : "—"}</dd></div>
            <div><dt>CTFs</dt><dd>{valid ? formatNumber(ctfPoints) : "—"} / 800</dd></div>
            <div><dt>Atividades informadas</dt><dd>{ratios.length} / 16</dd></div>
          </dl>
          <p className="muted">Modelo legado: a média dos percentuais das atividades informadas é arredondada em faixas de 5%, e cada 1% representa 2 pontos no ranking. O ranking real também pode considerar atividades elegíveis não entregues como zero.</p>
          <p className="muted">O saldo de CTF no ranking é registrado de forma agregada. Os limites por CTF mostrados nesta simulação são metas pedagógicas, não uma confirmação do detalhamento de pontos registrado no banco.</p>
        </aside>
      </div>
    </section>
  );
}
