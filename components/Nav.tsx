import Link from "next/link";
import { getAuthContext } from "@/lib/db";
import { MobileNav } from "./MobileNav";
import { TenantBadge, UserMenu } from "./UserMenu";

type Tab = "board" | "contracts" | "automations" | "reports" | "studio" | "how";

const tabs: { id: Tab; href: string; label: string }[] = [
  { id: "board", href: "/app", label: "Funil" },
  { id: "contracts", href: "/app/contracts", label: "Contratos" },
  { id: "automations", href: "/app/automacoes", label: "Automações" },
  { id: "reports", href: "/app/relatorios", label: "Relatórios" },
  { id: "studio", href: "/app/studio", label: "Studio" },
  { id: "how", href: "/app/como-funciona", label: "Como funciona" },
];

// Header com identidade permanente do tenant: logo (escopo do produto),
// TenantBadge (organização ativa — switcher com 2+ orgs) e UserMenu (escopo pessoal).
export async function Nav({ active }: { active: Tab }) {
  const ctx = await getAuthContext();
  // Studio e Automações alteram o comportamento da org inteira — visíveis só
  // para owner/admin (a autorização real é server-side, nas actions/páginas).
  const visibleTabs = ctx?.role === "member"
    ? tabs.filter((t) => t.id !== "studio" && t.id !== "automations")
    : tabs;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/app" className="flex shrink-0 items-center gap-2" aria-label="Início">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white" style={ctx?.brand?.primary ? { background: ctx.brand.primary } : undefined}>AI</span>
            <span className="hidden text-sm font-semibold text-slate-900 lg:block">CRM AI Studio</span>
          </Link>
          {ctx && ctx.orgId && (
            <TenantBadge orgName={ctx.orgName} memberships={ctx.memberships} activeOrgId={ctx.orgId} />
          )}
        </div>

        <div className="flex items-center gap-1">
          <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Navegação principal">
            {visibleTabs.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                aria-current={active === t.id ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${active === t.id ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <MobileNav tabs={visibleTabs} active={active} />
          {ctx && <UserMenu email={ctx.email} role={ctx.role} orgName={ctx.orgName || "—"} isTenantAdmin={ctx.role !== "member"} />}
        </div>
      </div>
    </header>
  );
}
