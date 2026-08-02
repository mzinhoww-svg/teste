import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { clientSignupAndAccept } from "@/app/portal/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Acesso ao portal — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function PortalInvitePage({
  params, searchParams,
}: { params: { token: string }; searchParams: { error?: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("peek_client_invite", { p_token: params.token });
  const inv = data as { found?: boolean; org_name?: string; client_name?: string; email?: string; status?: string; expired?: boolean } | null;

  const invalid = !inv?.found || inv.status !== "pending" || inv.expired;

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Portal do cliente</h1>
          {inv?.found && !invalid ? (
            <p className="mt-1 text-sm text-slate-500">
              Convite de <strong className="text-slate-700 dark:text-slate-200">{inv.org_name}</strong> para acessar o espaço de <strong className="text-slate-700 dark:text-slate-200">{inv.client_name}</strong>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Este convite não é mais válido.</p>
          )}
        </div>

        {invalid ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Convite inexistente, expirado ou já utilizado. Peça um novo link ao seu contato.
          </div>
        ) : (
          <form action={clientSignupAndAccept} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <input type="hidden" name="token" value={params.token} />
            {searchParams.error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" role="alert">{searchParams.error}</div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">E-mail do convite</label>
              <Input name="email" type="email" required defaultValue={inv?.email ?? ""} placeholder="voce@empresa.com" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Senha</label>
              <Input name="password" type="password" required minLength={6} placeholder="crie uma senha (mín. 6)" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" name="mode" value="signup" className="flex-1">Criar acesso</Button>
              <Button type="submit" name="mode" value="login" variant="outline" className="flex-1">Já tenho conta</Button>
            </div>
            <p className="text-center text-[11px] leading-relaxed text-slate-400">
              Ao entrar você vê propostas, contratos, faturas, projetos e documentos do seu contrato.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
