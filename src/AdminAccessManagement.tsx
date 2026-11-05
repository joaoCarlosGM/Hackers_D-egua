import { useCallback, useEffect, useState, type FormEvent } from "react";
import { rpc } from "./api";

export type StaffAccount = {
  user_id: string;
  email: string;
  role: "admin" | "teacher";
  granted_at: string;
};

export default function AdminAccessManagement({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [users, setUsers] = useState<StaffAccount[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffAccount["role"]>("teacher");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<StaffAccount | null>(null);
  const [typedEmail, setTypedEmail] = useState("");

  const load = useCallback(async () => {
    const all: StaffAccount[] = [];
    for (let offset = 0; ; offset += 200) {
      const batch = await rpc<StaffAccount[]>("list_staff_accounts", {
        p_offset: offset,
        p_limit: 200,
      });
      all.push(...batch);
      if (batch.length < 200) break;
    }
    setUsers(all);
  }, []);

  useEffect(() => {
    void load()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedEmail = email.trim();
    void run(async () => {
      await rpc("authorize_staff_account", {
        p_email: requestedEmail,
        p_role: role,
      });
      setNotice(
        "Acesso autorizado. A pessoa já pode entrar com sua conta Supabase Auth. Se a sessão estiver aberta, deverá reverificar o acesso.",
      );
      setEmail("");
      setRole("teacher");
    });
  }

  return (
    <div className="admin-access">
      <section className="card">
        <h2>Autorizar uma conta existente</h2>
        <p>
          O cadastro em Supabase Authentication não dá acesso às notas
          automaticamente. Primeiro crie ou convide a conta em
          <strong> Supabase → Authentication → Users</strong>, depois autorize
          o e-mail aqui.
        </p>
        <p>
          O site não cria senhas e não disponibiliza cadastro administrativo
          público. Esta operação é exclusiva de administradores autorizados.
        </p>
        <form onSubmit={authorize}>
          <label>
            E-mail cadastrado no Supabase Auth
            <input type="email" required maxLength={320} autoComplete="off"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="professor@exemplo.com" disabled={busy} />
          </label>
          <label>
            Permissão
            <select value={role} disabled={busy}
              onChange={(e) => setRole(e.target.value as StaffAccount["role"])}>
              <option value="teacher">Professor — avaliações e notas</option>
              <option value="admin">Administrador — gestão completa</option>
            </select>
          </label>
          <button className="primary" disabled={busy || !email.trim()}>
            Autorizar acesso
          </button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
      <section className="card" aria-label="Contas autorizadas">
        <div className="toolbar">
          <h2>Equipe autorizada</h2>
          <button type="button" disabled={busy || loading}
            onClick={() => void load().catch((e: Error) => setError(e.message))}>
            Atualizar lista
          </button>
        </div>
        {loading ? (
          <p>Carregando usuários…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>E-mail</th><th>Perfil</th><th>Autorizado em</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <td>{user.email}{user.user_id === currentUserId ? " (você)" : ""}</td>
                    <td>{user.role === "admin" ? "Administrador" : "Professor"}</td>
                    <td>{new Date(user.granted_at).toLocaleDateString("pt-BR")}</td>
                    <td>
                      {user.user_id === currentUserId ? (
                        <span>Sua própria autorização é protegida</span>
                      ) : (
                        <div className="toolbar">
                          <button type="button" disabled={busy}
                            onClick={() => {
                              setEmail(user.email);
                              setRole(user.role === "admin" ? "teacher" : "admin");
                              setNotice("Confira o e-mail e o novo perfil antes de confirmar no formulário acima.");
                              setError("");
                            }}>
                            Alterar perfil
                          </button>
                          <button type="button" disabled={busy}
                            onClick={() => {
                              setPending(user);
                              setTypedEmail("");
                            }}>
                            Revogar acesso
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr><td colSpan={4}>Nenhuma conta autorizada encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Revogar o acesso não exclui a conta do Supabase Auth nem altera
          atividades, notas ou auditorias. Uma sessão já aberta perderá a
          permissão para operações protegidas no banco.
        </p>
      </section>
      {pending && (
        <section className="card" aria-label="Confirmar revogação de acesso">
          <h2>Revogar permissão de {pending.email}?</h2>
          <p>Essa pessoa deixará de acessar o painel pedagógico.</p>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (typedEmail !== pending.email) return;
            void run(async () => {
              await rpc("revoke_staff_account", { p_user_id: pending.user_id });
              setNotice("Acesso revogado. A conta Auth e o histórico foram preservados.");
              setPending(null);
              setTypedEmail("");
            });
          }}>
            <label>
              Digite o e-mail {pending.email} para confirmar
              <input required autoComplete="off" value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)} disabled={busy} />
            </label>
            <button disabled={busy || typedEmail !== pending.email}>Confirmar revogação</button>
            <button type="button" disabled={busy}
              onClick={() => { setPending(null); setTypedEmail(""); }}>
              Cancelar
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
