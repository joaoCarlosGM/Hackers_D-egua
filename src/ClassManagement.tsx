import { useCallback, useEffect, useState, type FormEvent } from "react";
import { rpc, type ManagedClass } from "./api";
export function classSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
}
export default function ClassManagement({
  canManage,
  onChanged,
  onInspect,
}: {
  canManage: boolean;
  onChanged?: () => Promise<void>;
  onInspect: (id: string) => void;
}) {
  const [classes, setClasses] = useState<ManagedClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [deleting, setDeleting] = useState<ManagedClass | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const load = useCallback(async () => {
    const all: ManagedClass[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await rpc<ManagedClass[]>("list_classes_admin", {
        p_offset: offset,
        p_limit: 500,
      });
      all.push(...page);
      if (page.length < 500) break;
    }
    setClasses(all);
  }, []);
  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  async function change(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      await onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    await change(async () => {
      await rpc("create_class", { p_name: name, p_slug: slug });
      setName("");
      setSlug("");
      setSlugEdited(false);
      setNotice("Turma criada. Ela já pode receber novas duplas.");
    });
  }
  return (
    <section className="card class-management" aria-label="Gerenciar turmas">
      <h2>Gerenciar turmas</h2>
      <p>
        Arquivar interrompe novos cadastros e preserva integrantes, notas,
        pontos CTF e todo o histórico. Duplas existentes continuam usando seu
        cadastro original.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {!canManage && (
        <p>
          Consulta disponível para professores. Criar, editar, arquivar,
          reativar e excluir turmas exige perfil de administrador.
        </p>
      )}
      {canManage && (
        <form onSubmit={create} className="class-create">
          <h3>Nova turma</h3>
          <div className="grid">
            <label>
              Nome da nova turma
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(classSlug(e.target.value));
                }}
                disabled={busy}
              />
            </label>
            <label>
              Identificador da nova turma
              <input
                required
                minLength={1}
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value);
                }}
                disabled={busy}
              />
            </label>
          </div>
          <p className="muted">
            O identificador é único e permanece estável após renomear a turma.
          </p>
          <button className="primary" disabled={busy}>
            Criar turma
          </button>
        </form>
      )}
      <button
        disabled={busy || loading}
        onClick={() => {
          setError("");
          void load().catch((e) => setError(e.message));
        }}
      >
        Atualizar turmas
      </button>
      {loading ? (
        <p>Carregando turmas…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption>Turmas ativas e arquivadas</caption>
            <thead>
              <tr>
                <th>Turma</th>
                <th>Estado</th>
                <th>Duplas</th>
                <th>Participações</th>
                <th>Atividades</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <small className="class-slug">{c.slug}</small>
                    {canManage && (
                      <form
                        key={c.name}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void change(async () => {
                            await rpc("rename_class", {
                              p_class_id: c.id,
                              p_name: f.get("name"),
                            });
                            setNotice(
                              "Nome atualizado sem alterar os vínculos da turma.",
                            );
                          });
                        }}
                      >
                        <label>
                          Nome da turma {c.name}
                          <input
                            name="name"
                            required
                            maxLength={120}
                            defaultValue={c.name}
                            disabled={busy}
                          />
                        </label>
                        <button disabled={busy}>Salvar nome</button>
                      </form>
                    )}
                  </td>
                  <td>
                    <span className={`class-status ${c.status}`}>
                      {c.status === "active" ? "Ativa" : "Arquivada"}
                    </span>
                  </td>
                  <td>{c.team_count}</td>
                  <td>{c.attempt_count}</td>
                  <td>{c.activity_count}</td>
                  <td>
                    <div className="class-actions">
                      <button onClick={() => onInspect(c.id)}>
                        Consultar dados
                      </button>
                      {canManage && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void change(async () => {
                                await rpc("set_class_status", {
                                  p_class_id: c.id,
                                  p_status:
                                    c.status === "active"
                                      ? "archived"
                                      : "active",
                                });
                                setNotice(
                                  c.status === "active"
                                    ? "Turma arquivada. O histórico foi preservado."
                                    : "Turma reativada para novos cadastros.",
                                );
                              })
                            }
                          >
                            {c.status === "active" ? "Arquivar" : "Reativar"}
                          </button>
                          <button
                            disabled={busy || !c.can_delete}
                            title={
                              c.can_delete
                                ? "Excluir uma turma sem vínculos"
                                : "Há vínculos: arquive para preservar os dados."
                            }
                            onClick={() => {
                              setDeleting(c);
                              setConfirmation("");
                              setError("");
                            }}
                          >
                            Excluir turma
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deleting && (
        <section
          className="confirmation"
          role="region"
          aria-label="Confirmar exclusão definitiva"
        >
          <h3>Excluir definitivamente {deleting.name}?</h3>
          <p>
            A exclusão só será aceita se a turma continuar sem duplas,
            participações, atividades ou ranking vinculados. Nenhum registro
            relacionado será apagado.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmation !== `EXCLUIR ${deleting.slug}`) return;
              void change(async () => {
                await rpc("delete_class", {
                  p_class_id: deleting.id,
                  p_confirmation: confirmation,
                });
                setDeleting(null);
                setConfirmation("");
                setNotice(
                  "Turma sem vínculos excluída. A operação foi registrada em auditoria.",
                );
              });
            }}
          >
            <label>
              Digite EXCLUIR {deleting.slug}
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <button
              disabled={busy || confirmation !== `EXCLUIR ${deleting.slug}`}
            >
              Excluir definitivamente
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeleting(null);
                setConfirmation("");
              }}
            >
              Cancelar exclusão
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
