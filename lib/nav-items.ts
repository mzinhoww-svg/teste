// Estrutura da navegação do CRM (sidebar + drawer mobile). Dado puro, sem JSX —
// consumido por components/SidebarNav (client, realce por rota) e pelo drawer.
// `adminOnly` esconde para papel "member" (a autorização real é server-side).

export type NavItem = { href: string; label: string; icon: string; adminOnly?: boolean; exact?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Vendas",
    items: [
      { href: "/app", label: "Funil", icon: "Filter", exact: true },
      { href: "/app/tarefas", label: "Meu dia", icon: "CheckSquare" },
      { href: "/app/contatos", label: "Contatos", icon: "Users" },
      { href: "/app/clientes", label: "Clientes", icon: "Building2" },
      { href: "/app/contracts", label: "Contratos", icon: "FileSignature" },
    ],
  },
  {
    title: "Entrega",
    items: [
      { href: "/app/projetos", label: "Projetos", icon: "FolderKanban" },
      { href: "/app/entregas", label: "Entregas & Documentos", icon: "PackageCheck" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/app/financeiro", label: "Faturas", icon: "Receipt" },
    ],
  },
  {
    title: "Inteligência",
    items: [
      { href: "/app/relatorios", label: "Relatórios", icon: "BarChart3" },
      { href: "/app/automacoes", label: "Automações", icon: "Zap", adminOnly: true },
      { href: "/app/studio", label: "Studio", icon: "Bot", adminOnly: true },
    ],
  },
  {
    title: "Configuração",
    items: [
      { href: "/app/org", label: "Organização", icon: "Settings" },
      { href: "/app/auditoria", label: "Auditoria", icon: "ScrollText" },
      { href: "/app/como-funciona", label: "Como funciona", icon: "HelpCircle" },
    ],
  },
];
