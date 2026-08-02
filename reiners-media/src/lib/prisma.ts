/**
 * Prisma Client singleton (TCK-002).
 *
 * Em desenvolvimento o Next.js recarrega os módulos a cada alteração (hot reload).
 * Sem o cache em `globalThis`, cada recarga instanciaria um novo PrismaClient e
 * vazaria conexões até esgotar o pool do PostgreSQL. Em produção o módulo é
 * avaliado uma única vez, então instanciamos direto.
 */
import { PrismaClient } from '@prisma/client';

const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

type GlobalWithPrisma = typeof globalThis & {
  prisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
