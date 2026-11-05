// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  role: "teacher" as string | null,
  rpc: vi.fn(),
  qr: vi.fn(),
  tables: {} as Record<string, Record<string, unknown>[]>,
  updates: undefined as undefined | (() => void),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: mock.qr } }));
vi.mock("../src/api", () => ({
  rpc: mock.rpc,
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "teacher-1" } } },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signOut: vi.fn(),
    },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: mock.role ? { role: mock.role } : null,
          error: null,
        }),
        order: () => q,
        range: async () => ({ data: mock.tables[table] ?? [], error: null }),
      };
      return q;
    },
    channel: () => ({
      on: (_type: string, _filter: unknown, cb: () => void) => {
        mock.updates = cb;
        return { subscribe: () => ({}) };
      },
    }),
    removeChannel: vi.fn(),
  },
}));
import Admin from "../src/Admin";
const classes = [
  { id: "c1", name: "Poraquê", slug: "poraque" },
  { id: "c2", name: "Pitiú", slug: "pitiu" },
];
beforeEach(() => {
  mock.role = "teacher";
  mock.tables = {};
  mock.rpc.mockReset();
  mock.qr.mockReset();
  mock.qr.mockResolvedValue("data:image/png;base64,qr");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mock.rpc.mockImplementation(
    async (name: string, p: Record<string, unknown>) => {
      if (name === "save_assessment") {
        mock.tables.activities = [
          {
            id: "a1",
            title: p.p_title,
            description: p.p_description,
            revision: 1,
            locked_at: null,
          },
        ];
        mock.tables.activity_sessions = [
          {
            id: "s1",
            activity_id: "a1",
            class_ids: ["c1", "c2"],
            status: "draft",
            published: false,
            access_code: "AABBCCDD",
            closes_at: null,
          },
        ];
        return "a1";
      }
      if (name === "transition_assessment") {
        mock.tables.activity_sessions = mock.tables.activity_sessions.map(
          (s) => ({
            ...s,
            status: p.p_status,
            published: p.p_status === "open",
          }),
        );
        return null;
      }
      return null;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("denies an Auth account without explicit authorization", async () => {
  mock.role = null;
  render(<Admin classes={classes} />);
  await screen.findByText(/Esta conta não está autorizada/);
  expect(screen.queryByRole("heading", { name: "Nova atividade" })).toBeNull();
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("lets a teacher create, preview, publish and start a quiz with a real activity link for QR generation", async () => {
  const user = userEvent.setup();
  render(<Admin classes={classes} />);
  await screen.findByRole("heading", { name: "Nova atividade" });
  await user.type(screen.getByLabelText("Título"), "Avaliação Linux");
  await user.type(screen.getByLabelText("Descrição"), "Aula de software livre");
  await user.click(screen.getByRole("checkbox", { name: "Poraquê" }));
  await user.click(screen.getByRole("checkbox", { name: "Pitiú" }));
  const first = within(screen.getByRole("group", { name: "Questão 1" }));
  await user.type(first.getByLabelText("Enunciado"), "Quanto é 2+2?");
  await user.type(
    first.getByLabelText("Explicação opcional (privada durante a atividade)"),
    "Dois pares.",
  );
  await user.click(
    first.getByRole("button", { name: "Adicionar alternativa" }),
  );
  await user.click(
    first.getByRole("button", { name: "Adicionar alternativa" }),
  );
  for (let i = 1; i <= 4; i++)
    await user.type(
      first.getByLabelText(`Texto da alternativa ${i} da questão 1`),
      String(i + 2),
    );
  await user.click(
    first.getByRole("radio", {
      name: "Marcar alternativa 2 como correta na questão 1",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Adicionar questão" }));
  const second = within(screen.getByRole("group", { name: "Questão 2" }));
  await user.type(second.getByLabelText("Enunciado"), "Linux é livre?");
  await user.selectOptions(second.getByLabelText("Tipo"), "true_false");
  await user.click(
    second.getByRole("button", { name: "Mover questão para cima" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Visualizar antes de publicar" }),
  );
  await screen.findByRole("region", { name: "Pré-visualização da atividade" });
  expect(mock.rpc).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Fechar pré-visualização" }),
  );
  await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  await screen.findByRole("button", { name: "Publicar" });
  expect(mock.rpc).toHaveBeenCalledWith(
    "save_assessment",
    expect.objectContaining({
      p_title: "Avaliação Linux",
      p_class_ids: ["c1", "c2"],
      p_questions: [
        expect.objectContaining({
          prompt: "Linux é livre?",
          kind: "true_false",
        }),
        expect.objectContaining({
          prompt: "Quanto é 2+2?",
          explanation: "Dois pares.",
          options: expect.arrayContaining([
            expect.objectContaining({ label: "4", is_correct: true }),
          ]),
        }),
      ],
    }),
  );
  await user.click(screen.getByRole("button", { name: "Publicar" }));
  await user.click(
    await screen.findByRole("button", { name: "Iniciar atividade" }),
  );
  await screen.findByText("AABBCCDD");
  expect(mock.rpc).toHaveBeenCalledWith("transition_assessment", {
    p_session_id: "s1",
    p_status: "open",
  });
  expect(mock.qr).toHaveBeenCalledWith(
    expect.stringContaining("/#atividade/s1"),
    { width: 360, errorCorrectionLevel: "M" },
  );
  expect(
    screen
      .getByRole("img", { name: "QR Code do link da atividade" })
      .getAttribute("src"),
  ).toBe("data:image/png;base64,qr");
  expect(
    screen
      .getByRole("link", { name: "Resultados e notas" })
      .getAttribute("href"),
  ).toBe("#admin/atividades/a1/resultados");
  await user.click(screen.getByRole("button", { name: "Encerrar atividade" }));
  await screen.findByRole("button", { name: "Reabrir atividade" });
  expect(mock.rpc).toHaveBeenCalledWith("transition_assessment", {
    p_session_id: "s1",
    p_status: "closed",
  });
  await user.click(
    screen.getByRole("button", { name: "Duplicar / criar revisão" }),
  );
  await waitFor(() =>
    expect(mock.rpc).toHaveBeenCalledWith("duplicate_assessment", {
      p_activity_id: "a1",
    }),
  );
});
