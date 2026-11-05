// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AdminNavigation from "../src/AdminNavigation";

afterEach(cleanup);

describe("administrative module navigation", () => {
  it("shows the overview and working module links with a single current page", () => {
    render(<AdminNavigation section="overview" role="admin"><p>Resumo pedagógico</p></AdminNavigation>);
    const navigation = screen.getByRole("navigation", { name: "Seções da administração" });
    const links = within(navigation).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(within(navigation).getByRole("link", { name: /Início/ }).getAttribute("aria-current")).toBe("page");
    expect(within(navigation).getByRole("link", { name: /Turmas/ }).getAttribute("href")).toBe("#admin/turmas");
    expect(within(navigation).getByRole("link", { name: /Duplas/ }).getAttribute("href")).toBe("#admin/duplas");
    expect(within(navigation).getByRole("link", { name: /CTF/ }).getAttribute("href")).toBe("#admin/ctf");
    expect(screen.getByText("Resumo pedagógico")).toBeTruthy();
  });
  it("hides the points entry for teachers but keeps the public ranking shortcut", () => {
    render(<AdminNavigation section="notas" role="teacher"><p>Relatório privado</p></AdminNavigation>);
    const navigation = screen.getByRole("navigation", { name: "Seções da administração" });
    expect(within(navigation).queryByRole("link", { name: /CTF/ })).toBeNull();
    expect(within(navigation).getByRole("link", { name: /Notas/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Abrir ranking CTF/ }).getAttribute("href")).toBe("#ranking");
  });
  it("prints each module heading and description without repeating unrelated forms", () => {
    render(<AdminNavigation section="atividades" role="admin"><button>Salvar rascunho</button></AdminNavigation>);
    expect(screen.getByRole("heading", { name: "Aulas e atividades" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar ajuste auditado" })).toBeNull();
  });
});
