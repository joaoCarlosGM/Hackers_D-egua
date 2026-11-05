import type { ReactNode } from "react";
import "./admin-navigation.css";

export type AdminSection = "overview" | "atividades" | "turmas" | "duplas" | "notas" | "chamada" | "ctf" | "usuarios";

const modules: {
  id: AdminSection;
  label: string;
  short: string;
  subtitle: string;
  symbol: string;
  href: string;
  adminOnly?: boolean;
}[] = [
  { id: "overview", label: "Visão geral", short: "Início", subtitle: "Acompanhe a situação das aulas e as entregas recebidas.", symbol: "01", href: "#admin" },
  { id: "atividades", label: "Aulas e atividades", short: "Atividades", subtitle: "Crie questões, configure avaliações, publique e projete o QR Code.", symbol: "02", href: "#admin/atividades" },
  { id: "turmas", label: "Gerenciar turmas", short: "Turmas", subtitle: "Organize Poraquê, Pitiú e outras turmas sem perder históricos.", symbol: "03", href: "#admin/turmas" },
  { id: "duplas", label: "Gerenciar duplas", short: "Duplas", subtitle: "Corrija cadastros, recupere acessos e consulte integrantes.", symbol: "04", href: "#admin/duplas" },
  { id: "notas", label: "Notas e entregas", short: "Notas", subtitle: "Consulte resultados, corrija notas e exporte relatórios privados.", symbol: "05", href: "#admin/notas" },
  { id: "chamada", label: "Chamada e presença", short: "Chamada", subtitle: "Registre presenças por aluno e aula, com histórico privado por turma.", symbol: "06", href: "#admin/chamada" },
  { id: "ctf", label: "Pontuação CTF", short: "CTF", subtitle: "Registre pontos auditados e acompanhe a classificação pública.", symbol: "07", href: "#admin/ctf", adminOnly: true },
  { id: "usuarios", label: "Usuários e permissões", short: "Usuários", subtitle: "Autorize contas do Supabase Auth como professor ou administrador.", symbol: "08", href: "#admin/usuarios", adminOnly: true },
];

export default function AdminNavigation({
  section,
  role,
  children,
}: {
  section: AdminSection;
  role: string;
  children: ReactNode;
}) {
  const current = modules.find((module) => module.id === section) ?? modules[0];
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Navegação pedagógica">
        <div className="admin-sidebar-heading">
          <span className="admin-sidebar-kicker">HACKERS / CONTROLE</span>
          <strong>Painel pedagógico</strong>
          <span className="admin-sidebar-role">{role === "admin" ? "Administrador" : "Professor"}</span>
        </div>
        <nav className="admin-side-nav" aria-label="Seções da administração">
          {modules.filter((module) => !module.adminOnly || role === "admin").map((module) => (
            <a
              key={module.id}
              href={module.href}
              aria-current={section === module.id ? "page" : undefined}
              className={section === module.id ? "is-active" : undefined}
            >
              <span className="admin-menu-number" aria-hidden="true">{module.symbol}</span>
              <span className="admin-menu-label">{module.short}</span>
              <span className="admin-menu-dot" aria-hidden="true" />
            </a>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <span className="admin-sidebar-kicker">VISUALIZAÇÃO PÚBLICA</span>
          <a href="#ranking">Abrir ranking CTF <span aria-hidden="true">↗</span></a>
        </div>
      </aside>
      <div className="admin-workspace">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">PAINEL / {current.short.toLocaleUpperCase("pt-BR")}</p>
            <h1>{current.label}</h1>
            <p className="admin-section-subtitle">{current.subtitle}</p>
          </div>
          <span className="admin-restricted-label">ACESSO RESTRITO</span>
        </div>
        <div className="admin-section-content">{children}</div>
      </div>
    </div>
  );
}
