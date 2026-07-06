import Link from "next/link";
import { ShieldAlert, Bot } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveAllAgents } from "@/lib/agents/resolve";
import { PlatformAgentEditor } from "@/components/PlatformAgentEditor";

export const metadata = { title: "Agentes da plataforma — CRM AI Studio" };
export const dynamic = "force-dynamic";

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

export default async function PlatformAgentsPage() {
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
            Os agentes padrão são geridos pelo <strong>administrador da plataforma</strong>.
            {email ? ` A conta ${email} não tem esse acesso.` : ""}
          </p>
          <Link href="/app" className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Ir para o CRM</Link>
        </div>
      </div>
    );
  }

  const agents = await resolveAllAgents(null);
  const overridesEnabled = process.env.ALLOW_TENANT_AGENT_OVERRIDES === "true";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><Bot className="h-4 w-4" aria-hidden /></span>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">Agentes padrão da plataforma</h1>
              <p className="text-xs text-slate-500">Editados aqui, valem para todos os tenants que herdam o padrão.</p>
            </div>
          </div>
          <Link href="/admin" className="text-xs font-medium text-slate-500 hover:text-slate-800">← Admin</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Alterações afetam <strong>todos os tenants</strong> que herdam o padrão da plataforma.
          {overridesEnabled
            ? " Overrides por tenant estão HABILITADOS (ALLOW_TENANT_AGENT_OVERRIDES=true)."
            : " Overrides por tenant estão desabilitados — todos usam este padrão."}
        </div>
        <div className="space-y-4">
          {agents.map((a) => <PlatformAgentEditor key={a.key} agent={a} />)}
        </div>
      </main>
    </div>
  );
}
