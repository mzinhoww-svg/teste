import Link from "next/link";
import { FileText, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { brl } from "@/lib/format";
import { Download } from "lucide-react";

export const metadata = { title: "Proposta comercial — CRM AI Studio" };
export const dynamic = "force-dynamic";

type Peek = {
  found: boolean;
  org_name?: string;
  deal_title?: string;
  contact_name?: string;
  items?: { name: string; qty?: number; price?: number; total?: number }[];
  subtotal?: number;
  discount_pct?: number;
  total?: number;
  summary?: string;
  terms?: string;
  created_at?: string;
};

export default async function ProposalPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("peek_proposal", { p_token: params.token });
  const p = (data ?? { found: false }) as Peek;

  if (!p.found) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Proposta não encontrada</h1>
          <p className="mt-2 text-sm text-slate-500">Este link não corresponde a nenhuma proposta.</p>
          <Link href="/" className="mt-6 inline-block rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Página inicial</Link>
        </div>
      </div>
    );
  }

  const items = p.items ?? [];
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">AI</span>
            <span className="text-sm font-semibold text-slate-900">{p.org_name}</span>
          </div>
          <a
            href={`/api/proposta/${params.token}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Baixar PDF
          </a>
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
          <header className="flex items-center gap-2 text-brand-600">
            <FileText className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide">Proposta comercial</span>
          </header>
          <h1 className="mt-2 text-xl font-bold text-slate-900">{p.deal_title || "Proposta"}</h1>
          <p className="text-sm text-slate-500">
            {p.contact_name ? `${p.contact_name} · ` : ""}{p.org_name}
            {p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString("pt-BR")}` : ""}
          </p>

          {p.summary && <p className="mt-4 text-sm leading-relaxed text-slate-700">{p.summary}</p>}

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qtd</th>
                <th className="py-2 text-right">Valor</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 text-slate-700">{it.name}</td>
                  <td className="py-2 text-right text-slate-500">{it.qty ?? 1}</td>
                  <td className="py-2 text-right text-slate-500">{typeof it.price === "number" ? brl(it.price) : "—"}</td>
                  <td className="py-2 text-right font-medium text-slate-700">{typeof it.total === "number" ? brl(it.total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{brl(p.subtotal ?? 0)}</span></div>
            {typeof p.discount_pct === "number" && p.discount_pct > 0 && (
              <div className="flex justify-between text-slate-500"><span>Desconto</span><span>-{p.discount_pct}%</span></div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>Total</span><span>{brl(p.total ?? 0)}</span></div>
          </div>

          {p.terms && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Condições</div>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{p.terms}</p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
