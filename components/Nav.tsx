import Link from "next/link";

type Tab = "board" | "studio" | "how";

const tabs: { id: Tab; href: string; label: string }[] = [
  { id: "board", href: "/", label: "Funil" },
  { id: "studio", href: "/studio", label: "Studio de Agentes" },
  { id: "how", href: "/como-funciona", label: "Como funciona" },
];

export function Nav({ active }: { active: Tab }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">AI</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">CRM AI Studio</div>
            <div className="text-[11px] text-slate-400">versão privada</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className={`rounded-md px-3 py-1.5 font-medium ${active === t.id ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
