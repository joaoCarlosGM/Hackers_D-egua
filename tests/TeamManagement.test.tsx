// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedTeam, Class } from "../src/api";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  teams: [] as ManagedTeam[],
}));
vi.mock("../src/api", () => ({ rpc: mock.rpc }));
import TeamManagement from "../src/TeamManagement";

const classes: Class[] = [
  { id: "poraque", name: "Poraquê", slug: "poraque", status: "active" },
  { id: "pitiu", name: "Pitiú", slug: "pitiu", status: "active" },
];
const onChanged = vi.fn().mockResolvedValue(undefined);
const onCredential = vi.fn();

beforeEach(() => {
  onChanged.mockClear();
  onCredential.mockClear();
  mock.rpc.mockReset();
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
    if (name === "rotate_team_credential")
      return { access_code: "1111222233334444", credential: "private-test-value" };
    return null;
  });
});
afterEach(cleanup);

function view(canManage: boolean, selectedClassId = "") {
  return render(
    <TeamManagement classes={classes} canManage={canManage}
      selectedClassId={selectedClassId}
      onChanged={onChanged} onCredential={onCredential} />,
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
    await user.selectOptions(screen.getByLabelText("Turma"), "poraque");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText(/Novos Camuflados/);
    expect(mock.rpc).toHaveBeenCalledWith("update_team", {
      p_team_id: "t2", p_public_name: "Novos Camuflados",
      p_member1: "Maria Corrigida", p_member2: "José Lima", p_class_id: "poraque",
    });
    expect(onChanged).toHaveBeenCalled();
    await user.click(within(screen.getByText(/Boto Cor-de-Rosa/).closest("article")!)
      .getByRole("button", { name: "Editar cadastro" }));
    expect((screen.getByLabelText("Turma") as HTMLSelectElement).disabled).toBe(true);
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
  it("receives a new private credential only after an administrator invokes rotation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    view(true, "pitiu");
    const article = (await screen.findByText(/Camuflados/)).closest("article")!;
    await user.click(within(article).getByRole("button", { name: "Emitir nova credencial" }));
    await waitFor(() => expect(onCredential).toHaveBeenCalledWith({
      access_code: "1111222233334444", credential: "private-test-value",
    }));
    vi.restoreAllMocks();
  });
});
