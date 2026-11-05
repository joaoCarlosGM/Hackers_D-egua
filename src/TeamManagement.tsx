import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { rpc, type Class, type ManagedTeam } from "./api";

type Credential = { access_code: string; credential: string };
type Draft = { public_name: string; member1: string; member2: string; class_id: string };

export default function TeamManagement({
  classes, canManage, selectedClassId, onChanged, onCredential,
}: {
  classes: Class[];
  canManage: boolean;
  selectedClassId: string;
  onChanged: () => Promise<void>;
  onCredential: (value: Credential) => void;
}) {
  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<ManagedTeam | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<ManagedTeam | null>(null);
  const [confirmation, setConfirmation] = useState("");

  const load = useCallback(async () => {
    const result: ManagedTeam[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await rpc<ManagedTeam[]>("list_teams_admin", {
        p_offset: offset, p_limit: 500,
      });
      result.push(...page);
      if (page.length < 500) break;
    }
    setTeams(result);
  }, []);

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return teams.filter((team) => {
      if (selectedClassId && team.class_id !== selectedClassId) return false;
      if (!showInactive && team.status === "inactive") return false;
      return !term || [team.public_name, team.access_code, team.member1, team.member2]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [teams, selectedClassId, showInactive, query]);

  async function change(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function edit(team: ManagedTeam) {
    setEditing(team);
    setDeleting(null);
    setDraft({
      public_name: team.public_name,
      member1: team.member1 ?? "",
      member2: team.member2 ?? "",
      class_id: team.class_id,
    });
    setError("");
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !draft) return;
    void change(async () => {
      await rpc("update_team", {
        p_team_id: editing.id,
        p_public_name: draft.public_name,
        p_member1: draft.member1,
        p_member2: draft.member2,
        p_class_id: draft.class_id,
      });
      setEditing(null);
      setDraft(null);
      setNotice("Cadastro atualizado sem alterar notas, credenciais ou histórico.");
    });
  }

  return (
    <section className="card team-management" aria-label="Gerenciar duplas">
      <h2>Gerenciar duplas</h2>
      <p>
        Cada dupla possui um único cadastro permanente. Corrija nomes, consulte
        integrantes, redefina credenciais ou desative o acesso sem apagar notas.
      </p>
      {!canManage && <p className="muted">Professores podem consultar os cadastros; alterações são restritas a administradores.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="success">{notice}</p>}
      <div className="toolbar">
        <label>
          Pesquisar duplas ou integrantes
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Apelido, integrante ou código" />
        </label>
        <label className="check">
          <input type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)} />
          Incluir desativadas
        </label>
        <button disabled={busy || loading} onClick={() => void load().catch((e: Error) => setError(e.message))}>
          Atualizar duplas
        </button>
      </div>
      {loading ? <p>Carregando duplas…</p> : (
        <>
          <p className="muted">{visible.length} dupla(s) encontrada(s)</p>
          {visible.length === 0 && <p>Nenhuma dupla corresponde aos filtros.</p>}
          {visible.map((team) => (
            <article className="item" key={team.id}>
              <h3>{team.public_name} · {classes.find((c) => c.id === team.class_id)?.name ?? "Turma não encontrada"}</h3>
              <p><strong>{team.status === "active" ? "Ativa" : "Desativada"}</strong>
                {" · "}Código: <code>{team.access_code}</code></p>
              <p>Participantes: {team.member1} e {team.member2}</p>
              <small>{team.attempt_count} participação(ões) · {team.ctf_event_count} evento(s) CTF</small>
              {canManage && (
                <div className="toolbar">
                  <button disabled={busy} onClick={() => edit(team)}>Editar cadastro</button>
                  <button disabled={busy} onClick={() => void change(async () => {
                    await rpc("set_team_status", {
                      p_team_id: team.id,
                      p_status: team.status === "active" ? "inactive" : "active",
                    });
                    setNotice(team.status === "active"
                      ? "Dupla desativada. Sessões revogadas; histórico e ranking preservados."
                      : "Dupla reativada. Use as credenciais originais para entrar.");
                  })}>
                    {team.status === "active" ? "Desativar" : "Reativar"}
                  </button>
                  <button disabled={busy} onClick={() => {
                    if (!window.confirm("Redefinir a credencial? Todas as sessões anteriores serão encerradas. Confirme a identidade dos integrantes.")) return;
                    void change(async () => {
                      const value = await rpc<Credential>("rotate_team_credential", { p_team_id: team.id });
                      onCredential(value);
                      setNotice("Nova credencial emitida. Entregue-a privadamente.");
                    });
                  }}>Emitir nova credencial</button>
                  <button disabled={busy || !team.can_delete}
                    title={team.can_delete ? "Excluir cadastro sem histórico" : "Há notas ou pontos CTF: desative para preservar o histórico."}
                    onClick={() => {
                      setDeleting(team);
                      setEditing(null);
                      setConfirmation("");
                      setError("");
                    }}>Excluir dupla</button>
                </div>
              )}
            </article>
          ))}
        </>
      )}
      {editing && draft && (
        <form onSubmit={submitEdit} className="card" aria-label="Editar dupla">
          <h3>Editar {editing.public_name}</h3>
          <label>Nome público da dupla
            <input required minLength={2} maxLength={80} value={draft.public_name}
              onChange={(e) => setDraft({ ...draft, public_name: e.target.value })}
              disabled={busy} />
          </label>
          <div className="grid">
            <label>Primeiro integrante
              <input required minLength={3} maxLength={160} value={draft.member1}
                onChange={(e) => setDraft({ ...draft, member1: e.target.value })}
                disabled={busy} />
            </label>
            <label>Segundo integrante
              <input required minLength={3} maxLength={160} value={draft.member2}
                onChange={(e) => setDraft({ ...draft, member2: e.target.value })}
                disabled={busy} />
            </label>
          </div>
          <label>Turma
            <select value={draft.class_id}
              onChange={(e) => setDraft({ ...draft, class_id: e.target.value })}
              disabled={busy || !editing.can_transfer}>
              {classes.map((c) => (
                <option key={c.id} value={c.id} disabled={c.status === "archived" && c.id !== editing.class_id}>
                  {c.name}{c.status === "archived" ? " (arquivada)" : ""}
                </option>
              ))}
            </select>
          </label>
          {!editing.can_transfer && <p className="muted">Transferência bloqueada: a dupla já possui avaliações ou pontos CTF. É possível corrigir os nomes sem alterar o histórico.</p>}
          {editing.can_transfer && draft.class_id !== editing.class_id &&
            <p className="muted">Transferir encerra sessões ativas, mas preserva código e credencial permanente.</p>}
          <button className="primary" disabled={busy}>Salvar alterações</button>
          <button type="button" disabled={busy} onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</button>
        </form>
      )}
      {deleting && (
        <section className="card" aria-label="Confirmar exclusão de dupla">
          <h3>Excluir definitivamente {deleting.public_name}?</h3>
          <p>Somente para duplas sem atividades ou pontos CTF. A operação será auditada.</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (confirmation !== "EXCLUIR " + deleting.access_code) return;
            void change(async () => {
              await rpc("delete_team", {
                p_team_id: deleting.id,
                p_confirmation: confirmation,
              });
              setDeleting(null);
              setConfirmation("");
              setNotice("Cadastro sem histórico excluído com auditoria.");
            });
          }}>
            <label>Digite EXCLUIR {deleting.access_code}
              <input required autoComplete="off" value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)} disabled={busy} />
            </label>
            <button disabled={busy || confirmation !== "EXCLUIR " + deleting.access_code}>Excluir definitivamente</button>
            <button type="button" disabled={busy}
              onClick={() => { setDeleting(null); setConfirmation(""); }}>Cancelar exclusão</button>
          </form>
        </section>
      )}
      <p className="muted">Desativar bloqueia o acesso e mantém o ranking histórico. Excluir nunca apaga notas, respostas ou pontuação CTF.</p>
    </section>
  );
}
