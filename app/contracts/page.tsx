import { Nav } from "@/components/Nav";
import { ContractCard } from "@/components/ContractCard";
import { getContracts } from "@/lib/db";

export const metadata = { title: "Contratos — CRM AI Studio" };

export default async function ContractsPage() {
  const contracts = await getContracts();

  return (
    <div className="min-h-screen">
      <Nav active="contracts" />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Contratos</h1>
          <p className="text-sm text-slate-500">
            Gere contratos pelo Agente Jurídico no funil e gerencie cláusulas, status e assinatura aqui.
          </p>
        </div>

        {contracts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            Nenhum contrato ainda. Abra um deal no funil → <strong>Agente Jurídico / de Contratos</strong> → <em>Executar</em> para gerar o primeiro.
          </div>
        ) : (
          <div className="grid gap-4">
            {contracts.map((c) => <ContractCard key={c.id} c={c} />)}
          </div>
        )}
      </main>
    </div>
  );
}
