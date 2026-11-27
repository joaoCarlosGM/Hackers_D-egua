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
    expect(links).toHaveLength(12);
    expect(links.some(link => link.getAttribute("href") === "#admin/ctf-oficial")).toBe(true);
    expect(links.some(link => link.getAttribute("href") === "#admin/revisao-ctf")).toBe(true);
    expect(links.some(link => link.getAttribute("href") === "#admin/auditoria-ctf")).toBe(true);
    expect(within(navigation).getByRole("link", { name: /Calculadora/ }).getAttribute("href")).toBe("#admin/calculadora");
    expect(within(navigation).getByRole("link", { name: /Início/ }).getAttribute("aria-current")).toBe("page");
    expect(within(navigation).getByRole("link", { name: /Turmas/ }).getAttribute("href")).toBe("#admin/turmas");
    expect(within(navigation).getByRole("link", { name: /Duplas/ }).getAttribute("href")).toBe("#admin/duplas");
    expect(links.some(link => link.getAttribute("href") === "#admin/ctf")).toBe(true);
    expect(within(navigation).getByRole("link", { name: /Usuários/ }).getAttribute("href")).toBe("#admin/usuarios");
    expect(within(navigation).getByRole("link", { name: /Chamada/ }).getAttribute("href")).toBe("#admin/chamada");
    expect(screen.getByText("Resumo pedagógico")).toBeTruthy();
  });
  it("hides the points entry for teachers but keeps the public ranking shortcut", () => {
    render(<AdminNavigation section="notas" role="teacher"><p>Relatório privado</p></AdminNavigation>);
    const navigation = screen.getByRole("navigation", { name: "Seções da administração" });
    const teacherLinks = within(navigation).getAllByRole("link");
    expect(teacherLinks.some(link => link.getAttribute("href") === "#admin/ctf")).toBe(false);
    expect(teacherLinks.some(link => link.getAttribute("href") === "#admin/revisao-ctf")).toBe(true);
    expect(within(navigation).queryByRole("link", { name: /Usuários/ })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: /Calculadora/ })).toBeNull();
    expect(within(navigation).getByRole("link", { name: /Chamada/ })).toBeTruthy();
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
