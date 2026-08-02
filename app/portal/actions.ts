"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Signup/login do PORTAL DO CLIENTE. O signup passa metadata role='portal' — o
// trigger handle_new_user (migration 0010) então NÃO cria org/membership/agentes.
// Sem e-mail transacional: o acesso vem do link de convite.

export async function clientSignupAndAccept(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const mode = String(formData.get("mode") ?? "signup");
  const supabase = createClient();

  if (mode === "signup") {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { role: "portal" } },
    });
    if (error) return redirect(`/portal/convite/${token}?error=${encodeURIComponent(error.message)}`);
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return redirect(`/portal/convite/${token}?error=${encodeURIComponent(signInError.message)}`);
  }

  const { data, error } = await supabase.rpc("accept_client_invite", { p_token: token });
  if (error || !data?.ok) {
    return redirect(`/portal/convite/${token}?error=${encodeURIComponent(data?.error ?? error?.message ?? "Falha ao aceitar convite")}`);
  }

  revalidatePath("/", "layout");
  redirect(`/portal/${data.client_slug}`);
}

// Cliente aprova uma entrega pelo portal. A RPC (SECURITY DEFINER) valida
// is_client_user e o estado; notifica a agência.
export async function approveDeliverable(id: string, clientSlug: string) {
  const supabase = createClient();
  const { data } = await supabase.rpc("approve_deliverable", { p_id: id });
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao aprovar entrega");
  revalidatePath(`/portal/${clientSlug}/documentos`);
}
