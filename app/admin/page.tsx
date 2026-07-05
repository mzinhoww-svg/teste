import Link from "next/link";
import { ShieldAlert, Building2, Users, Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";

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
          <Link href="/app" className="text-sm font-medium text-slate-500 hover:text-slate-800">Ir para o CRM →</Link>
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

        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Slug</th>
                <th className="px-4 py-2.5">Membros</th>
                <th className="px-4 py-2.5">Deals</th>
                <th className="px-4 py-2.5">Contratos</th>
                <th className="px-4 py-2.5">Execuções 7d</th>
                <th className="px-4 py-2.5">Criado</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{t.name}</td>
                  <td className="px-4 py-2.5">{t.slug ? <Badge variant="outline">{t.slug}</Badge> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{t.members}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{t.deals}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{t.contracts}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{t.runs_7d}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{String(t.created_at).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

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
