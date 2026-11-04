import { useCallback, useEffect, useState } from "react";
import { rpc, supabase, type AssessmentResults } from "./api";
import { csv, download } from "./utils";
export default function Results({ activityId }: { activityId: string }) {
  const [data, setData] = useState<AssessmentResults | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await rpc<AssessmentResults>("assessment_results", {
      p_activity_id: activityId,
    });
    setData(r);
    setError("");
  }, [activityId]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        void load().catch((e) => {
          if (active) setError(e.message);
        });
    };
    refresh();
    const channel = supabase!
      .channel(`assessment-results:${activityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assessment_updates" },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
        if (active && status === "CHANNEL_ERROR")
          setError(
            "Conexão em tempo real indisponível. Reconectando; a atualização periódica continua ativa.",
          );
      });
    // Recovery for dropped WebSocket events; do not rely on a single notification.
    const timer = setInterval(refresh, 15000);
    addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      removeEventListener("focus", refresh);
      void supabase!.removeChannel(channel);
    };
  }, [activityId, load]);
  async function retry(id: string) {
    setBusy(true);
    try {
      await rpc("authorize_retry", { p_attempt_id: id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section>
        <a href="#admin">Voltar à administração</a>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>Carregando resultados privados…</p>
        )}
      </section>
    );
  const delivered = data.participants.filter((p) => p.points !== null);
  const started = new Set(data.participants.map((p) => p.team_id)).size;
  const completed = new Set(delivered.map((p) => p.team_id)).size;
  const average = delivered.length
    ? delivered.reduce((sum, p) => sum + p.points!, 0) / delivered.length
    : null;
  function exportCsv() {
    if (!data) return;
    download(
      "avaliacao-resultados-privados.csv",
      csv([
        [
          "Atividade",
          "Dupla UUID",
          "Dupla",
          "Turma",
          "Participante 1",
          "Participante 2",
          "Tentativa",
          "Nota",
          "Máximo",
          "Início",
          "Entrega",
        ],
        ...data.participants.map((p) => [
          data.title,
          p.team_id,
          p.public_name,
          p.class_name,
          ...p.members,
          p.submission_no,
          p.points,
          p.max_points,
          p.started_at,
          p.points !== null ? p.submitted_at : null,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
  }
  return (
    <section className="results">
      <a href="#admin">Voltar à administração</a>
      <h1>{data.title} · Resultados</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="stats">
        {[
          ["Duplas cadastradas nas turmas", data.registered_teams],
          ["Duplas que iniciaram", started],
          ["Duplas que concluíram", completed],
          ["Entregas recebidas", delivered.length],
          ["Média das entregas", average === null ? "—" : average.toFixed(2)],
        ].map(([label, value]) => (
          <article className="card" key={label}>
            <strong>{value}</strong>
            <p>{label}</p>
          </article>
        ))}
      </div>
      <div className="toolbar">
        <button onClick={exportCsv}>Exportar CSV privado</button>
        <button onClick={() => void load().catch((e) => setError(e.message))}>
          Atualizar agora
        </button>
      </div>
      <p className="muted">
        Notas pedagógicas privadas; sem conversão em pontos CTF. A média e os
        acertos consideram todas as entregas, inclusive novas tentativas
        autorizadas.
      </p>
      <section className="card">
        <h2>Acertos por questão</h2>
        {data.question_stats.map((q) => (
          <p key={q.id}>
            {q.prompt}:{" "}
            <strong>
              {q.responses ? ((100 * q.correct) / q.responses).toFixed(1) : "0"}
              %
            </strong>{" "}
            ({q.correct}/{q.responses})
          </p>
        ))}
      </section>
      <section className="card">
        <h2>Duplas e respostas</h2>
        {data.participants.map((p) => (
          <article className="item" key={p.attempt_id}>
            <h3>
              {p.public_name} · {p.class_name}
            </h3>
            <p>{p.members.join(" e ")}</p>
            <p>
              Tentativa {p.submission_no} · Início:{" "}
              {new Date(p.started_at).toLocaleString("pt-BR")} ·{" "}
              {p.points !== null
                ? `Nota: ${p.points}/${p.max_points} · Entrega: ${new Date(p.submitted_at!).toLocaleString("pt-BR")}`
                : p.submitted_at
                  ? "Encerrada sem entrega"
                  : "Em andamento"}
            </p>
            <details>
              <summary>Consultar respostas</summary>
              {p.answers?.map((a) => (
                <p key={a.question_id}>
                  {a.prompt}: <strong>{a.selected}</strong> ·{" "}
                  {a.correct ? "Acertou" : "Errou"}
                  {a.explanation && <span> · {a.explanation}</span>}
                </p>
              ))}
            </details>
            <button
              disabled={busy || p.retry_available}
              onClick={() => {
                if (
                  confirm(
                    `Liberar nova tentativa para ${p.public_name}? O histórico será preservado.`,
                  )
                )
                  void retry(p.attempt_id);
              }}
            >
              {p.retry_available
                ? "Nova tentativa liberada"
                : "Liberar nova tentativa"}
            </button>
          </article>
        ))}
      </section>
      <section className="card">
        <h2>Liberação posterior do resultado</h2>
        <p>
          A dupla só poderá consultar a própria nota quando a sessão estiver
          encerrada ou arquivada e esta opção estiver habilitada.
        </p>
        {data.sessions.map((s) => (
          <label className="check" key={s.id}>
            <input
              type="checkbox"
              checked={s.release_results}
              onChange={async (e) => {
                try {
                  await rpc("set_result_release", {
                    p_session_id: s.id,
                    p_release: e.target.checked,
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
            Liberar resultado · código {s.access_code}
          </label>
        ))}
      </section>
      <p className="muted">
        Google Drive: exportação privada preparada em CSV. Nenhum arquivo é
        enviado automaticamente; a futura integração deverá usar OAuth/Edge
        Function e uma pasta privada autorizada.
      </p>
    </section>
  );
}
