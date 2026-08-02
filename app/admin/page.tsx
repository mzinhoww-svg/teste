import Link from "next/link";
import { ShieldAlert, Building2, Users, Activity, HeartPulse, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { activeModel, activeProvider, hasLiveAI } from "@/lib/ai";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";

export const metadata = { title: "Admin da plataforma — CRM AI Studio" };
export const dynamic = "force-dynamic";

// Admin da PLATAFORMA (≠ admin de tenant). Acesso: linha em platform_admins
// OU e-mail listado em PLATFORM_ADMIN_EMAILS (fallback inicial).
async function isPlatformAdmin(): Promise<{ ok: boolean; email: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, email: "" };

  const envList = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (user.email && envList.includes(user.email.toLowerCase())) return { ok: true, email: user.email };

  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return { ok: !!data, email: user.email ?? "" };
}

export default async function AdminPage() {
  const { ok, email } = await isPlatformAdmin();

  if (!ok) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Área restrita da plataforma</h1>
          <p className="mt-2 text-sm text-slate-500">
            Esta área é do <strong>administrador da plataforma</strong> — não é o admin da sua organização.
            {email ? ` A conta ${email} não tem esse acesso.` : " Entre com uma conta autorizada."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/app" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Ir para o CRM</Link>
            <Link href="/login" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Trocar de conta</Link>
          </div>
        </div>
      </div>
    );
  }

  const supabase = createClient();
  const { data: overview } = await supabase.rpc("admin_overview");
  const tenants: any[] = overview?.tenants ?? [];
  const runs: any[] = overview?.runs_recentes ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">AI</span>
            <div>
              <div className="text-sm font-semibold text-slate-900">Admin da plataforma</div>
              <div className="text-[11px] text-slate-400">{email}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/agents" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">Agentes da plataforma</Link>
            <Link href="/app" className="text-sm font-medium text-slate-500 hover:text-slate-800">Ir para o CRM →</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500"><Building2 className="h-3.5 w-3.5" aria-hidden /> Tenants</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{tenants.length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500"><Users className="h-3.5 w-3.5" aria-hidden /> Usuários</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{overview?.users_total ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500"><Activity className="h-3.5 w-3.5" aria-hidden /> Execuções (12 últimas)</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{runs.length}</div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500"><HeartPulse className="h-3.5 w-3.5" aria-hidden /> Saúde &amp; configuração</div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <HealthItem ok={hasLiveAI()} label="IA ao vivo" hint={hasLiveAI() ? `${activeProvider()} · ${activeModel()}` : "heurística (sem chave)"} />
            <HealthItem ok={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} label="Service role" hint="webhooks/PDF" />
            <HealthItem ok={process.env.SIGNATURE_PROVIDER === "opensign" && Boolean(process.env.OPENSIGN_BASE_URL)} label="OpenSign" hint={process.env.OPENSIGN_BASE_URL ? "configurado" : "modo demonstração"} />
            <HealthItem ok={process.env.WHATSAPP_PROVIDER === "bridge"} label="WhatsApp bridge" hint={process.env.WHATSAPP_PROVIDER === "bridge" ? "conectado" : "wa.me manual"} warnOnly />
          </div>
        </section>

        <Table>
          <THead>
            <TR>
              <TH>Tenant</TH><TH>Slug</TH><TH>Membros</TH><TH>Deals</TH><TH>Contratos</TH><TH>Execuções 7d</TH><TH>Criado</TH>
            </TR>
          </THead>
          <tbody>
            {tenants.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium text-slate-800 dark:text-slate-200">{t.name}</TD>
                <TD>{t.slug ? <Badge variant="outline">{t.slug}</Badge> : <span className="text-slate-300">—</span>}</TD>
                <TD className="tabular-nums">{t.members}</TD>
                <TD className="tabular-nums">{t.deals}</TD>
                <TD className="tabular-nums">{t.contracts}</TD>
                <TD className="tabular-nums">{t.runs_7d}</TD>
                <TD className="text-xs text-slate-400">{String(t.created_at).slice(0, 10)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Últimas execuções de agentes (todas as orgs)</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma execução registrada.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {runs.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{r.org} · <span className="text-slate-500">{r.agent}</span></span>
                  <span className="flex items-center gap-2 text-xs">
                    <Badge variant={r.source === "llm" ? "brand" : "muted"}>{r.source === "llm" ? "IA" : "heurística"}</Badge>
                    <span className="text-slate-400">{String(r.at).slice(0, 16).replace("T", " ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          <strong className="text-slate-700">Suporte:</strong> documentação em <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">docs/</code> —
          seed Reiners, OpenSign, testes, domínio próprio. Para adicionar outro admin da plataforma:
          inserir em <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">platform_admins</code> ou na env{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">PLATFORM_ADMIN_EMAILS</code>.
        </section>
      </main>
    </div>
  );
}

function HealthItem({ ok, label, hint, warnOnly }: { ok: boolean; label: string; hint: string; warnOnly?: boolean }) {
  const good = ok;
  const color = good ? "text-emerald-600" : warnOnly ? "text-slate-400" : "text-amber-600";
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
        {good ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />} {label}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>
    </div>
  );
}
