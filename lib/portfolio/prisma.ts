import "server-only";
import { PrismaClient } from "@prisma/client";

// ==========================================================================
// Cliente Prisma do módulo de portfólio.
//
// Por que "opcional": este repositório também roda o CRM, cujo deploy hoje só
// define as variáveis do Supabase. Sem DATABASE_URL, instanciar o PrismaClient
// lança em runtime e derrubaria /portfolio inteira (e o `next build`, que
// pré-renderiza a rota). Então o cliente é resolvido de forma preguiçosa e
// `getPrisma()` devolve null quando não há banco configurado — a camada de
// dados cai no dataset de demonstração. Ver docs/portfolio.md.
// ==========================================================================

declare global {
  // eslint-disable-next-line no-var
  var __portfolioPrisma: PrismaClient | null | undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Singleton. Em dev o Next recarrega os módulos a cada edição; guardar no
 * globalThis evita esgotar o pool de conexões do Postgres.
 */
export function getPrisma(): PrismaClient | null {
  if (!isDatabaseConfigured()) return null;
  if (global.__portfolioPrisma !== undefined) return global.__portfolioPrisma;

  try {
    const client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    global.__portfolioPrisma = client;
    return client;
  } catch (error) {
    console.error("[portfolio] falha ao inicializar o Prisma:", error);
    global.__portfolioPrisma = null;
    return null;
  }
}
