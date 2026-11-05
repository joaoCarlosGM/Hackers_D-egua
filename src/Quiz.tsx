import { useEffect, useState } from "react";
import { rpc, type Activity, type Participation, type Team } from "./api";
import { useAttemptDraft } from "./hooks/useAttemptDraft";
export default function Quiz({
  activity,
  team,
  participation,
  onComplete,
}: {
  activity: Activity;
  team: Team;
  participation: Participation;
  onComplete: () => void | Promise<void>;
}) {
  const { draft, setDraft, sync, syncError, syncing, dirty, online, clear } =
    useAttemptDraft(team.token, participation);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState<number | null>(null);
  const [clockOffset] = useState(() =>
    participation.server_now
      ? Date.parse(participation.server_now) - Date.now()
      : 0,
  );
  useEffect(() => {
    if (!participation.deadline) return;
    const tick = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(participation.deadline!) - Date.now() - clockOffset) /
              1000,
          ),
        ),
      );
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [participation.deadline, clockOffset]);
  const index = Math.min(
    Math.max(0, draft.current_question),
    activity.questions.length - 1,
  );
  const q = activity.questions[index];
  if (!q) return <p role="alert">Esta atividade não possui questões.</p>;
  const answered = activity.questions.filter((q) => draft.answers[q.id]).length;
  async function finish() {
    setBusy(true);
    setError("");
    try {
      try {
        await sync();
      } catch {
        /* Final submission is authoritative; it also recovers a lost success response idempotently. */
      }
      await rpc("submit_attempt", {
        p_token: team.token,
        p_attempt_id: participation.attempt_id,
        p_answers: activity.questions.map((q) => ({
          question_id: q.id,
          option_id: draft.answers[q.id],
        })),
      });
      clear();
      await onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card quiz" aria-label="Avaliação em andamento">
      <div className="toolbar">
        <strong>
          Questão {index + 1} de {activity.questions.length}
        </strong>
        <span>{answered} respondida(s)</span>
        {seconds !== null && (
          <span role="timer">
            Tempo restante: {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      <progress
        aria-label="Progresso da avaliação"
        max={activity.questions.length}
        value={answered}
      />
      {(!online || syncError) && (
        <div role="status" className="offline">
          <p>
            {!online
              ? "Sem conexão. Respostas preservadas nesta aba; reconecte antes do prazo para enviar."
              : `Sincronização pendente: ${syncError}. As respostas continuam nesta aba.`}
          </p>
          <button
            disabled={busy || syncing}
            onClick={() => void sync().catch(() => undefined)}
          >
            Tentar sincronizar
          </button>
        </div>
      )}
      <p className="muted">
        {syncing
          ? "Salvando progresso…"
          : online && !syncError
            ? dirty
              ? "Progresso aguardando sincronização. Não feche esta aba."
              : "Progresso sincronizado automaticamente. A entrega final exige confirmação."
            : "Não feche esta aba."}
      </p>
      {seconds === 0 && (
        <p role="alert" className="error">
          Tempo encerrado. Solicite ao professor a liberação de uma nova
          tentativa.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy || seconds === 0}>
        <legend>
          {q.prompt} <small>({q.points} pontos)</small>
        </legend>
        <div
          className={`quiz-options ${q.kind === "true_false" ? "binary" : ""}`}
        >
          {q.options.map((o, i) => (
            <button
              type="button"
              className={`quiz-option option-${i % 4} ${draft.answers[q.id] === o.id ? "selected" : ""}`}
              aria-pressed={draft.answers[q.id] === o.id}
              key={o.id}
              onClick={() =>
                setDraft({
                  ...draft,
                  answers: { ...draft.answers, [q.id]: o.id },
                })
              }
            >
              <span aria-hidden="true">{["▲", "◆", "●", "■"][i % 4]}</span>{" "}
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="toolbar">
        {activity.allow_backtracking !== false && (
          <button
            disabled={index === 0 || busy}
            onClick={() => {
              setConfirming(false);
              setDraft({ ...draft, current_question: index - 1 });
            }}
          >
            Anterior
          </button>
        )}
        {index < activity.questions.length - 1 ? (
          <button
            className="primary"
            disabled={!draft.answers[q.id] || busy || seconds === 0}
            onClick={() => {
              setConfirming(false);
              setDraft({ ...draft, current_question: index + 1 });
            }}
          >
            Próxima questão
          </button>
        ) : (
          <button
            className="primary"
            disabled={
              answered !== activity.questions.length || busy || seconds === 0
            }
            onClick={() => setConfirming(true)}
          >
            Revisar e enviar
          </button>
        )}
      </div>
      {confirming && (
        <div
          className="confirmation"
          role="region"
          aria-label="Confirmação da entrega"
        >
          <h3>Confirmar envio final?</h3>
          <p>
            {answered} de {activity.questions.length} questões respondidas. Após
            enviar, as respostas não poderão ser alteradas sem liberação do
            professor.
          </p>
          <button
            className="primary"
            disabled={busy || !online || seconds === 0}
            onClick={() => void finish()}
          >
            {busy ? "Enviando…" : "Confirmar entrega"}
          </button>
          <button disabled={busy} onClick={() => setConfirming(false)}>
            Continuar respondendo
          </button>
        </div>
      )}
    </section>
  );
}
