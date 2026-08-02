/**
 * TCK-016 — Guarda de design system em `src/components/programa/`.
 *
 * Mesma razão de existir da guarda do TCK-008 (DEC-018): `tailwind.config.ts`
 * declara os tokens dentro de `extend`, então a paleta e a escala PADRÃO do
 * Tailwind continuam gerando CSS. `bg-red-500`, `p-7` e `text-[#d87dff]` passam
 * por `tsc`, passam por `eslint` e só aparecem como divergência visual muito
 * depois. A trava é teste, não configuração — `tailwind.config.ts` não pertence
 * a este ticket.
 *
 * Escopo: apenas `src/components/programa/` (recursivo). Outros agentes
 * escrevem em paralelo; varrer o repositório faria esta suíte falhar por
 * arquivo alheio, e um teste que falha por motivo alheio é um teste que as
 * pessoas aprendem a ignorar.
 *
 * O bloco final ("os próprios detectores") é a PROVA POR MUTAÇÃO: cada regex é
 * alimentada com uma violação sintética e com um caso legítimo. Sem isso, uma
 * varredura que nunca casa com nada passaria para sempre — inclusive se alguém
 * quebrasse a regex.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { tokens } from '@/lib/tokens';

const PROGRAMA_DIR = path.resolve(__dirname, '../../../../src/components/programa');

interface SourceFile {
  file: string;
  source: string;
}

/** Varredura recursiva: a pasta pode ganhar subpastas sem furar a guarda. */
function readSourceFiles(dir: string, prefix = ''): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return readSourceFiles(path.join(dir, entry.name), relative);
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) return [];
    return [{ file: relative, source: readFileSync(path.join(dir, entry.name), 'utf8') }];
  });
}

const componentFiles = readSourceFiles(PROGRAMA_DIR);

/** Remove blocos de comentário — a prosa dos docblocks cita cores e classes. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

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

/** Qualquer hex de cor — no repositório inteiro eles só existem nos tokens. */
const RAW_HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Valor arbitrário de cor: `bg-[#0B0B0F]`, `text-[rgb(...)]`. */
const ARBITRARY_COLOR = /\[(?:#|rgb|hsl|oklch|color-mix)/g;

const SPACING_UTILITIES = [
  'p', 'px', 'py', 'pt', 'pb', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mb', 'ms', 'me',
  'gap', 'gap-x', 'gap-y', 'space-x', 'space-y',
  'w', 'h', 'min-w', 'min-h', 'max-h', 'size',
  'inset', 'inset-x', 'inset-y', 'top', 'bottom', 'start', 'end',
].join('|');

const SPACING_CLASS = new RegExp(
  `(?:^|[\\s'"\`])-?(${SPACING_UTILITIES})-(\\d+(?:\\.\\d+)?)(?![\\w./-])`,
  'g',
);

const SPACING_TOKEN_KEYS = new Set(Object.keys(tokens.spacing));

describe('aderência ao design system em src/components/programa', () => {
  it('encontra os arquivos para varrer', () => {
    // Guarda da guarda: uma varredura que não varre nada passa sempre.
    expect(componentFiles.length).toBeGreaterThanOrEqual(8);
  });

  it.each(componentFiles.map(({ file }) => file))(
    '%s não usa a paleta padrão do Tailwind',
    (file) => {
      const entry = componentFiles.find((item) => item.file === file);
      const matches = stripComments(entry?.source ?? '').match(PALETTE_CLASS) ?? [];
      expect(
        matches,
        `${file}: use tokens semânticos (bg-surface-*, text-content-*, border-line-*, ` +
          `bg-state-*) — a paleta padrão do Tailwind gera CSS mas quebra a identidade.`,
      ).toEqual([]);
    },
  );

  it.each(componentFiles.map(({ file }) => file))('%s não contém hex cru', (file) => {
    const entry = componentFiles.find((item) => item.file === file);
    const matches = stripComments(entry?.source ?? '').match(RAW_HEX) ?? [];
    expect(
      matches,
      `${file}: cor literal só existe em src/lib/tokens.ts. A cor por programa vem de ` +
        `\`accentColor\` (dado, não literal) e só decora.`,
    ).toEqual([]);
  });

  it.each(componentFiles.map(({ file }) => file))(
    '%s não usa valor de cor arbitrário',
    (file) => {
      const entry = componentFiles.find((item) => item.file === file);
      const matches = stripComments(entry?.source ?? '').match(ARBITRARY_COLOR) ?? [];
      expect(
        matches,
        `${file}: valor arbitrário escapa do theme system e do dark mode por classe.`,
      ).toEqual([]);
    },
  );

  it.each(componentFiles.map(({ file }) => file))(
    '%s só usa degraus da escala de espaçamento dos tokens',
    (file) => {
      const entry = componentFiles.find((item) => item.file === file);
      const source = stripComments(entry?.source ?? '');

      const offenders = new Set<string>();
      for (const match of source.matchAll(SPACING_CLASS)) {
        const [, utility, value] = match;
        if (value && !SPACING_TOKEN_KEYS.has(value)) offenders.add(`${utility}-${value}`);
      }

      expect(
        [...offenders],
        `${file}: a escala é a de tokens.ts. Degraus como p-7 ou h-9 vêm do default do ` +
          `Tailwind e continuam gerando CSS por causa de DEC-018.`,
      ).toEqual([]);
    },
  );

  it('não usa border-line-subtle como limite de componente', () => {
    // `border.subtle` é ~1.1:1 — decorativo por definição no próprio token.
    // Limite é `border-line-default` (>= 3:1) ou `shadow-raised`/`shadow-poster`
    // (que embutem o hairline). WCAG 2.2 §1.4.11.
    const offenders = componentFiles
      .filter(({ source }) => stripComments(source).includes('border-line-subtle'))
      .map(({ file }) => file);

    expect(
      offenders,
      'border-line-subtle não delimita nada; use border-line-default ou shadow-raised/poster.',
    ).toEqual([]);
  });

  it('todo bloco com fundo próprio carrega um limite de verdade', () => {
    // Regra positiva, complementar à anterior: `surface.raised` sobre
    // `surface.base` é ~1.07:1 nos dois temas, então `bg-surface-raised` sozinho
    // não mostra onde o bloco começa.
    const offenders = componentFiles.filter(({ source }) => {
      const clean = stripComments(source);
      if (!clean.includes('bg-surface-raised')) return false;
      return !(
        clean.includes('border-line-default') ||
        clean.includes('shadow-raised') ||
        clean.includes('shadow-poster')
      );
    });

    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it('respeita prefers-reduced-motion em quem anima', () => {
    // Só o componente de cliente anima. Se ele importar framer-motion sem
    // `useReducedMotion`, o media query do CSS não o alcança (o framer escreve
    // transform inline via JS) — WCAG 2.2 §2.3.3.
    const animated = componentFiles.filter(({ source }) =>
      /from ['"]framer-motion['"]/.test(stripComments(source)),
    );

    expect(animated.length).toBeGreaterThan(0);
    for (const { file, source } of animated) {
      expect(source, `${file}: anima sem consultar useReducedMotion`).toContain(
        'useReducedMotion',
      );
      expect(source, `${file}: variante de motion tem que vir de @/lib/animations`).toMatch(
        /from ['"]@\/lib\/animations['"]/,
      );
      // NFR-001: `motion.*` arrasta o feature set completo do framer para a
      // rota. `LazyMotion features={domAnimation}` + `m.*` carrega só o que um
      // fade precisa.
      expect(stripComments(source), `${file}: use LazyMotion + m, não motion.*`).not.toMatch(
        /\bmotion\.[a-z]/,
      );
      expect(source, `${file}: LazyMotion ausente`).toContain('LazyMotion');
    }
  });

  it('só o componente de abas é Client Component', () => {
    // A página e o hero têm que ser Server Components (zero JS). Uma diretiva
    // `'use client'` nova aqui contamina tudo que a importa.
    const clientFiles = componentFiles
      .filter(({ source }) => /^['"]use client['"]/m.test(source))
      .map(({ file }) => file);

    expect(clientFiles).toEqual(['tabs.tsx']);
  });

  it('nenhum Server Component chama `buttonVariants` do módulo de cliente', () => {
    // `ui/button.tsx` é `'use client'`: toda export dele vira client reference
    // e chamar `buttonVariants()` no servidor estoura em runtime, não em build.
    const offenders = componentFiles
      .filter(({ source }) => {
        const clean = stripComments(source);
        return clean.includes('buttonVariants') && !/^['"]use client['"]/m.test(source);
      })
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  /**
   * PROVA POR MUTAÇÃO — cada detector recebe uma violação sintética e um caso
   * legítimo. Um detector que nunca dispara é um teste que sempre passa.
   */
  describe('os próprios detectores', () => {
    it('pega classes da paleta padrão do Tailwind', () => {
      expect('bg-red-500'.match(PALETTE_CLASS)).toEqual(['bg-red-500']);
      expect('text-purple-400'.match(PALETTE_CLASS)).toEqual(['text-purple-400']);
      expect('border-zinc-800'.match(PALETTE_CLASS)).toEqual(['border-zinc-800']);
    });

    it('não confunde tokens semânticos com a paleta padrão', () => {
      const legit =
        'bg-surface-raised text-content-primary border-line-default bg-state-success-surface';
      expect(legit.match(PALETTE_CLASS)).toBeNull();
    });

    it('pega hex cru em qualquer formato', () => {
      expect('#0B0B0F'.match(RAW_HEX)).toEqual(['#0B0B0F']);
      expect('#fff'.match(RAW_HEX)).toEqual(['#fff']);
      expect('#d87dffcc'.match(RAW_HEX)).toEqual(['#d87dffcc']);
    });

    it('pega valores arbitrários de cor sem confundir com aspect-[21/9]', () => {
      expect('bg-[#0B0B0F]'.match(ARBITRARY_COLOR)).toHaveLength(1);
      expect('text-[rgb(11_11_15)]'.match(ARBITRARY_COLOR)).toHaveLength(1);
      expect('aspect-[21/9] h-4 w-full'.match(ARBITRARY_COLOR)).toBeNull();
    });

    it('pega espaçamento fora da escala de tokens', () => {
      const found = [...' p-7 h-9 gap-14 '.matchAll(SPACING_CLASS)].map(
        ([, utility, value]) => `${utility}-${value}`,
      );
      expect(found).toEqual(['p-7', 'h-9', 'gap-14']);
      for (const [, , value] of ' p-7 h-9 gap-14 '.matchAll(SPACING_CLASS)) {
        expect(SPACING_TOKEN_KEYS.has(value ?? '')).toBe(false);
      }
    });

    it('aceita a escala de tokens, inclusive negativos e frações', () => {
      const legit = ' p-6 h-10 gap-1.5 -me-2 w-full h-1/2 max-w-3xl inset-0 ';
      for (const [, , value] of legit.matchAll(SPACING_CLASS)) {
        expect(SPACING_TOKEN_KEYS.has(value ?? '')).toBe(true);
      }
    });

    it('ignora prosa dentro de comentários', () => {
      const source = [
        '/** Orquídea #d87dff, e nunca bg-red-500. */',
        "const a = 'bg-surface-base';",
      ].join('\n');
      const clean = stripComments(source);

      expect(clean.match(RAW_HEX)).toBeNull();
      expect(clean.match(PALETTE_CLASS)).toBeNull();
      expect(clean).toContain('bg-surface-base');
    });

    it('a varredura de "use client" distingue diretiva de menção em texto', () => {
      const directive = "'use client';\n\nimport x from 'y';";
      const mention = "// este arquivo NÃO é 'use client'\nconst a = 1;";

      expect(/^['"]use client['"]/m.test(directive)).toBe(true);
      expect(/^['"]use client['"]/m.test(mention)).toBe(false);
    });

    it('a varredura de limite pega bloco com fundo e sem borda', () => {
      const semLimite = "const a = 'rounded-lg bg-surface-raised p-6';";
      const comLimite = "const a = 'rounded-lg border border-line-default bg-surface-raised p-6';";
      const detect = (source: string) =>
        source.includes('bg-surface-raised') &&
        !(
          source.includes('border-line-default') ||
          source.includes('shadow-raised') ||
          source.includes('shadow-poster')
        );

      expect(detect(semLimite)).toBe(true);
      expect(detect(comLimite)).toBe(false);
    });
  });
});
