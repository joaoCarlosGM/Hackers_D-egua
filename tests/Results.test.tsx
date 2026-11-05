// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AssessmentResults } from "../src/api";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  changed: undefined as undefined | (() => void),
  subscribe: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../src/api", () => ({
  rpc: mock.rpc,
  supabase: {
    channel: () => ({
      on: (_type: string, _filter: unknown, callback: () => void) => {
        mock.changed = callback;
        return { subscribe: mock.subscribe };
      },
    }),
    removeChannel: mock.remove,
  },
}));
import Results from "../src/Results";
const initial: AssessmentResults = {
  title: "Avaliação Linux",
  registered_teams: 2,
  sessions: [
    {
      id: "s1",
      status: "open",
      access_code: "AABBCCDD",
      release_results: false,
    },
  ],
  participants: [],
  question_stats: [
    { id: "q1", prompt: "Linux é livre?", responses: 0, correct: 0 },
  ],
};
beforeEach(() => {
  mock.rpc.mockReset();
  mock.rpc.mockResolvedValue(initial);
  mock.subscribe.mockReturnValue({});
});
afterEach(cleanup);
it("updates private teacher results automatically on a Realtime notification", async () => {
  const view = render(<Results activityId="activity-1" />);
  await screen.findByRole("heading", { name: "Avaliação Linux · Resultados" });
  expect(screen.queryByText("Ana Silva e João Souza")).toBeNull();
  mock.rpc.mockResolvedValue({
    ...initial,
    participants: [
      {
        attempt_id: "a1",
        team_id: "t1",
        public_name: "Os Hackers",
        class_name: "Poraquê",
        members: ["Ana Silva", "João Souza"],
        started_at: "2026-11-04T20:00:00Z",
        submitted_at: "2026-11-04T20:05:00Z",
        submission_no: 1,
        retry_available: false,
        points: 15,
        max_points: 15,
        feedback: "",
        answers: [
          {
            question_id: "q1",
            prompt: "Linux é livre?",
            selected: "Verdadeiro",
            correct: true,
            explanation: "Kernel GPL",
          },
        ],
      },
    ],
    question_stats: [
      { id: "q1", prompt: "Linux é livre?", responses: 1, correct: 1 },
    ],
  });
  await act(async () => {
    mock.changed?.();
  });
  await screen.findByText("Ana Silva e João Souza");
  expect(screen.getByText("100.0%")).toBeTruthy();
  expect(screen.getByText("15.00")).toBeTruthy();
  expect(screen.getByText(/Nota: 15\/15/)).toBeTruthy();
  expect(mock.rpc).toHaveBeenCalledWith("assessment_results", {
    p_activity_id: "activity-1",
  });
  view.unmount();
  expect(mock.remove).toHaveBeenCalled();
});
it("shows an authorization failure instead of placeholder grades", async () => {
  mock.rpc.mockRejectedValue(new Error("Acesso administrativo não autorizado"));
  render(<Results activityId="forbidden" />);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe(
      "Acesso administrativo não autorizado",
    ),
  );
  expect(screen.queryByText("15.00")).toBeNull();
});
