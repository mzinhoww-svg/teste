import Link from "next/link";
import { CheckCircle2, FileSignature, ShieldAlert, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { brl } from "@/lib/format";

export const metadata = { title: "Assinatura de contrato — CRM AI Studio" };
export const dynamic = "force-dynamic";

type Peek = {
  found: boolean;
  org_name?: string;
  reference?: string;
  title?: string;
  value?: number;
  clauses?: { heading: string; body: string }[];
  signatories?: { name: string; email: string; role?: string; party?: string }[];
  provider?: string | null;
  external_signing_url?: string | null;
  certificate_url?: string | null;
  status?: string;
  signed?: boolean;
  signed_at?: string | null;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">AI</span>
          <span className="text-sm font-semibold text-slate-900">CRM AI Studio</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function SignContractPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("peek_contract_signature", { p_token: params.token });
  const c = (data ?? { found: false }) as Peek;

  if (!c.found) {
    return (
      <Shell>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Link de assinatura inválido</h1>
          <p className="mt-2 text-sm text-slate-500">
            Este link não corresponde a nenhum contrato. Peça um novo link a quem enviou.
          </p>
          <Link href="/" className="mt-6 inline-block rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Página inicial</Link>
        </div>
      </Shell>
    );
  }

  const isDemo = c.provider !== "opensign" || !c.external_signing_url;

  // Assinatura pela página interna (fluxo demonstração). Bloqueio de duplicidade
  // acontece no servidor (sign_contract_by_token) e aqui na UI.
  async function sign(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim() || null;
    const sb = createClient();
    await sb.rpc("sign_contract_by_token", { p_token: params.token, p_signer_name: name });
  }

  if (c.signed) {
    return (
      <Shell>
        <div className="rounded-xl border border-emerald-200 bg-white p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Contrato já assinado</h1>
          <p className="mt-2 text-sm text-slate-500">
            {c.reference} — {c.org_name}. {c.signed_at ? `Assinado em ${new Date(c.signed_at).toLocaleString("pt-BR")}.` : ""} Não é necessário assinar novamente.
          </p>
          {c.certificate_url && (
            <a href={c.certificate_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Ver documento assinado
            </a>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2 text-brand-600">
          <FileSignature className="h-5 w-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">Assinatura de contrato</span>
        </div>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">{c.title}</h1>
        <p className="text-sm text-slate-500">{c.reference} · {c.org_name}{typeof c.value === "number" ? ` · ${brl(c.value)}` : ""}</p>

        {c.signatories && c.signatories.length > 0 && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Partes</div>
            <ul className="mt-1.5 space-y-1">
              {c.signatories.map((s, i) => (
                <li key={i} className="text-slate-700">{s.name} <span className="text-slate-400">· {s.role ?? s.party ?? ""} · {s.email}</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200 p-4 text-sm">
          {(c.clauses ?? []).map((cl, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <div className="font-medium text-slate-800">{cl.heading}</div>
              <p className="text-slate-600">{cl.body}</p>
            </div>
          ))}
        </div>

        {isDemo ? (
          <>
            <div className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Assinatura em modo demonstração. Para assinatura com validade jurídica, configure o OpenSign
              (variáveis OPENSIGN_*). O aceite abaixo registra a assinatura no CRM para fins de teste.
            </div>
            <form action={sign} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Seu nome completo</label>
                <input name="name" required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" placeholder="Nome de quem assina" />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-brand-600" />
                Li e concordo com os termos deste contrato.
              </label>
              <button type="submit" className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Assinar contrato
              </button>
            </form>
          </>
        ) : (
          <a href={c.external_signing_url!} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            <FileSignature className="h-4 w-4" aria-hidden /> Assinar no OpenSign
          </a>
        )}
      </div>
    </Shell>
  );
}
