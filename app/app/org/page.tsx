import { Nav } from "@/components/Nav";
import { OrgManager } from "@/components/OrgManager";
import { PermissionDenied } from "@/components/PermissionDenied";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/db";

export const metadata = { title: "Organização — CRM AI Studio" };

export default async function OrgPage() {
  const ctx = await getAuthContext();
  if (!ctx?.orgId) return null;
  if (ctx.role === "member") {
    return (
      <div className="min-h-screen">
        <Nav active="board" />
        <PermissionDenied orgName={ctx.orgName} role={ctx.role} />
      </div>
    );
  }

  const supabase = createClient();
  const [{ data: membersRes }, { data: inviteRows }] = await Promise.all([
    supabase.rpc("org_members", { p_org: ctx.orgId }),
    supabase.from("invites").select("id,email,member_role,token,status,expires_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(30),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://teste-phi-gray.vercel.app";

  return (
    <div className="min-h-screen">
      <Nav active="board" />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Organização</h1>
          <p className="text-sm text-slate-500">
            Nome, marca, membros e convites de <strong className="text-slate-700">{ctx.orgName}</strong>.
          </p>
        </div>
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
    </div>
  );
}
