// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffAccount } from "../src/AdminAccessManagement";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  accounts: [] as StaffAccount[],
}));
vi.mock("../src/api", () => ({ rpc: mock.rpc }));
import AdminAccessManagement from "../src/AdminAccessManagement";

beforeEach(() => {
  mock.accounts = [
    { user_id: "admin-1", email: "admin@example.test", role: "admin", granted_at: "2026-11-05T00:00:00Z" },
    { user_id: "teacher-1", email: "teacher@example.test", role: "teacher", granted_at: "2026-11-05T00:00:00Z" },
  ];
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name: string, p: Record<string, unknown>) => {
    if (name === "list_staff_accounts") {
      return mock.accounts.slice(Number(p.p_offset), Number(p.p_offset) + Number(p.p_limit));
    }
    if (name === "authorize_staff_account") {
      const email = String(p.p_email).trim().toLowerCase();
      if (email === "missing@example.test") throw new Error("Conta não encontrada no Supabase Auth");
      const previous = mock.accounts.find((a) => a.email === email);
      if (previous) previous.role = p.p_role as StaffAccount["role"];
      else mock.accounts.push({
        user_id: "added-user", email, role: p.p_role as StaffAccount["role"],
        granted_at: "2026-11-05T00:00:00Z",
      });
      return "added-user";
    }
    if (name === "revoke_staff_account") {
      mock.accounts = mock.accounts.filter((a) => a.user_id !== p.p_user_id);
      return null;
    }
    return null;
  });
});
afterEach(cleanup);

describe("admin-only access management", () => {
  it("shows authorized users, current admin protection and profiles", async () => {
    render(<AdminAccessManagement currentUserId="admin-1" />);
    const table = screen.getByRole("region", { name: "Contas autorizadas" });
    await within(table).findByText(/admin@example.test/);
    expect(within(table).getByText(/teacher@example.test/)).toBeTruthy();
    expect(within(table).getByText(/Sua própria autorização é protegida/)).toBeTruthy();
    expect(mock.rpc).toHaveBeenCalledWith("list_staff_accounts", { p_offset: 0, p_limit: 200 });
  });

  it("authorizes only a preexisting Auth email and permits explicit role change", async () => {
    const user = userEvent.setup();
    render(<AdminAccessManagement currentUserId="admin-1" />);
    await screen.findByText(/teacher@example.test/);
    await user.type(screen.getByLabelText("E-mail cadastrado no Supabase Auth"), "new@example.test");
    await user.selectOptions(screen.getByLabelText("Permissão"), "admin");
    await user.click(screen.getByRole("button", { name: "Autorizar acesso" }));
    await screen.findByText(/new@example.test/);
    expect(mock.rpc).toHaveBeenCalledWith("authorize_staff_account", {
      p_email: "new@example.test", p_role: "admin",
    });
    const row = screen.getByText("teacher@example.test").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Alterar perfil" }));
    expect((screen.getByLabelText("E-mail cadastrado no Supabase Auth") as HTMLInputElement).value).toBe("teacher@example.test");
    expect((screen.getByLabelText("Permissão") as HTMLSelectElement).value).toBe("admin");
  });

  it("rejects unknown Auth accounts without creating privileged users", async () => {
    const user = userEvent.setup();
    render(<AdminAccessManagement currentUserId="admin-1" />);
    await screen.findByText(/admin@example.test/);
    await user.type(screen.getByLabelText("E-mail cadastrado no Supabase Auth"), "missing@example.test");
    await user.click(screen.getByRole("button", { name: "Autorizar acesso" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/não encontrada/);
    expect(mock.accounts).toHaveLength(2);
  });

  it("requires typed email before revoking without deleting Auth accounts", async () => {
    const user = userEvent.setup();
    render(<AdminAccessManagement currentUserId="admin-1" />);
    const row = (await screen.findByText("teacher@example.test")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Revogar acesso" }));
    expect((screen.getByRole("button", { name: "Confirmar revogação" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mock.rpc.mock.calls.some(([name]) => name === "revoke_staff_account")).toBe(false);
    await user.click(within(row).getByRole("button", { name: "Revogar acesso" }));
    await user.type(screen.getByLabelText("Digite o e-mail teacher@example.test para confirmar"), "teacher@example.test");
    await user.click(screen.getByRole("button", { name: "Confirmar revogação" }));
    await waitFor(() => expect(screen.queryByText("teacher@example.test")).toBeNull());
    expect(mock.rpc).toHaveBeenCalledWith("revoke_staff_account", { p_user_id: "teacher-1" });
    expect(mock.accounts).toHaveLength(1);
  });
});
