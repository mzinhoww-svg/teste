import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal-db";
import { logout } from "@/app/login/actions";
import { TenantThemeVars } from "@/components/TenantThemeVars";
import { PortalNav } from "@/components/PortalNav";

// Shell do portal do cliente: branding do cliente/tenant + navegação simples.
// Sem UI de CRM. Valida o contexto (usuário pertence ao cliente do slug).
export default async function PortalLayout({
  children, params,
}: { children: React.ReactNode; params: { client: string } }) {
  const ctx = await getPortalContext(params.client);
  if (!ctx) redirect("/login");

  const base = `/portal/${ctx.slug}`;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <TenantThemeVars primary={ctx.brand.primary} accent={ctx.brand.accent} />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white" style={ctx.brand.primary ? { background: ctx.brand.primary } : undefined}>
              {ctx.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ctx.name}</div>
              <div className="text-[11px] text-slate-400">Portal do cliente</div>
            </div>
          </div>
          <form action={logout}>
            <button className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Sair</button>
          </form>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-2 sm:px-6"><PortalNav base={base} /></div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
