import type { Prisma } from "@prisma/client";

/**
 * Ponte entre os tipos de domínio (`Host[]`, `SocialLinks`, payloads de evento)
 * e o `InputJsonValue` do Prisma, que exige assinatura de índice estrutural.
 *
 * O cast é seguro para o que passamos aqui — objetos e arrays já validados,
 * sem `undefined`, funções ou ciclos. Centralizado num único ponto para que o
 * `as` não se espalhe pelas Server Actions.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
