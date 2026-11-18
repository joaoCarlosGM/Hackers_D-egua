import { useState } from "react";
import { assessmentPointsFromRatios } from "./ranking";
import "./score-calculator.css";

const lessons = Array.from({ length: 16 }, (_, index) => ({
  title: `Atividade ${String(index + 1).padStart(2, "0")}`,
  maximum: index === 1 ? 8 : 10,
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
  const ratios = grades.flatMap((grade, index) => grade.trim() === "" ? [] :
    [Number(grade) / lessons[index].maximum]);
  const invalidGrades = grades.some((grade, index) => grade.trim() !== "" &&
    (!Number.isFinite(Number(grade)) || Number(grade) < 0 || Number(grade) > lessons[index].maximum));
  const invalidMakeup = makeupGrade.trim() !== "" && (!Number.isFinite(Number(makeupGrade)) || Number(makeupGrade) < 0 || Number(makeupGrade) > 10);
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
        <p>O aproveitamento é da sua dupla, não da média da turma. Simule as avaliações (até 200 pontos) e os três CTFs (até 800 pontos). Nenhum dado digitado é enviado ou salvo.</p>
      </div>
      <div className="score-calculator-layout">
        <section className="card score-calculator-form">
          <h2>Atividades avaliativas</h2>
          <p className="muted">Digite a nota original. Atividade 02 vale 8; as demais, 10. Deixe em branco o que ainda não foi aplicado. Digite 0 para uma atividade aplicada e não entregue.</p>
          <div className="score-calculator-fields">
            {lessons.map((lesson, index) => ({ ...lesson, index })).filter(({ index }) => expanded || (index >= 1 && index <= 3)).map(({ title, maximum, index }) => (
              <label className="score-calculator-grade" key={index}>
                <span>{title}</span>
                <span className="score-calculator-input">
                  <input type="number" min={0} max={maximum} step="0.01"
                    value={grades[index]} placeholder="—" inputMode="decimal"
                    aria-label={`Nota ${title}`}
                    onChange={event => editGrade(index, event.target.value)}/>
                  <span>/ {maximum}</span>
                </span>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Mostrar somente atividades 02 a 04" : "Exibir todas as 16 atividades"}
          </button>
          <div className="score-calculator-makeup">
            <h2>Recuperação de nota</h2>
            <p className="muted">Uma única avaliação de recuperação, com 20 questões valendo 10 pontos no total. Informe apenas sua nota para consultar o aproveitamento. Esta nota não é somada automaticamente às atividades regulares: a substituição de uma falta depende de validação da equipe pedagógica.</p>
            <label className="score-calculator-grade">
              <span>Nota da recuperação</span>
              <span className="score-calculator-input">
                <input type="number" min={0} max={10} step="0.01" inputMode="decimal"
                  value={makeupGrade} placeholder="—" aria-label="Nota da recuperação"
                  onChange={event => setMakeupGrade(event.target.value)} />
                <span>/ 10</span>
              </span>
            </label>
            {makeupGrade.trim() !== "" && !invalidMakeup && (
              <p>Seu aproveitamento na recuperação: <strong>{formatNumber(Number(makeupGrade) * 10)}%</strong>.</p>
            )}
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
          {!valid && <p role="alert" className="error">Confira os valores. As notas e os CTFs precisam respeitar os limites indicados, inclusive a recuperação de 0 a 10.</p>}
          <button type="button" onClick={() => {setGrades(Array(16).fill(""));setCtfs(["0","0","0"]);setMakeupGrade("");}}>
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
            <div><dt>Recuperação (informativa)</dt><dd>{makeupGrade.trim() !== "" && !invalidMakeup ? `${formatNumber(Number(makeupGrade))}/10` : "Não informada"}</dd></div>
          </dl>
          <p className="muted">Modelo legado: somamos os percentuais de cada atividade elegível da sua dupla, dividimos pelo número de atividades elegíveis, arredondamos para o múltiplo de 5% mais próximo e multiplicamos por 2. Exemplo: 81,67% vira 80%, ou 160 pontos. O ranking real também considera atividades elegíveis não entregues como zero.</p>
          <p className="muted">O saldo de CTF no ranking é registrado de forma agregada. Os limites por CTF mostrados nesta simulação são metas pedagógicas, não uma confirmação do detalhamento de pontos registrado no banco.</p>
        </aside>
      </div>
    </section>
  );
}
