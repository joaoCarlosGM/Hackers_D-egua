// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedClass } from "../src/api";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  classes: [] as ManagedClass[],
}));
vi.mock("../src/api", () => ({ rpc: mock.rpc }));
import ClassManagement, { classSlug } from "../src/ClassManagement";
beforeEach(() => {
  mock.classes = [
    {
      id: "c1",
      name: "Poraquê",
      slug: "poraque",
      status: "active",
      team_count: 4,
      attempt_count: 8,
      activity_count: 2,
      can_delete: false,
    },
    {
      id: "c2",
      name: "Pitiú",
      slug: "pitiu",
      status: "archived",
      team_count: 2,
      attempt_count: 6,
      activity_count: 3,
      can_delete: false,
    },
    {
      id: "c3",
      name: "Sem vínculos",
      slug: "sem-vinculos",
      status: "active",
      team_count: 0,
      attempt_count: 0,
      activity_count: 0,
      can_delete: true,
    },
  ];
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(
    async (name: string, p: Record<string, unknown>) => {
      if (name === "list_classes_admin")
        return mock.classes.map((c) => ({ ...c }));
      if (name === "create_class") {
        mock.classes.push({
          id: "c4",
          name: String(p.p_name),
          slug: String(p.p_slug),
          status: "active",
          team_count: 0,
          attempt_count: 0,
          activity_count: 0,
          can_delete: true,
        });
        return "c4";
      }
      if (name === "rename_class")
        mock.classes = mock.classes.map((c) =>
          c.id === p.p_class_id ? { ...c, name: String(p.p_name) } : c,
        );
      if (name === "set_class_status")
        mock.classes = mock.classes.map((c) =>
          c.id === p.p_class_id
            ? { ...c, status: p.p_status as ManagedClass["status"] }
            : c,
        );
      if (name === "delete_class")
        mock.classes = mock.classes.filter((c) => c.id !== p.p_class_id);
      return null;
    },
  );
});
afterEach(cleanup);
describe("audited administrative class management", () => {
  it("lists active and archived classes with linked counts and allows read-only consultation for teachers", async () => {
    const inspect = vi.fn();
    const user = userEvent.setup();
    render(<ClassManagement canManage={false} onInspect={inspect} />);
    const row = await screen.findByRole("row", { name: /Pitiú/ });
    expect(within(row).getByText("Arquivada")).toBeTruthy();
    expect(within(row).getByText("6")).toBeTruthy();
    expect(within(row).getByText("3")).toBeTruthy();
    await user.click(
      within(row).getByRole("button", { name: "Consultar dados" }),
    );
    expect(inspect).toHaveBeenCalledWith("c2");
    expect(screen.queryByRole("button", { name: "Criar turma" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reativar" })).toBeNull();
  });
  it("creates a new class, renames it, archives it and reactivates it through protected RPCs", async () => {
    const changed = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ClassManagement
        canManage
        onChanged={changed}
        onInspect={() => undefined}
      />,
    );
    await screen.findByRole("row", { name: /Poraquê/ });
    await user.type(
      screen.getByLabelText("Nome da nova turma"),
      "Tucunaré 2027",
    );
    expect(
      (screen.getByLabelText("Identificador da nova turma") as HTMLInputElement)
        .value,
    ).toBe("tucunare-2027");
    await user.click(screen.getByRole("button", { name: "Criar turma" }));
    await screen.findByRole("row", { name: /Tucunaré 2027/ });
    expect(mock.rpc).toHaveBeenCalledWith("create_class", {
      p_name: "Tucunaré 2027",
      p_slug: "tucunare-2027",
    });
    const name = screen.getByLabelText("Nome da turma Tucunaré 2027");
    await user.clear(name);
    await user.type(name, "Tucunaré - Tarde");
    let row = screen.getByRole("row", { name: /Tucunaré 2027/ });
    await user.click(within(row).getByRole("button", { name: "Salvar nome" }));
    row = await screen.findByRole("row", { name: /Tucunaré - Tarde/ });
    expect(within(row).getByText("tucunare-2027")).toBeTruthy();
    expect(mock.rpc).toHaveBeenCalledWith("rename_class", {
      p_class_id: "c4",
      p_name: "Tucunaré - Tarde",
    });
    await user.click(within(row).getByRole("button", { name: "Arquivar" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /Tucunaré - Tarde/ })).getByText(
          "Arquivada",
        ),
      ).toBeTruthy(),
    );
    await user.click(
      within(screen.getByRole("row", { name: /Tucunaré - Tarde/ })).getByRole(
        "button",
        { name: "Reativar" },
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /Tucunaré - Tarde/ })).getByText(
          "Ativa",
        ),
      ).toBeTruthy(),
    );
    expect(changed).toHaveBeenCalledTimes(4);
  });
  it("blocks linked deletion and requires an explicit typed confirmation before deleting an empty class", async () => {
    const user = userEvent.setup();
    render(<ClassManagement canManage onInspect={() => undefined} />);
    const linked = await screen.findByRole("row", { name: /Poraquê/ });
    expect(
      (
        within(linked).getByRole("button", {
          name: "Excluir turma",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const row = screen.getByRole("row", { name: /Sem vínculos/ });
    await user.click(
      within(row).getByRole("button", { name: "Excluir turma" }),
    );
    const region = screen.getByRole("region", {
      name: "Confirmar exclusão definitiva",
    });
    const submit = within(region).getByRole("button", {
      name: "Excluir definitivamente",
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(mock.rpc.mock.calls.some(([name]) => name === "delete_class")).toBe(
      false,
    );
    await user.type(
      within(region).getByLabelText("Digite EXCLUIR sem-vinculos"),
      "errado",
    );
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.click(
      within(region).getByRole("button", { name: "Cancelar exclusão" }),
    );
    expect(mock.rpc.mock.calls.some(([name]) => name === "delete_class")).toBe(
      false,
    );
    await user.click(
      within(row).getByRole("button", { name: "Excluir turma" }),
    );
    await user.type(
      screen.getByLabelText("Digite EXCLUIR sem-vinculos"),
      "EXCLUIR sem-vinculos",
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir definitivamente" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /Sem vínculos/ })).toBeNull(),
    );
    expect(mock.rpc).toHaveBeenCalledWith("delete_class", {
      p_class_id: "c3",
      p_confirmation: "EXCLUIR sem-vinculos",
    });
    expect(screen.getByRole("row", { name: /Poraquê/ })).toBeTruthy();
  });
  it("keeps the class and shows the server error if links were added after loading the table", async () => {
    const original = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation(
      async (name: string, p: Record<string, unknown>) => {
        if (name === "delete_class")
          throw new Error(
            "Turma possui atividades vinculadas. Arquive para preservar o histórico.",
          );
        return original(name, p);
      },
    );
    const user = userEvent.setup();
    render(<ClassManagement canManage onInspect={() => undefined} />);
    await user.click(
      within(
        await screen.findByRole("row", { name: /Sem vínculos/ }),
      ).getByRole("button", { name: "Excluir turma" }),
    );
    await user.type(
      screen.getByLabelText("Digite EXCLUIR sem-vinculos"),
      "EXCLUIR sem-vinculos",
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir definitivamente" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByRole("row", { name: /Sem vínculos/ })).toBeTruthy();
  });
  it("normalizes suggested slugs without changing the public class name", () => {
    expect(classSlug("  Pitiú / Manhã 2027 ")).toBe("pitiu-manha-2027");
  });
});

it("loads additional pages instead of truncating the class list at the Data API limit", async () => {
  const many = Array.from({ length: 501 }, (_, i) => ({
    id: `page-${i}`,
    name: `Turma ${i + 1}`,
    slug: `turma-${i + 1}`,
    status: "active" as const,
    team_count: 0,
    attempt_count: 0,
    activity_count: 0,
    can_delete: true,
  }));
  mock.rpc.mockImplementation(
    async (name: string, p: Record<string, number>) =>
      name === "list_classes_admin"
        ? many.slice(p.p_offset, p.p_offset + p.p_limit)
        : null,
  );
  render(<ClassManagement canManage={false} onInspect={() => undefined} />);
  await screen.findByText("Turma 501");
  expect(mock.rpc).toHaveBeenCalledWith("list_classes_admin", {
    p_offset: 500,
    p_limit: 500,
  });
});
