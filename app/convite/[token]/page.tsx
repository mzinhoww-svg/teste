import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteAction } from "@/app/actions";

export const metadata = { title: "Convite — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const [{ data: peek }, { data: { user } }] = await Promise.all([
    supabase.rpc("peek_invite", { p_token: params.token }),
    supabase.auth.getUser(),
  ]);

  const invalid = !peek?.found || peek.status !== "pending" || peek.expired;

  async function accept() {
    "use server";
    await acceptInviteAction(params.token);
    redirect("/app");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
        {invalid ? (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600">
              <ShieldAlert className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">Convite inválido</h1>
            <p className="mt-2 text-sm text-slate-500">
              {!peek?.found ? "Este convite não existe." : peek.expired ? "Este convite expirou (validade de 7 dias)." : "Este convite já foi utilizado ou cancelado."}
              {" "}Peça um novo link a quem convidou você.
            </p>
            <Link href="/" className="mt-6 inline-block rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Ir para a página inicial</Link>
          </>
        ) : (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <MailCheck className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">Convite para {peek.org_name}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Emitido para <strong className="text-slate-700">{peek.email}</strong> com papel{" "}
              <strong className="text-slate-700">{peek.role === "admin" ? "administrador(a)" : "membro"}</strong>.
            </p>
            {user ? (
              <form action={accept} className="mt-6">
                <button className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                  Aceitar convite e entrar
                </button>
                {user.email?.toLowerCase() !== String(peek.email).toLowerCase() && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Você está logado como {user.email}. O convite é para {peek.email} — o aceite será recusado.
                    Saia e entre com o e-mail correto.
                  </p>
                )}
              </form>
            ) : (
              <div className="mt-6 space-y-3">
                <Link href="/login" className="block w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                  Entrar ou criar conta para aceitar
                </Link>
                <p className="text-xs text-slate-400">
                  Use exatamente o e-mail <strong className="text-slate-600">{peek.email}</strong> e depois abra este link de novo.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
