import { useState } from "react";
import type { DraftQuestion } from "./utils";
export default function ActivityPreview({
  questions,
  onClose,
}: {
  questions: DraftQuestion[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const q = questions[index];
  return (
    <section className="card quiz" aria-label="Pré-visualização da atividade">
      <h2>Pré-visualização · sem registrar participação</h2>
      {q && (
        <>
          <p>
            Questão {index + 1} de {questions.length}
          </p>
          <h3>{q.prompt || "Enunciado ainda não preenchido"}</h3>
          <div className="quiz-options">
            {q.options.map((o, i) => (
              <button
                key={i}
                aria-pressed={selected === i}
                className={`quiz-option option-${i % 4} ${selected === i ? "selected" : ""}`}
                onClick={() => setSelected(i)}
              >
                {o.label || `Alternativa ${i + 1}`}
              </button>
            ))}
          </div>
          <button
            disabled={index === 0}
            onClick={() => {
              setIndex(index - 1);
              setSelected(null);
            }}
          >
            Anterior
          </button>
          <button
            disabled={index === questions.length - 1}
            onClick={() => {
              setIndex(index + 1);
              setSelected(null);
            }}
          >
            Próxima
          </button>
        </>
      )}
      <button onClick={onClose}>Fechar pré-visualização</button>
    </section>
  );
}
