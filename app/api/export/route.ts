import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/db";

export const runtime = "nodejs";

// Portabilidade de dados (LGPD art. 18): exporta todos os dados da org em JSON.
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const supabase = createClient();
  const tables = [
    "pipelines", "stages", "contacts", "deals", "activities",
    "agents", "agent_versions", "agent_runs", "proposals", "contracts", "messages", "automations",
  ] as const;

  const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), org_id: auth.orgId };
  for (const t of tables) {
    const { data } = await supabase.from(t).select("*").eq("org_id", auth.orgId).limit(5000);
    dump[t] = data ?? [];
  }

  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="crm-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
