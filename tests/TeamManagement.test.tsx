// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedTeam, Class } from "../src/api";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  teams: [] as ManagedTeam[],
  download: vi.fn(),
}));
vi.mock("../src/api", () => ({ rpc: mock.rpc }));
vi.mock("../src/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/utils")>();
  return { ...original, download: mock.download };
});
import TeamManagement from "../src/TeamManagement";

const classes: Class[] = [
  { id: "poraque", name: "Poraquê", slug: "poraque", status: "active" },
  { id: "pitiu", name: "Pitiú", slug: "pitiu", status: "active" },
];
const onChanged = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  onChanged.mockClear();
  mock.rpc.mockReset();
  mock.download.mockReset();
  mock.teams = [
    {
      id: "t1", public_name: "Boto Cor-de-Rosa", class_id: "poraque",
      access_code: "0123456789ABCDEF", status: "active",
      member1: "Ana Silva", member2: "João Souza",
      attempt_count: 2, ctf_event_count: 1,
      can_transfer: false, can_delete: false,
    },
    {
      id: "t2", public_name: "Camuflados", class_id: "pitiu",
      access_code: "1111222233334444", status: "active",
      member1: "Maria Costa", member2: "José Lima",
      attempt_count: 0, ctf_event_count: 0,
      can_transfer: true, can_delete: true,
    },
  ];
  mock.rpc.mockImplementation(async (name: string, p: Record<string, unknown>) => {
    if (name === "list_teams_admin") {
      const offset = Number(p.p_offset);
      const limit = Number(p.p_limit);
      return mock.teams.slice(offset, offset + limit).map((t) => ({ ...t }));
    }
    if (name === "update_team") {
      mock.teams = mock.teams.map((t) => t.id === p.p_team_id
        ? { ...t, public_name: String(p.p_public_name),
            member1: String(p.p_member1), member2: String(p.p_member2),
            class_id: String(p.p_class_id) }
        : t);
    }
    if (name === "set_team_status") {
      mock.teams = mock.teams.map((t) => t.id === p.p_team_id
        ? { ...t, status: p.p_status as ManagedTeam["status"] }
        : t);
    }
    if (name === "delete_team")
      mock.teams = mock.teams.filter((t) => t.id !== p.p_team_id);
    if (name === "issue_short_team_credential") {
      mock.teams = mock.teams.map((t) => t.id === p.p_team_id
        ? { ...t, access_code: "ABCDEFGH" } : t);
      return { access_code: "ABCDEFGH", credential: "ABCDEFGHJKLM" };
    }
    return null;
  });
});
afterEach(cleanup);

function view(canManage: boolean, selectedClassId = "") {
  return render(
    <TeamManagement classes={classes} canManage={canManage}
      selectedClassId={selectedClassId}
      onChanged={onChanged} />,
  );
}

describe("team management", () => {
  it("allows teachers to consult/filter teams without edit/delete controls", async () => {
    const user = userEvent.setup();
    view(false);
    await screen.findByText(/Boto Cor-de-Rosa/);
    expect(screen.getByText(/Ana Silva e João Souza/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar cadastro" })).toBeNull();
    await user.type(screen.getByPlaceholderText("Apelido, integrante ou código"), "maria costa");
    expect(screen.getByText(/Camuflados/)).toBeTruthy();
    expect(screen.queryByText(/Boto Cor-de-Rosa/)).toBeNull();
    expect(mock.rpc).toHaveBeenCalledWith("list_teams_admin", {
      p_offset: 0, p_limit: 500,
    });
  });

  it("edits members and transfers only a team with no assessment or CTF history", async () => {
    const user = userEvent.setup();
    view(true);
    await screen.findByText(/Camuflados/);
    const article = screen.getByText(/Camuflados/).closest("article")!;
    await user.click(within(article).getByRole("button", { name: "Editar cadastro" }));
    await user.clear(screen.getByLabelText("Nome público da dupla"));
    await user.type(screen.getByLabelText("Nome público da dupla"), "Novos Camuflados");
    await user.clear(screen.getByLabelText("Primeiro integrante"));
    await user.type(screen.getByLabelText("Primeiro integrante"), "Maria Corrigida");
    await user.selectOptions(within(screen.getByRole("form", { name: "Editar dupla" })).getByLabelText("Turma"), "poraque");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText(/Novos Camuflados/);
    expect(mock.rpc).toHaveBeenCalledWith("update_team", {
      p_team_id: "t2", p_public_name: "Novos Camuflados",
      p_member1: "Maria Corrigida", p_member2: "José Lima", p_class_id: "poraque",
    });
    expect(onChanged).toHaveBeenCalled();
    await user.click(within(screen.getByText(/Boto Cor-de-Rosa/).closest("article")!)
      .getByRole("button", { name: "Editar cadastro" }));
    expect((within(screen.getByRole("form", { name: "Editar dupla" })).getByLabelText("Turma") as HTMLSelectElement).disabled).toBe(true);
  });

  it("deactivates and reactivates without deleting historical teams", async () => {
    const user = userEvent.setup();
    view(true, "poraque");
    const article = (await screen.findByText(/Boto Cor-de-Rosa/)).closest("article")!;
    await user.click(within(article).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(screen.getByText("Desativada")).toBeTruthy());
    expect(mock.rpc).toHaveBeenCalledWith("set_team_status", {
      p_team_id: "t1", p_status: "inactive",
    });
    await user.click(screen.getByRole("button", { name: "Reativar" }));
    await waitFor(() => expect(screen.getByText("Ativa")).toBeTruthy());
    expect(mock.teams).toHaveLength(2);
  });

  it("requires typed confirmation for deletion and disables it on linked teams", async () => {
    const user = userEvent.setup();
    view(true);
    const linked = (await screen.findByText(/Boto Cor-de-Rosa/)).closest("article")!;
    expect((within(linked).getByRole("button", { name: "Excluir dupla" }) as HTMLButtonElement).disabled).toBe(true);
    const empty = screen.getByText(/Camuflados/).closest("article")!;
    await user.click(within(empty).getByRole("button", { name: "Excluir dupla" }));
    expect((screen.getByRole("button", { name: "Excluir definitivamente" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    expect(mock.rpc.mock.calls.some(([name]) => name === "delete_team")).toBe(false);
    await user.click(within(empty).getByRole("button", { name: "Excluir dupla" }));
    await user.type(screen.getByLabelText("Digite EXCLUIR 1111222233334444"), "EXCLUIR 1111222233334444");
    await user.click(screen.getByRole("button", { name: "Excluir definitivamente" }));
    await waitFor(() => expect(screen.queryByText(/Camuflados/)).toBeNull());
    expect(mock.rpc).toHaveBeenCalledWith("delete_team", {
      p_team_id: "t2", p_confirmation: "EXCLUIR 1111222233334444",
    });
  });

  it("explains why test teams with historical records cannot be deleted", async () => {
    const user = userEvent.setup();
    view(true);
    const linked = (await screen.findByText(/Boto Cor-de-Rosa/)).closest("article")!;
    await user.click(within(linked).getByText("Por que não posso excluir esta dupla?"));
    expect(within(linked).getByText(/Participações em avaliação: 2/)).toBeTruthy();
    expect(within(linked).getByText(/Eventos CTF: 1/)).toBeTruthy();
    expect((within(linked).getByRole("button", { name: "Excluir dupla" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("receives per-duo short credentials only after admin issuance", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    view(true, "pitiu");
    const article = (await screen.findByText(/Camuflados/)).closest("article")!;
    await user.click(within(article).getByRole("button", { name: "Emitir nova credencial" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Credencial gerada para Camuflados" })).toBeTruthy());
    const card = screen.getByRole("region", { name: "Credencial gerada para Camuflados" });
    expect(within(card).getByText("ABCDEFGH")).toBeTruthy();
    expect((within(card).getByLabelText("Credencial privada de Camuflados") as HTMLInputElement).value)
      .toBe("ABCDEFGHJKLM");
    expect(screen.getByRole("button", { name: "Copiar mensagem privada" })).toBeTruthy();
    await user.click(within(card).getByRole("button", { name: "Baixar credenciais desta dupla" }));
    expect(mock.download).toHaveBeenCalledTimes(1);
    expect(mock.download).toHaveBeenCalledWith(
      "credenciais-camuflados.txt",
      expect.stringContaining("Dupla: Camuflados"),
    );
    expect((mock.download.mock.calls[0][1] as string)).toContain("ABCDEFGHJKLM");
    await user.click(within(card).getByRole("button", { name: "Ocultar credencial" }));
    expect(screen.queryByRole("region", { name: "Credencial gerada para Camuflados" })).toBeNull();
    expect(mock.rpc).toHaveBeenCalledWith("issue_short_team_credential", { p_team_id: "t2" });
    vi.restoreAllMocks();
  });
  it("does not revoke a duo when the short-credential migration is missing", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    mock.rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
      if (name === "list_teams_admin") return mock.teams.slice(Number(params.p_offset), Number(params.p_offset) + Number(params.p_limit));
      if (name === "issue_short_team_credential")
        throw new Error("Could not find the function public.issue_short_team_credential(p_team_id) in the schema cache");
      return null;
    });
    view(true);
    const card = (await screen.findByText(/Boto Cor-de-Rosa/)).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Emitir nova credencial" }));
    expect((await screen.findByRole("alert")).textContent).toContain("migration 012");
    expect(screen.queryByRole("region", { name: /Credencial gerada/ })).toBeNull();
    expect(mock.rpc).toHaveBeenCalledWith("issue_short_team_credential", { p_team_id: "t1" });
    vi.restoreAllMocks();
  });
});
