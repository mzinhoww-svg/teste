/**
 * TCK-009 — Guarda automática de aderência ao design system em
 * `src/components/layout/`.
 *
 * É o equivalente, para esta pasta, do `tests/unit/components/design-system.test.ts`
 * que o TCK-008 escreveu para `src/components/ui/`. O motivo é o mesmo (DEC-018):
 * `tailwind.config.ts` declara os tokens dentro de `extend`, então a paleta e a
 * escala PADRÃO do Tailwind continuam vivas — `bg-red-500`, `text-purple-400` e
 * `p-7` geram CSS normalmente. Um componente escrito fora do design system passa
 * por `tsc`, por `eslint` e pelo grep de hex do TCK-001 sem emitir um aviso; ele
 * só aparece como divergência visual meses depois.
 *
 * Escopo deliberado: apenas `src/components/layout/`. Outros agentes escrevem em
 * paralelo agora, e um teste que falha por arquivo alheio é um teste que as
 * pessoas aprendem a ignorar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO ESTE ARQUIVO SE PROVA
 * ─────────────────────────────────────────────────────────────────────────────
 * Uma varredura que nunca dispara é um teste que sempre passa. Toda regra aqui
 * é uma função de `scan*` e o bloco final "os próprios detectores" ALIMENTA cada
 * uma com código sintético violador — a mesma mutação que um humano faria à mão
 * no arquivo real, sem tocar no disco.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { tokens } from '@/lib/tokens';

const LAYOUT_DIR = path.resolve(__dirname, '../../../../src/components/layout');

function readComponentFiles(): Array<{ file: string; source: string }> {
  return readdirSync(LAYOUT_DIR)
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => ({
      file: name,
      source: readFileSync(path.join(LAYOUT_DIR, name), 'utf8'),
    }));
}

const componentFiles = readComponentFiles();

/** Remove blocos de comentário — a prosa dos docblocks cita cores e hex. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Paleta padrão do Tailwind, que os tokens semânticos substituem. */
const TAILWIND_PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
].join('|');

const COLOR_UTILITIES = [
  'bg', 'text', 'border', 'ring', 'outline', 'divide', 'from', 'via', 'to',
  'fill', 'stroke', 'shadow', 'decoration', 'accent', 'caret', 'placeholder',
].join('|');

const PALETTE_CLASS = new RegExp(
  `\\b(?:${COLOR_UTILITIES})-(?:${TAILWIND_PALETTE})-(?:50|\\d00|950)\\b`,
  'g',
);

/** Qualquer hex de cor — o repositório inteiro só pode tê-los nos tokens. */
const RAW_HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Valor arbitrário de cor: `bg-[#0B0B0F]`, `text-[rgb(...)]`. */
const ARBITRARY_COLOR = /\[(?:#|rgb|hsl|oklch|color-mix)/g;

/** Utilitários que consomem a escala de espaçamento dos tokens. */
const SPACING_UTILITIES = [
  'p', 'px', 'py', 'pt', 'pb', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mb', 'ms', 'me',
  'gap', 'gap-x', 'gap-y', 'space-x', 'space-y',
  'w', 'h', 'min-w', 'min-h', 'max-h', 'size',
  'inset', 'inset-x', 'inset-y', 'top', 'bottom', 'start', 'end',
].join('|');

// Negativos incluídos (`-me-2`). O lookahead barra fração (`h-1/2`), que não
// vem da escala de espaçamento.
const SPACING_CLASS = new RegExp(
  `(?:^|[\\s'"\`])-?(${SPACING_UTILITIES})-(\\d+(?:\\.\\d+)?)(?![\\w./-])`,
  'g',
);

const SPACING_TOKEN_KEYS = new Set(Object.keys(tokens.spacing));

/**
 * Duração/curva escrita à mão numa prop de motion do framer-motion.
 * O contrato do TCK-010 é: variante vem de `@/lib/animations`, que deriva
 * duração e easing dos tokens e degrada sob `prefers-reduced-motion`. Um
 * `transition={{ duration: 0.3 }}` aqui fura os dois lados de uma vez.
 */
const MAGIC_MOTION = /transition=\{\{[^}]*\b(?:duration|delay)\s*:\s*[\d.]+/g;

/* -------------------------------------------------------------------------- */
/* Detectores (funções, para que o bloco de mutação possa alimentá-los)        */
/* -------------------------------------------------------------------------- */

function scanPalette(source: string): string[] {
  return stripComments(source).match(PALETTE_CLASS) ?? [];
}

function scanRawHex(source: string): string[] {
  return stripComments(source).match(RAW_HEX) ?? [];
}

function scanArbitraryColor(source: string): string[] {
  return stripComments(source).match(ARBITRARY_COLOR) ?? [];
}

function scanSpacing(source: string): string[] {
  const offenders = new Set<string>();
  for (const match of stripComments(source).matchAll(SPACING_CLASS)) {
    const [, utility, value] = match;
    if (value && !SPACING_TOKEN_KEYS.has(value)) {
      offenders.add(`${utility}-${value}`);
    }
  }
  return [...offenders];
}

function scanSubtleBorder(source: string): string[] {
  return stripComments(source).match(/border-line-subtle/g) ?? [];
}

function scanMagicMotion(source: string): string[] {
  return stripComments(source).match(MAGIC_MOTION) ?? [];
}

/* -------------------------------------------------------------------------- */
/* Varredura dos arquivos reais                                               */
/* -------------------------------------------------------------------------- */

describe('aderência ao design system em src/components/layout', () => {
  it('encontra os componentes para varrer', () => {
    // Guarda da guarda: uma varredura que não varre nada passa sempre.
    expect(componentFiles.length).toBeGreaterThanOrEqual(7);
    expect(componentFiles.map(({ file }) => file)).toEqual(
      expect.arrayContaining([
        'navbar.tsx',
        'footer.tsx',
        'admin-sidebar.tsx',
        'mobile-drawer.tsx',
        'admin-layout.tsx',
        'skip-link.tsx',
        'nav-config.ts',
      ]),
    );
  });

  it.each(componentFiles.map(({ file }) => file))(
    '%s não usa a paleta padrão do Tailwind',
    (file) => {
      const entry = componentFiles.find((item) => item.file === file);
      expect(
        scanPalette(entry?.source ?? ''),
        `${file}: use tokens semânticos (bg-surface-*, text-content-*, border-line-*, ` +
          `bg-state-*) — a paleta padrão do Tailwind gera CSS mas quebra a identidade.`,
      ).toEqual([]);
    },
  );

  it.each(componentFiles.map(({ file }) => file))('%s não contém hex cru', (file) => {
    const entry = componentFiles.find((item) => item.file === file);
    expect(
      scanRawHex(entry?.source ?? ''),
      `${file}: cor literal só existe em src/lib/tokens.ts.`,
    ).toEqual([]);
  });

  it.each(componentFiles.map(({ file }) => file))(
    '%s não usa valor de cor arbitrário',
    (file) => {
      const entry = componentFiles.find((item) => item.file === file);
      expect(
        scanArbitraryColor(entry?.source ?? ''),
        `${file}: valor arbitrário escapa do theme system e do dark mode por classe.`,
      ).toEqual([]);
    },
  );

  it.each(componentFiles.map(({ file }) => file))(
    '%s só usa degraus da escala de espaçamento dos tokens',
    (file) => {
      const entry = componentFiles.find((item) => item.file === file);
      expect(
        scanSpacing(entry?.source ?? ''),
        `${file}: a escala de espaçamento é a de tokens.ts (0, px, 0.5, 1, 1.5, 2, 3, 4, 5, 6, ` +
          `8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80). Degraus como p-7 ou h-9 vêm do ` +
          `default do Tailwind e continuam gerando CSS por causa de DEC-018.`,
      ).toEqual([]);
    },
  );

  it('não usa border-line-subtle como limite de componente', () => {
    // `border.subtle` é ~1.1:1 — decorativo por definição no próprio token.
    // Limite de componente é `border-line-default` (>= 3:1) ou `shadow-raised`
    // (que embute o hairline). WCAG 2.2 §1.4.11.
    const offenders = componentFiles
      .filter(({ source }) => scanSubtleBorder(source).length > 0)
      .map(({ file }) => file);

    expect(
      offenders,
      'a Navbar, o Footer, a AdminSidebar e o drawer usam a borda como ÚNICO separador ' +
        'do conteúdo — nenhum deles pode desenhá-la com o token decorativo.',
    ).toEqual([]);
  });

  it('não escreve duração nem curva de animação à mão', () => {
    const offenders = componentFiles
      .filter(({ source }) => scanMagicMotion(source).length > 0)
      .map(({ file }) => file);

    expect(
      offenders,
      'movimento vem de @/lib/animations (que deriva dos tokens e degrada sob ' +
        'prefers-reduced-motion), nunca de números escritos na prop.',
    ).toEqual([]);
  });

  it('declara foco visível em todo componente com elemento focável', () => {
    // WCAG 2.2 §2.4.13. `globals.css` também cobre `:focus-visible`, mas o
    // componente carrega o próprio contrato: ninguém quebra o foco de um link
    // mexendo só no CSS base.
    const interactive = ['navbar.tsx', 'footer.tsx', 'admin-sidebar.tsx', 'skip-link.tsx'];

    for (const file of interactive) {
      const entry = componentFiles.find((item) => item.file === file);
      expect(entry, `${file} não encontrado`).toBeDefined();
      expect(
        /focus-visible:|focusRing|buttonVariants|sr-only-focusable/.test(entry?.source ?? ''),
        `${file}: elemento focável sem estado de foco visível declarado.`,
      ).toBe(true);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Fronteira server/client                                                   */
  /* ------------------------------------------------------------------------ */

  describe("fronteira 'use client'", () => {
    const directive = (file: string): boolean => {
      const entry = componentFiles.find((item) => item.file === file);
      return /^\s*'use client';/.test(entry?.source ?? '');
    };

    it.each(['navbar.tsx', 'mobile-drawer.tsx', 'admin-sidebar.tsx'])(
      '%s é Client Component (tem estado/efeito/evento)',
      (file) => {
        expect(directive(file), `${file}: interatividade exige 'use client'.`).toBe(true);
      },
    );

    it.each(['footer.tsx', 'skip-link.tsx', 'admin-layout.tsx', 'nav-config.ts'])(
      '%s permanece Server Component (zero JS no cliente)',
      (file) => {
        expect(
          directive(file),
          `${file}: é estático — marcar 'use client' manda JS para o browser à toa (NFR-001).`,
        ).toBe(false);
      },
    );

    it('nenhum Server Component importa hook do React', () => {
      for (const file of ['footer.tsx', 'skip-link.tsx', 'admin-layout.tsx']) {
        const entry = componentFiles.find((item) => item.file === file);
        expect(
          /\b(useState|useEffect|useRef|useId|useCallback|useSyncExternalStore)\s*\(/.test(
            stripComments(entry?.source ?? ''),
          ),
          `${file}: hook num Server Component quebra o build do App Router.`,
        ).toBe(false);
      }
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Mutação: os próprios detectores                                          */
  /* ------------------------------------------------------------------------ */

  describe('os próprios detectores (mutação)', () => {
    it('pega classes da paleta padrão do Tailwind', () => {
      expect(scanPalette("className='bg-red-500'")).toEqual(['bg-red-500']);
      expect(scanPalette("className='text-purple-400'")).toEqual(['text-purple-400']);
      expect(scanPalette("className='border-zinc-800'")).toEqual(['border-zinc-800']);
      expect(scanPalette("className='ring-slate-950'")).toEqual(['ring-slate-950']);
    });

    it('não confunde os tokens semânticos usados nesta pasta', () => {
      const legit =
        'bg-surface-raised text-content-primary border-line-default bg-surface-accent ' +
        'text-content-brand border-line-accent bg-surface-overlay/80 text-content-on-accent';
      expect(scanPalette(legit)).toEqual([]);
    });

    it('pega hex cru em qualquer formato', () => {
      expect(scanRawHex("const navy = '#0B0B0F';")).toEqual(['#0B0B0F']);
      expect(scanRawHex("const w = '#fff';")).toEqual(['#fff']);
      expect(scanRawHex("const o = '#d87dffcc';")).toEqual(['#d87dffcc']);
    });

    it('pega valores arbitrários de cor', () => {
      expect(scanArbitraryColor("className='bg-[#0B0B0F]'")).toHaveLength(1);
      expect(scanArbitraryColor("className='text-[rgb(11_11_15)]'")).toHaveLength(1);
      // `transition-[width]` é legítimo: não é cor.
      expect(scanArbitraryColor("className='transition-[width] h-4 rounded-md'")).toEqual([]);
    });

    it('pega espaçamento fora da escala de tokens', () => {
      expect(scanSpacing(" className='p-7 h-9 gap-14' ").sort()).toEqual([
        'gap-14',
        'h-9',
        'p-7',
      ]);
    });

    it('aceita a escala de tokens, inclusive negativos, frações e palavras', () => {
      const legit = " className='p-6 h-16 w-64 gap-1.5 -me-2 w-full h-1/2 max-w-sm inset-0 min-h-screen mt-auto' ";
      expect(scanSpacing(legit)).toEqual([]);
    });

    it('pega o token decorativo usado como limite', () => {
      expect(scanSubtleBorder("className='border border-line-subtle'")).toEqual([
        'border-line-subtle',
      ]);
      expect(scanSubtleBorder("className='border border-line-default'")).toEqual([]);
    });

    it('pega duração e delay escritos à mão numa prop de motion', () => {
      expect(scanMagicMotion('<motion.div transition={{ duration: 0.3 }} />')).toHaveLength(1);
      expect(scanMagicMotion('<motion.div transition={{ delay: 0.12, ease: x }} />')).toHaveLength(
        1,
      );
      // O caminho correto: a variante já traz a transição derivada dos tokens.
      expect(
        scanMagicMotion('<motion.div variants={slideVariants("up", { reduced })} />'),
      ).toEqual([]);
    });

    it('ignora prosa dentro de comentários', () => {
      const source = [
        '/** Navy #0B0B0F, e nunca bg-red-500 nem p-7. */',
        "const a = 'bg-surface-base';",
      ].join('\n');
      const clean = stripComments(source);

      expect(scanRawHex(clean)).toEqual([]);
      expect(scanPalette(clean)).toEqual([]);
      expect(scanSpacing(clean)).toEqual([]);
      expect(clean).toContain('bg-surface-base');
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Contrato de motion                                                        */
  /* ------------------------------------------------------------------------ */

  it('todo arquivo que usa framer-motion também respeita reduced-motion', () => {
    // A variante degradada só existe se `reduced` for passado; um `motion.div`
    // com variantes cruas anima igual para quem pediu para não animar
    // (WCAG 2.2 §2.3.3).
    const usesFramer = componentFiles.filter(({ source }) =>
      /from ['"]framer-motion['"]/.test(source),
    );

    expect(usesFramer.length).toBeGreaterThan(0);

    for (const { file, source } of usesFramer) {
      expect(
        source.includes('useReducedMotion'),
        `${file}: importa framer-motion sem consultar useReducedMotion.`,
      ).toBe(true);
      expect(
        /from ['"]@\/lib\/animations['"]/.test(source),
        `${file}: variantes devem vir de @/lib/animations (TCK-010).`,
      ).toBe(true);
    }
  });
});
