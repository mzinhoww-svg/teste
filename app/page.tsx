import { Nav } from "@/components/Nav";
import { Board } from "@/components/Board";
import { getAgents, getBoard } from "@/lib/db";

export default async function BoardPage() {
  const [{ pipeline, deals, contacts }, agents] = await Promise.all([getBoard(), getAgents()]);

  return (
    <div className="min-h-screen">
      <Nav active="board" />
      <main className="mx-auto max-w-7xl px-6 py-6">
        {!pipeline ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            Nenhum funil encontrado para sua conta. Recarregue a página — o funil padrão é criado automaticamente no cadastro.
          </div>
        ) : (
          <Board pipeline={pipeline} deals={deals} contacts={contacts} agents={agents} />
        )}
      </main>
    </div>
  );
}
