// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CtfReviewBrowser from "../src/CtfReviewBrowser";

vi.mock("../src/api", () => ({
  rpc: vi.fn(async (name: string) => {
    if (name === "ctf_teacher_review_history") return [];
    if (name === "ctf_teacher_review_start") return "00000000-0000-4000-8000-000000000001";
    return [];
  }),
}));
afterEach(cleanup);

describe("revisão CTF com enunciado e raciocínio pedagógico", () => {
  it("explica o fluxo oficial sem atribuir pontos", () => {
    render(<CtfReviewBrowser />);
    expect(screen.getByRole("heading", { name: /Investigue um problema, execute comandos/i })).toBeTruthy();
    expect(screen.getByText(/sem competição, notas ou ranking/i)).toBeTruthy();
  });

  it("apresenta situação-problema e roteiro antes de revelar comandos", async () => {
    render(<CtfReviewBrowser />);
    fireEvent.click(screen.getByRole("button", { name: /Iniciar demonstração/i }));
    expect(await screen.findByRole("heading", { name: "O relatório que desapareceu" })).toBeTruthy();
    expect(screen.getByText(/O problema:/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /O que fazer e por quê/i })).toBeTruthy();
    expect(screen.queryByText("find /var/tmp -type f -name '.*'")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Professor: revelar exemplos de comandos/i }));
    expect(screen.getByText("find /var/tmp -type f -name '.*'")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /A evidência bloqueada/i }));
    expect(screen.getByRole("heading", { name: "A evidência bloqueada" })).toBeTruthy();
    expect(screen.getByText(/O objetivo é compreender a configuração/i)).toBeTruthy();
    expect(screen.queryByText("chmod g+r /home/aluno/desafios/permissoes/segredo.txt")).toBeNull();
  });
});
