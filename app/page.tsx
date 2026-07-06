import Link from "next/link";
import {
  ArrowRight, Bot, FileSignature, Filter, Bell, BarChart3, Building2,
  ShieldCheck, Sparkles, Check, MessageCircle, Zap,
} from "lucide-react";

export const metadata = {
  title: "CRM AI Studio — CRM multi-tenant operado por agentes de IA",
  description:
    "Funil inteligente, nove agentes de IA, contratos com assinatura digital, notificações acionáveis e relatórios. Para operações comerciais com execução diária.",
};

const features = [
  { icon: Filter, title: "Funil inteligente", desc: "Kanban com SLA por estágio, probabilidade e cadências que não deixam deal esfriar. Cada card mostra produto, tempo parado e o agente sugerido." },
  { icon: Bot, title: "Nove agentes de IA", desc: "Da nutrição ao pós-venda: qualificam, priorizam, escrevem, propõem, contratam e ensinam — com enriquecimento de dados e leitura de contexto." },
  { icon: FileSignature, title: "Contratos e assinatura", desc: "Da proposta aprovada ao contrato assinado via OpenSign, com bloqueio de assinatura duplicada e trilha auditável." },
  { icon: Bell, title: "Notificações acionáveis", desc: "Central in-app que não só avisa — sugere o agente certo e executa a próxima ação em um clique." },
  { icon: BarChart3, title: "Relatórios executivos", desc: "Conversão por estágio, ciclo de venda, forecast ponderado, motivos de perda e custo de IA por agente. Export CSV." },
  { icon: Building2, title: "Multi-tenant white-label", desc: "Dados isolados por RLS, papéis próprios, marca e cores. Agentes padrão da plataforma, herdados por todos os tenants." },
];

const steps = [
  { n: "01", title: "Registre o lead com contexto", desc: "Intake comercial rápido ou completo: produto, decisor, orçamento, próxima ação. O CRM já sugere o agente e detecta duplicidade." },
  { n: "02", title: "Deixe os agentes trabalharem", desc: "Qualificação, proposta, cadência e contrato rodam sob demanda ou por automação de estágio — sempre com você no comando." },
  { n: "03", title: "Feche com disciplina", desc: "Nenhum lead sem próxima ação. Contrato assinado, onboarding e relatórios fecham o ciclo do lead ao pós-venda." },
];

function KanbanPreview() {
  const cols = [
    { name: "Reunião", accent: "#6366f1", d: { t: "Cooperativa Sicredi", v: "R$ 17.000", tag: "Domo em evento" } },
    { name: "Proposta", accent: "#ec4899", d: { t: "Indústria Norte", v: "R$ 2.190", tag: "Podcast In Loco" } },
    { name: "Contrato", accent: "#f59e0b", d: { t: "Studio Permanente", v: "R$ 260.000", tag: "Studio Corporativo" } },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-400">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate">Funil Comercial · Reiners Media</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.name} className="rounded-lg bg-slate-800/60 p-2">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ background: c.accent }} />{c.name}
            </div>
            <div className="rounded-md border border-white/5 bg-slate-950/80 p-2">
              <div className="truncate text-[11px] font-medium text-slate-100">{c.d.t}</div>
              <div className="mt-1 text-[11px] font-semibold text-emerald-400">{c.d.v}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[9px] text-brand-200">{c.d.tag}</span>
                <span className="inline-flex items-center gap-0.5 rounded bg-white/5 px-1 py-0.5 text-[9px] text-slate-400"><Bot className="h-2.5 w-2.5" /> agente</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">AI</span>
            <span className="text-sm font-semibold">CRM AI Studio</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Área admin</Link>
            <Link href="/app" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700">
              Entrar no CRM <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/70 to-transparent dark:from-brand-950/30" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> CRM operado por agentes de IA
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Do primeiro contato ao contrato assinado — <span className="text-brand-600 dark:text-brand-400">com disciplina de estúdio.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-600 dark:text-slate-400">
              Funil inteligente, nove agentes que investigam antes de responder, contratos com assinatura digital e notificações que sugerem a próxima ação. Multi-tenant, seguro por RLS.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/app" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
                Entrar no CRM <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/admin" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                Ver painel admin
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              {["E-mail transacional (Brevo)", "Assinatura open source", "Dados isolados por tenant"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" aria-hidden /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <KanbanPreview />
            <div className="absolute -bottom-4 -left-4 hidden rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:block dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-xs">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-600"><MessageCircle className="h-3.5 w-3.5" /></span>
                <div><div className="font-medium">WhatsApp em 1 clique</div><div className="text-slate-500 dark:text-slate-400">template por contexto</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-y border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Como funciona</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-500">Três passos. Nenhum lead sem próxima ação.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-3xl font-bold text-brand-600/30 dark:text-brand-400/40">{s.n}</div>
                <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pilares */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Tudo que a operação comercial precisa</h2>
        <p className="mt-2 max-w-xl text-slate-500">Não vendemos posts nem alcance. Vendemos operação: funil, agentes, contratos e disciplina.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0 dark:border-slate-800 dark:bg-slate-900">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Segurança / multi-tenant */}
      <section className="border-t border-slate-100 bg-slate-900 text-white dark:border-slate-800">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Seguro por design
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Multi-tenant de verdade, não por convenção.</h2>
            <p className="mt-3 max-w-lg text-slate-300">
              Isolamento por Row Level Security no Postgres, autorização validada no servidor por papel — nunca só por cookie. Convites por link e por e-mail (Brevo). LGPD por padrão.
            </p>
            <Link href="/app" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100">
              Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ShieldCheck, t: "RLS por org_id", d: "Cada consulta escopada ao tenant ativo." },
              { icon: Zap, t: "Server actions", d: "Autorização por papel no servidor." },
              { icon: Bot, t: "Agentes globais", d: "Padrão da plataforma, herdado por todos." },
              { icon: FileSignature, t: "Assinatura grátis", d: "OpenSign open source, sem vendor pago." },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <c.icon className="h-5 w-5 text-brand-300" aria-hidden />
                <div className="mt-2 text-sm font-semibold">{c.t}</div>
                <div className="mt-0.5 text-xs text-slate-400">{c.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pronto para operar com disciplina?</h2>
        <p className="mx-auto mt-3 max-w-lg text-slate-500">Entre no CRM e crie seu primeiro lead em menos de um minuto.</p>
        <Link href="/app" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
          Entrar no CRM <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      <footer className="border-t border-slate-100 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-slate-500 dark:text-slate-400 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-[10px] font-bold text-white">AI</span>
            CRM AI Studio
          </div>
          <span className="text-xs">Dados tratados conforme a LGPD · Export em Relatórios</span>
        </div>
      </footer>
    </div>
  );
}
