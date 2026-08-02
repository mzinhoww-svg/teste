"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Navegação horizontal do portal do cliente (realce por rota).
export function PortalNav({ base }: { base: string }) {
  const pathname = usePathname();
  const items = [
    { href: base, label: "Início", exact: true },
    { href: `${base}/propostas`, label: "Propostas" },
    { href: `${base}/contratos`, label: "Contratos" },
    { href: `${base}/financeiro`, label: "Financeiro" },
    { href: `${base}/projetos`, label: "Projetos" },
    { href: `${base}/documentos`, label: "Documentos" },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Navegação do portal">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
