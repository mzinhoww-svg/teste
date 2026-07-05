import Link from "next/link";
import {
  ArrowRight, Bot, FileSignature, Filter, Bell, BarChart3, Building2, ShieldCheck,
} from "lucide-react";

export const metadata = {
  title: "CRM AI Studio — CRM multi-tenant com agentes de IA",
  description:
    "Funil inteligente, agentes de IA, contratos com assinatura digital, notificações e relatórios. Feito para operações comerciais com execução diária.",
};

const features = [
  { icon: Filter, title: "Funil inteligente", desc: "Kanban com SLA por estágio, probabilidade e cadências de follow-up que não deixam deal esfriar." },
  { icon: Bot, title: "Agentes de IA", desc: "Nove agentes configuráveis — qualificação, propostas, objeções, cadência e pós-venda — treinados no seu playbook." },
  { icon: FileSignature, title: "Contratos e assinatura", desc: "Da proposta aprovada ao contrato assinado digitalmente, com trilha auditável via OpenSign." },
  { icon: Bell, title: "Notificações", desc: "Central in-app com tudo que precisa de ação: proposta parada, SLA vencido, contrato assinado." },
  { icon: BarChart3, title: "Relatórios", desc: "Conversão por estágio, tempo de ciclo, forecast, motivos de perda e custo de IA por agente." },
  { icon: Building2, title: "Multi-tenant e white label", desc: "Cada organização com seus dados isolados, papéis próprios, marca e cores." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">AI</span>
            <span className="text-sm font-semibold text-slate-900">CRM AI Studio</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">
              Área admin
            </Link>
            <Link href="/app" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700">
              Entrar no CRM <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="max-w-2xl">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            Multi-tenant · dados isolados por organização
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            O CRM que executa o seu playbook comercial — todos os dias.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Funil com SLA, agentes de IA treinados no seu processo, propostas e contratos com assinatura
            digital, cadências de follow-up e relatórios que mostram onde o dinheiro está parado.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/app" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
              Entrar no CRM <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              Acessar área admin
            </Link>
          </div>
        </div>
      </section>

      {/* Feito para operações */}
      <section className="border-y border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-center text-sm font-medium text-slate-500">
            Feito para <span className="text-slate-800">operações comerciais com execução diária</span> — prospecção,
            proposta em 24h, follow-up 48h/5d/10d e contrato em até 4h após o sim.
          </p>
        </div>
      </section>

      {/* Recursos */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 p-6 transition-colors hover:border-brand-200">
              <span className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-2xl bg-slate-900 px-8 py-12 text-center">
          <h2 className="text-2xl font-bold text-white">Sua operação comercial, com um time de agentes por trás.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300">
            Crie sua conta e entre com o funil, os agentes e as cadências já configurados para a sua organização.
          </p>
          <Link href="/app" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100">
            Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-slate-400">
          <span>CRM AI Studio</span>
          <span>Dados tratados conforme a LGPD · Export disponível em Relatórios</span>
        </div>
      </footer>
    </div>
  );
}
