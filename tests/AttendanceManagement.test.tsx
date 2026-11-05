// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttendanceLesson, AttendanceStudent } from "../src/AttendanceManagement";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  lessons: [] as AttendanceLesson[],
  roster: [] as AttendanceStudent[],
}));
vi.mock("../src/api", () => ({ rpc: mock.rpc }));
import AttendanceManagement from "../src/AttendanceManagement";

const classes = [
  { id: "c1", name: "Poraquê", slug: "poraque", status: "active" as const },
  { id: "c2", name: "Pitiú", slug: "pitiu", status: "active" as const },
];

beforeEach(() => {
  mock.rpc.mockReset();
  mock.lessons = [{
    id: "l1", class_id: "c1", class_name: "Poraquê", title: "Comandos Linux",
    lesson_date: "2026-11-05", students: 2, present: 1, absent: 0, justified: 0, unmarked: 1,
  }];
  mock.roster = [
    { member_id: "m1", team_id: "t1", full_name: "Ana Silva", public_name: "Boto Rosa", member_position: 1, status: "present" },
    { member_id: "m2", team_id: "t1", full_name: "João Lima", public_name: "Boto Rosa", member_position: 2, status: null },
  ];
  mock.rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
    if (name === "list_attendance_lessons")
      return mock.lessons.filter((lesson) => !params.p_class_id || lesson.class_id === params.p_class_id);
    if (name === "list_attendance_roster") return mock.roster;
    if (name === "create_attendance_lesson") {
      mock.lessons.push({
        id: "l2", title: String(params.p_title), class_id: String(params.p_class_id),
        class_name: "Pitiú", lesson_date: String(params.p_lesson_date),
        students: 2, present: 0, absent: 0, justified: 0, unmarked: 2,
      });
      return "l2";
    }
    if (name === "save_attendance_marks") {
      const entries = params.p_entries as { member_id: string; status: string | null }[];
      mock.roster = mock.roster.map((member) => ({
        ...member, status: entries.find((x) => x.member_id === member.member_id)?.status ?? null,
      }));
      mock.lessons[0].present = mock.roster.filter((s) => s.status === "present").length;
      mock.lessons[0].absent = mock.roster.filter((s) => s.status === "absent").length;
      mock.lessons[0].justified = mock.roster.filter((s) => s.status === "justified").length;
      mock.lessons[0].unmarked = mock.roster.filter((s) => s.status === null).length;
      return null;
    }
    return null;
  });
});
afterEach(cleanup);

describe("individual attendance", () => {
  it("provides a collapsible lesson with two students in the same duo", async () => {
    const user = userEvent.setup();
    render(<AttendanceManagement classes={classes} role="admin" classFilter="" />);
    await screen.findByText("Comandos Linux");
    expect(screen.queryByRole("button", { name: "Abrir chamada" })).toBeNull();
    await user.click(screen.getByText("Comandos Linux"));
    await user.click(screen.getByRole("button", { name: "Abrir chamada" }));
    expect(await screen.findByRole("combobox", { name: "Presença de Ana Silva" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Presença de João Lima" })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Presença de João Lima" }) as HTMLSelectElement).value).toBe("");
  });
  it("saves explicit absences without treating unmarked students as absent", async () => {
    const user = userEvent.setup();
    render(<AttendanceManagement classes={classes} role="admin" classFilter="" />);
    await screen.findByText("Comandos Linux");
    await user.click(screen.getByText("Comandos Linux"));
    await user.click(screen.getByRole("button", { name: "Abrir chamada" }));
    const joao = await screen.findByRole("combobox", { name: "Presença de João Lima" });
    await user.selectOptions(joao, "absent");
    await user.click(screen.getByRole("button", { name: "Salvar chamada" }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("save_attendance_marks", {
      p_lesson_id: "l1", p_entries: [
        { member_id: "m1", status: "present" },
        { member_id: "m2", status: "absent" },
      ],
    }));
    await screen.findByText(/Chamada registrada no Supabase/);
  });
  it("allows admin to create a class lesson and limits teacher to read-only", async () => {
    const user = userEvent.setup();
    const view = render(<AttendanceManagement classes={classes} role="teacher" classFilter="" />);
    await screen.findByText("Comandos Linux");
    expect(screen.queryByRole("button", { name: "+ Nova aula" })).toBeNull();
    await user.click(screen.getByText("Comandos Linux"));
    await user.click(screen.getByRole("button", { name: "Abrir chamada" }));
    expect((await screen.findByRole("combobox", { name: "Presença de Ana Silva" }) as HTMLSelectElement).disabled).toBe(true);
    view.rerender(<AttendanceManagement classes={classes} role="admin" classFilter="" />);
    await user.click(screen.getByRole("button", { name: "+ Nova aula" }));
    await user.selectOptions(screen.getByLabelText("Turma"), "c2");
    await user.clear(screen.getByLabelText("Nome ou assunto da aula"));
    await user.type(screen.getByLabelText("Nome ou assunto da aula"), "Introdução à segurança");
    await user.click(screen.getByRole("button", { name: "Salvar aula" }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("create_attendance_lesson", expect.objectContaining({
      p_class_id: "c2", p_title: "Introdução à segurança",
    })));
    await screen.findByText("Introdução à segurança");
  });
});
