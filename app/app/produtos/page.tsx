import { getProductsFull, getAuthContext } from "@/lib/db";
import { ProductsManager } from "@/components/ProductsManager";
import { PermissionDenied } from "@/components/PermissionDenied";

export const metadata = { title: "Produtos & Serviços — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const ctx = await getAuthContext();
  if (ctx && ctx.orgId && ctx.role === "member") {
    return <PermissionDenied orgName={ctx.orgName} role={ctx.role} />;
  }
  const products = await getProductsFull();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Produtos & Serviços</h1>
        <p className="text-sm text-slate-500">Seu catálogo com preços. O agente de Proposta usa estes itens e valores — sem inventar preço.</p>
      </div>
      <ProductsManager products={products} />
    </main>
  );
}
