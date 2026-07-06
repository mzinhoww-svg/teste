// Aposentado (Fase 3): a navegação do CRM passou para a sidebar do layout
// (app/app/layout.tsx + components/Sidebar/SidebarNav). Mantido como no-op para
// não quebrar as páginas que ainda o referenciam; pode ser removido quando todas
// migrarem para renderizar só o <main>.
type Tab = "board" | "contracts" | "automations" | "reports" | "studio" | "how";

export function Nav(_props: { active?: Tab }) {
  return null;
}
