import { useState } from "react";
import { assessmentPointsFromRatios } from "./ranking";
import "./score-calculator.css";

const lessons = Array.from({ length: 16 }, (_, index) => ({
  title: `Atividade ${String(index + 2).padStart(2, "0")}`,
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
  const [makeupGrade, setMakeupGrade] = useState("");
  const [makeupTarget, setMakeupTarget] = useState("");
  const makeupIndex = makeupTarget === "" ? -1 : Number(makeupTarget);
  const hasMakeup = makeupGrade.trim() !== "";
  const validMakeupTarget = makeupIndex >= 0 && makeupIndex < 16 && grades[makeupIndex] === "0";
  const effectiveGrades = grades.map((value, index) => hasMakeup && validMakeupTarget && index === makeupIndex ? makeupGrade : value);
  const ratios = effectiveGrades.flatMap((grade, index) => grade.trim() === "" ? [] :
    [Number(grade) / (hasMakeup && validMakeupTarget && index === makeupIndex ? 10 : lessons[index].maximum)]);
  const invalidGrades = grades.some((grade, index) => grade.trim() !== "" &&
    (!Number.isFinite(Number(grade)) || Number(grade) < 0 || Number(grade) > lessons[index].maximum));
  const invalidMakeup = (hasMakeup && (!validMakeupTarget || !Number.isFinite(Number(makeupGrade)) || Number(makeupGrade) < 0 || Number(makeupGrade) > 10)) || (!hasMakeup && makeupTarget !== "");
  const ctfLimits = [200, 250, 350];
  const invalidCtfs = ctfs.some((value, index) => value.trim() === "" ||
    !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > ctfLimits[index]);
  const valid = !invalidGrades && !invalidCtfs && !invalidMakeup;
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
          <p className="muted">Digite a nota original. Atividade 02 vale 8; as demais, 10. Deixe em branco o que ainda não foi aplicado. Digite 0 para uma atividade aplicada e não entregue.</p>
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
          <div className="score-calculator-makeup">
            <h2>Atividade de reposição</h2>
            <p className="muted">Há apenas uma reposição, com 20 questões e nota máxima 10. Ela substitui uma atividade não entregue, sem contar como atividade adicional.</p>
            <div className="score-calculator-fields">
              <label className="score-calculator-grade">
                <span>Nota da reposição</span>
                <span className="score-calculator-input">
                  <input type="number" min={0} max={10} step="0.01" inputMode="decimal"
                    value={makeupGrade} placeholder="—" aria-label="Nota da atividade de reposição"
                    onChange={event => setMakeupGrade(event.target.value)} />
                  <span>/ 10</span>
                </span>
              </label>
              <label className="score-calculator-grade">
                <span>Substituir atividade com falta</span>
                <select aria-label="Atividade substituída pela reposição"
                  value={makeupTarget} onChange={event => setMakeupTarget(event.target.value)}>
                  <option value="">Selecione uma atividade</option>
                  {lessons.map((lesson, index) => (
                    <option key={lesson.title} value={index} disabled={grades[index] !== "0"}>
                      {lesson.title}{grades[index] === "0" ? "" : " — marque falta (0) primeiro"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted">Para usar a reposição, registre 0 na atividade em que houve falta e selecione essa mesma atividade acima. A nota substitutiva entra apenas uma vez no cálculo.</p>
          </div>
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
          {!valid && <p role="alert" className="error">Confira as notas e os CTFs. A reposição exige nota de 0 a 10 e seleção de uma atividade marcada com falta (0).</p>}
          <button type="button" onClick={() => {setGrades(Array(16).fill(""));setCtfs(["0","0","0"]);setMakeupGrade("");setMakeupTarget("");}}>
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
            <div><dt>Reposição</dt><dd>{hasMakeup && validMakeupTarget ? `Substitui ${lessons[makeupIndex].title}` : "Não aplicada"}</dd></div>
          </dl>
          <p className="muted">Modelo legado: a média dos percentuais das atividades informadas é arredondada em faixas de 5%, e cada 1% representa 2 pontos no ranking. O ranking real também pode considerar atividades elegíveis não entregues como zero.</p>
          <p className="muted">O saldo de CTF no ranking é registrado de forma agregada. Os limites por CTF mostrados nesta simulação são metas pedagógicas, não uma confirmação do detalhamento de pontos registrado no banco.</p>
        </aside>
      </div>
    </section>
  );
}
