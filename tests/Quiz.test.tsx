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
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/api", () => ({ rpc: mock.rpc }));
import Quiz from "../src/Quiz";
import type { Activity, Participation, Team } from "../src/api";
const team: Team = {
  team_id: "t1",
  class_id: "c1",
  public_name: "Os Hackers",
  access_code: "TEAMCODE",
  token: "temporary-bearer",
};
const activity: Activity = {
  id: "s1",
  title: "Aula",
  description: "",
  class_ids: ["c1"],
  closes_at: null,
  allow_backtracking: true,
  questions: [
    {
      id: "q1",
      prompt: "Quanto é 2+2?",
      kind: "multiple_choice",
      points: 10,
      options: [
        { id: "o1", label: "3" },
        { id: "o2", label: "4" },
        { id: "o3", label: "5" },
        { id: "o4", label: "6" },
      ],
    },
    {
      id: "q2",
      prompt: "Linux é software livre?",
      kind: "true_false",
      points: 5,
      options: [
        { id: "v", label: "Verdadeiro" },
        { id: "f", label: "Falso" },
      ],
    },
  ],
};
const participation: Participation = {
  attempt_id: "a1",
  deadline: null,
  progress: { answers: {}, current_question: 0 },
};
beforeEach(() => {
  sessionStorage.clear();
  mock.rpc.mockReset();
  mock.rpc.mockResolvedValue(null);
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(cleanup);
describe("gamified protected evaluation", () => {
  it("shows one question, four options, selected state, binary options and final confirmation", async () => {
    const done = vi.fn();
    const user = userEvent.setup();
    render(
      <Quiz
        activity={activity}
        team={team}
        participation={participation}
        onComplete={done}
      />,
    );
    expect(screen.queryByText("Linux é software livre?")).toBeNull();
    expect(
      screen
        .getAllByRole("button", { pressed: false })
        .filter((b) => b.classList.contains("quiz-option")),
    ).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: /4/ }));
    expect(
      screen.getByRole("button", { name: /4/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "Próxima questão" }));
    await user.click(screen.getByRole("button", { name: /Verdadeiro/ }));
    expect(screen.getByRole("button", { name: /Falso/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    expect(
      mock.rpc.mock.calls.some(([name]) => name === "submit_attempt"),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Confirmar entrega" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(mock.rpc).toHaveBeenCalledWith("submit_attempt", {
      p_token: "temporary-bearer",
      p_attempt_id: "a1",
      p_answers: [
        { question_id: "q1", option_id: "o2" },
        { question_id: "q2", option_id: "v" },
      ],
    });
    expect(sessionStorage.getItem("hpde:attempt:a1")).toBeNull();
  });
  it("keeps unsent responses during disconnection and restores them safely in the same tab", async () => {
    const user = userEvent.setup();
    const view = render(
      <Quiz
        activity={activity}
        team={team}
        participation={participation}
        onComplete={() => undefined}
      />,
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent.offline(window);
    await user.click(screen.getByRole("button", { name: /4/ }));
    await user.click(screen.getByRole("button", { name: "Próxima questão" }));
    await user.click(screen.getByRole("button", { name: /Falso/ }));
    expect(screen.getByText(/Sem conexão/)).toBeTruthy();
    view.unmount();
    render(
      <Quiz
        activity={activity}
        team={team}
        participation={participation}
        onComplete={() => undefined}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /Falso/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await act(async () => {
      fireEvent.online(window);
    });
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("save_attempt_progress", {
        p_token: "temporary-bearer",
        p_attempt_id: "a1",
        p_answers: { q1: "o2", q2: "f" },
        p_current_question: 1,
      }),
    );
  });
  it("recovers a lost final acknowledgement even when progress is already locked by a committed delivery", async () => {
    sessionStorage.setItem(
      "hpde:attempt:a1",
      JSON.stringify({ answers: { q1: "o2", q2: "v" }, current_question: 1 }),
    );
    let deliveries = 0;
    mock.rpc.mockImplementation(async (name: string) => {
      if (name === "submit_attempt") {
        deliveries++;
        if (deliveries === 1) throw new Error("Conexão interrompida");
        return { submitted: true, already_submitted: true };
      }
      if (deliveries) throw new Error("Participação concluída");
      return null;
    });
    const done = vi.fn();
    const user = userEvent.setup();
    render(
      <Quiz
        activity={activity}
        team={team}
        participation={participation}
        onComplete={done}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar entrega" }));
    await screen.findByText("Conexão interrompida");
    expect(done).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar entrega" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(deliveries).toBe(2);
  });
  it("respects linear navigation and the server-derived time limit", async () => {
    render(
      <Quiz
        activity={{ ...activity, allow_backtracking: false }}
        team={team}
        participation={{
          ...participation,
          deadline: new Date(Date.now() - 2000).toISOString(),
          server_now: new Date().toISOString(),
        }}
        onComplete={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Anterior" })).toBeNull();
    await screen.findByText(/Tempo encerrado/);
    expect(
      (
        screen.getByRole("button", {
          name: "Próxima questão",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      mock.rpc.mock.calls.some(([name]) => name === "submit_attempt"),
    ).toBe(false);
  });
});
