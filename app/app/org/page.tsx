import { OrgManager } from "@/components/OrgManager";
import { PermissionDenied } from "@/components/PermissionDenied";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/db";
import { setRestrictSellers } from "@/app/actions";
import { crmBaseUrl } from "@/lib/urls";

export const metadata = { title: "Organização — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const ctx = await getAuthContext();
  if (!ctx?.orgId) return null;
  if (ctx.role === "member") {
    return <PermissionDenied orgName={ctx.orgName} role={ctx.role} />;
  }

  const supabase = createClient();
  const [{ data: membersRes }, { data: inviteRows }, { data: org }] = await Promise.all([
    supabase.rpc("org_members", { p_org: ctx.orgId }),
    supabase.from("invites").select("id,email,member_role,token,status,expires_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(30),
    supabase.from("orgs").select("settings").eq("id", ctx.orgId).maybeSingle(),
  ]);

  const baseUrl = crmBaseUrl();
  const restrictSellers = Boolean((org?.settings as any)?.restrict_sellers);

  return (
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Organização</h1>
          <p className="text-sm text-slate-500">
            Nome, marca, membros e convites de <strong className="text-slate-700 dark:text-slate-200">{ctx.orgName}</strong>.
          </p>
        </div>

        <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Restringir vendedores aos próprios deals</div>
            <p className="text-xs text-slate-500">Quando ligado, membros (papel “member”) só veem no funil os deals dos quais são donos. Owner/admin sempre veem tudo.</p>
          </div>
          <form action={setRestrictSellers.bind(null, !restrictSellers)}>
            <button className={`rounded-full px-3 py-1 text-xs font-medium ${restrictSellers ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
              {restrictSellers ? "Ligado" : "Desligado"}
            </button>
          </form>
        </section>

        <OrgManager
          orgName={ctx.orgName}
          orgBrand={ctx.brand}
          members={membersRes?.ok ? membersRes.members : []}
          invites={(inviteRows ?? []) as any}
          meId={ctx.userId}
          myRole={ctx.role}
          baseUrl={baseUrl}
        />
      </main>
  );
}
