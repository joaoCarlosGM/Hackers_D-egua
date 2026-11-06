// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  ranks: [] as {
    team_id: string;
    class_id: string;
    public_name: string;
    points: number;
    solved_count: number;
    assessment_band: number;
  }[],
  changed: undefined as undefined | (() => void),
}));
vi.mock("../src/api", () => ({
  configured: true,
  rpc: mock.rpc,
  supabase: {
    from: (name: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        then: (resolve: (value: unknown) => void) =>
          Promise.resolve({
            data:
              name === "classes"
                ? [
                    {
                      id: "c1",
                      name: "Poraquê",
                      slug: "poraque",
                      status: "active" as const,
                    },
                    {
                      id: "c2",
                      name: "Pitiú",
                      slug: "pitiu",
                      status: "active" as const,
                    },
                    {
                      id: "c3",
                      name: "Turma antiga",
                      slug: "antiga",
                      status: "archived" as const,
                    },
                  ]
                : mock.ranks,
            error: null,
          }).then(resolve),
      };
      return query;
    },
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: () => void) => {
          mock.changed = callback;
          return channel;
        },
        subscribe: () => ({}),
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("../src/Admin", () => ({ default: () => <div>Administração</div> }));
import App from "../src/App";
const team = {
  team_id: "permanent-team",
  class_id: "c1",
  public_name: "Os Hackers",
  access_code: "ABCDEF1234567890",
  token: "bearer",
};
const activity = {
  id: "session-1",
  title: "Primeiro desafio",
  description: "Vamos resolver",
  class_ids: ["c1"],
  closes_at: null,
  questions: [
    {
      id: "q1",
      prompt: "2 + 2?",
      kind: "multiple_choice",
      points: 10,
      options: [
        { id: "o1", label: "4" },
        { id: "o2", label: "5" },
      ],
    },
  ],
};
beforeEach(() => {
  sessionStorage.clear();
  mock.rpc.mockReset();
  mock.ranks = [];
  mock.changed = undefined;
  location.hash = "";
  mock.rpc.mockImplementation(async (name: string) => {
    if (name === "public_activity") return activity;
    if (name === "register_team")
      return { ...team, credential: "a".repeat(48) };
    if (name === "login_team") return team;
    if (name === "team_history") return { team, attempts: [] };
    if (name === "join_activity") return { attempt_id: "attempt-1" };
    if (name === "submit_attempt") return { submitted: true };
    return null;
  });
});
afterEach(cleanup);
describe("permanent team workflow", () => {
  it("offers both mandatory classes and saves two members exactly once", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Cadastrar minha dupla" }),
    );
    await screen.findByRole("option", { name: "Pitiú" });
    expect(screen.getByRole("option", { name: "Poraquê" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Turma antiga" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Turma"), "c1");
    await user.type(
      screen.getByLabelText("Nome público da dupla"),
      "Os Hackers",
    );
    await user.type(
      screen.getByLabelText("Nome completo do participante 1"),
      "Ana Silva",
    );
    await user.type(
      screen.getByLabelText("Nome completo do participante 2"),
      "João Souza",
    );
    await user.click(
      screen.getByRole("button", { name: "Criar cadastro permanente" }),
    );
    await screen.findByText("Guardem estas credenciais antes de continuar");
    expect(mock.rpc).toHaveBeenCalledWith("register_team", {
      p_class_id: "c1",
      p_public_name: "Os Hackers",
      p_member1: "Ana Silva",
      p_member2: "João Souza",
    });
    expect(screen.getByDisplayValue("a".repeat(48))).toBeTruthy();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Guardei o código e a credencial em local seguro",
      }),
    );
    expect(screen.queryByDisplayValue("a".repeat(48))).toBeNull();
    expect(
      mock.rpc.mock.calls.filter(([name]) => name === "register_team"),
    ).toHaveLength(1);
  });
  it("returns after a fresh browser session and submits using the permanent identity", async () => {
    location.hash = "#atividade/session-1";
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: activity.title });
    await user.type(screen.getByLabelText("Código da dupla"), team.access_code);
    await user.type(
      screen.getByLabelText("Código privado de recuperação"),
      "b".repeat(48),
    );
    await user.click(
      screen.getByRole("button", { name: "Entrar com minha dupla" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Participar desta atividade" }),
    );
    await user.click(await screen.findByRole("button", { name: /4/ }));
    await user.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar entrega" }));
    await screen.findByText(
      "Entrega registrada. Sua participação está vinculada à dupla original.",
    );
    expect(mock.rpc).toHaveBeenCalledWith("login_team", {
      p_access_code: team.access_code,
      p_credential: "b".repeat(48),
    });
    expect(mock.rpc).toHaveBeenCalledWith("join_activity", {
      p_token: "bearer",
      p_session_id: "session-1",
    });
    expect(mock.rpc).toHaveBeenCalledWith("submit_attempt", {
      p_token: "bearer",
      p_attempt_id: "attempt-1",
      p_answers: [{ question_id: "q1", option_id: "o1" }],
    });
    expect(mock.rpc.mock.calls.some(([name]) => name === "register_team")).toBe(
      false,
    );
  });
  it("shows server rejection without claiming a successful registration", async () => {
    mock.rpc.mockRejectedValue(
      new Error("Este nome de dupla já existe nesta turma."),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Código da dupla"), team.access_code);
    await user.type(
      screen.getByLabelText("Código privado de recuperação"),
      "b".repeat(48),
    );
    await user.click(
      screen.getByRole("button", { name: "Entrar com minha dupla" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Este nome de dupla já existe nesta turma.",
    );
    expect(screen.queryByRole("heading", { name: "Os Hackers" })).toBeNull();
  });
  it("refreshes sanitized ranking when a Realtime event arrives", async () => {
    location.hash = "#ranking";
    render(<App />);
    await screen.findByText("Nenhuma dupla cadastrada nesta turma.");
    mock.ranks = [
      {
        team_id: "permanent-team",
        class_id: "c1",
        public_name: "Os Hackers",
        points: 0,
        solved_count: 0,
        assessment_band: 0,
      },
    ];
    await act(async () => {
      mock.changed?.();
    });
    await waitFor(() =>
      expect(screen.getAllByText("Os Hackers")).toHaveLength(2),
    );
    expect(screen.getByText("0 pontos")).toBeTruthy();
    mock.ranks = [{ ...mock.ranks[0], points: 10, solved_count: 1 }];
    await act(async () => {
      mock.changed?.();
    });
    await screen.findByText("800 pontos");
    fireEvent.change(screen.getByLabelText("Turma"), {
      target: { value: "c2" },
    });
    await screen.findByText("Nenhuma dupla cadastrada nesta turma.");
  });
});
