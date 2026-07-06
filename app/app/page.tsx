import { Building2 } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Board } from "@/components/Board";
import { getAgents, getAuthContext, getBoard, getProducts } from "@/lib/db";
import { logout } from "@/app/login/actions";

export default async function BoardPage({ searchParams }: { searchParams: { pipeline?: string } }) {
  const ctx = await getAuthContext();

  // Estado: logado, mas sem organização (bootstrap de signup falhou).
  if (ctx && ctx.memberships.length === 0) {
    return (
      <div className="min-h-screen">
        <Nav active="board" />
        <main className="mx-auto max-w-lg px-6 py-20 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Você ainda não pertence a uma organização</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sua conta foi criada, mas nenhuma organização está vinculada a ela. Normalmente a organização é criada
            automaticamente no cadastro — tente sair e entrar novamente. Se persistir, peça um convite a um
            administrador ou contate o suporte.
          </p>
          <form action={logout} className="mt-6">
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Sair e entrar novamente
            </button>
          </form>
        </main>
      </div>
    );
  }

  const [{ pipeline, pipelines, deals, contacts }, agents, products] = await Promise.all([getBoard(searchParams.pipeline), getAgents(), getProducts()]);

  return (
    <div className="min-h-screen">
      <Nav active="board" />
      <main className="mx-auto max-w-7xl px-6 py-6">
        {!pipeline ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            Nenhum funil encontrado nesta organização. Recarregue a página — o funil padrão é criado automaticamente
            no cadastro.
          </div>
        ) : (
          <Board pipeline={pipeline} pipelines={pipelines} deals={deals} contacts={contacts} agents={agents} products={products} myRole={ctx?.role ?? "member"} orgName={ctx?.orgName ?? ""} />
        )}
      </main>
    </div>
  );
}
