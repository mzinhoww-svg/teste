import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Índice do portal (app.<root>/). Resolve o cliente do usuário logado e manda
// para /portal/<slug>. Sem sessão → login.
export default async function PortalIndex() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("client_users")
    .select("client_accounts(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const slug = (data?.client_accounts as { slug?: string } | null)?.slug;
  redirect(slug ? `/portal/${slug}` : "/login");
}
