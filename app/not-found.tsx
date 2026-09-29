import type { Metadata } from "next";
import Link from "next/link";
import { SiteBadge } from "@/components/site/badge";
import { BrandLockup } from "@/components/site/brand";
import { SiteButtonLink } from "@/components/site/button";

// 404 da marca — em português e com o lockup, no lugar da página em inglês do
// Next. Cobre as rotas públicas que respondem 404 (hoje, /portfolio enquanto o
// portfólio está oculto: quem abre um link antigo cai aqui, não numa tela
// branca) e o notFound() do CRM. O Next já marca páginas 404 com noindex.

export const metadata: Metadata = {
  title: "Página não encontrada — Reiners Media",
};

export default function NotFound() {
  return (
    <main className="site-root flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
      <Link href="/" aria-label="Reiners Media — início" className="rounded-site-sm">
        <BrandLockup symbolHeight={40} signatureClassName="text-[20px]" />
      </Link>

      <SiteBadge className="mt-14">Erro 404</SiteBadge>
      <h1 className="mt-4 font-serif text-site-h2 font-semibold text-site-text-primary">
        Página não encontrada
      </h1>
      <p className="mt-4 max-w-[420px] text-site-base text-site-text-primary/70">
        O endereço que você abriu não existe ou foi retirado do ar.
      </p>

      <SiteButtonLink href="/" variant="primary" className="mt-10">
        Voltar ao início
      </SiteButtonLink>
    </main>
  );
}
