import Link from "next/link";

// Boundary de "programa não encontrado", no visual do catálogo.
// Também é o que faz o Next devolver 404 de verdade para o slug inexistente:
// sem um boundary próprio no segmento, a resposta saía com status 200 e só a
// UI dizia que não existia — o que mente para buscadores e monitoramento.
export default function PodcastNotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-pf-xs uppercase tracking-pf-meta text-pf-inverse">Erro 404</p>
        <h1 className="mt-3 text-pf-program font-medium text-pf-primary">
          Programa não encontrado
        </h1>
        <p className="mt-4 text-pf-base text-pf-primary/70">
          Este endereço não corresponde a nenhum programa do catálogo. Ele pode ter sido
          renomeado ou despublicado.
        </p>
        <Link
          href="/portfolio"
          className="mt-8 inline-flex min-h-[44px] items-center rounded-pf-md bg-pf-inverse px-4 text-pf-xl font-medium text-pf-base transition-shadow duration-pf-fast ease-pf hover:shadow-pf-3"
        >
          Ver todos os programas
        </Link>
      </div>
    </main>
  );
}
