// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByRole("heading", { name: /Laboratório Linux do professor/i })).toBeTruthy();
    expect(screen.getByText(/sem notas nem pontos/i)).toBeTruthy();
    expect(screen.queryByRole("heading",{name:/Investigue um problema, execute comandos/i})).toBeNull();
  });

  it("apresenta situação-problema e roteiro antes de revelar comandos", async () => {
    render(<CtfReviewBrowser />);
    fireEvent.click(screen.getByRole("button", { name: /Iniciar demonstração/i }));
    expect(await screen.findByRole("heading", { name: "O Rastro Trancado" })).toBeTruthy();
    expect(screen.getByText(/O problema:/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /O que fazer e por quê/i })).toBeTruthy();
    expect(screen.queryByText("find /var/tmp -type f -name '.*' 2>/dev/null")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Professor: revelar exemplos de comandos/i }));
    expect(screen.getByText("find /var/tmp -type f -name '.*' 2>/dev/null")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /O Invasor Insistente/i }));
    expect(screen.getByRole("heading", { name: "O Invasor Insistente" })).toBeTruthy();
    expect(screen.getByText(/Analise /var/log/auth_simulado.log/i)).toBeTruthy();
    expect(screen.queryByText("grep 'Failed password' /var/log/auth_simulado.log | head")).toBeNull();
  });

  it("inclui a missão de SHA-256/MD5 sem interferir na pontuação ou alterar o write-up", async () => {
    render(<CtfReviewBrowser />);
    fireEvent.click(screen.getByRole("button", { name: /Iniciar demonstração/i }));
    expect(await screen.findByRole("heading", { name: "O Rastro Trancado" })).toBeTruthy();
    expect(screen.getByText(/Progresso/i).textContent).toContain("0/3");
    fireEvent.click(screen.getByRole("button", { name: /A Impressão Digital, Quebra de MD5 e o Cofre/i }));
    expect(screen.getByRole("heading", { name: "A Impressão Digital, Quebra de MD5 e o Cofre" })).toBeTruthy();
    expect(screen.getAllByText(/e4b2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/dicionario_paraense.txt/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Preencher write-up/i }));
    expect(screen.getByRole("button", { name: /Exportar \.md/i })).toBeTruthy();
    expect(screen.getByText(/Raciocínio técnico/i)).toBeTruthy();
  });

  it("aciona o fullscreen nativo em gesto do usuário, sem desmontar o terminal", async () => {
    const { container } = render(<CtfReviewBrowser />);
    fireEvent.click(screen.getByRole("button", { name: /Iniciar demonstração/i }));
    await screen.findByRole("button", { name: /Ampliar para projeção/i });
    const root = container.querySelector("section.ctf-browser") as HTMLElement;
    const focusButton=screen.getByRole("button", {name:/Focar/i});
    fireEvent.click(focusButton);
    expect(root.classList.contains("ctf-focus-mode")).toBe(true);
    fireEvent.keyDown(window,{key:"Escape"});
    expect(root.classList.contains("ctf-focus-mode")).toBe(false);
    expect(root).toBeTruthy();
    const full = vi.fn(async () => {});
    Object.defineProperty(root, "requestFullscreen", { configurable: true, value: full });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ampliar para projeção/i }));
    });
    expect(full).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Sair da projeção/i }).getAttribute("aria-pressed")).toBe("true")
    );
  });
});
