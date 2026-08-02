/**
 * TCK-008 — Guarda automática de aderência ao design system.
 *
 * POR QUE ESTE ARQUIVO EXISTE (DEC-018)
 * ─────────────────────────────────────────────────────────────────────────────
 * `tailwind.config.ts` declara os tokens dentro de `extend`. Isso significa que
 * a paleta e a escala PADRÃO do Tailwind continuam vivas: `bg-red-500`,
 * `text-purple-400` e `p-7` geram CSS normalmente. Um componente escrito fora
 * do design system passa por `tsc`, passa por `eslint` e passa pelo grep de hex
 * do TCK-001 sem emitir um único aviso — ele só aparece como divergência visual
 * meses depois, quando a marca já foi diluída em quinze arquivos.
 *
 * A própria DEC-018 registra isso como "risco real e assumido" e adia a decisão
 * "para antes da onda 2, quando TCK-008 define os componentes base". É agora.
 * Como `theme` vs `extend` é contrato do TCK-001 (e `tailwind.config.ts` não
 * pertence a este ticket), a trava vira TESTE em vez de configuração: escopo
 * `src/components/ui/`, custo zero, e falha em CI antes do review humano.
 *
 * Escopo deliberado: apenas `src/components/ui/`. Cinco outros agentes escrevem
 * em paralelo agora; varrer o repositório inteiro faria esta suíte falhar por
 * arquivo alheio em edição, e um teste que falha por motivo alheio é um teste
 * que as pessoas aprendem a ignorar. TCK-023 pode ampliar o escopo quando as
 * ondas fecharem.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { tokens } from '@/lib/tokens';

const UI_DIR = path.resolve(__dirname, '../../../src/components/ui');

function readComponentFiles(): Array<{ file: string; source: string }> {
  return readdirSync(UI_DIR)
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => ({
      file: name,
      source: readFileSync(path.join(UI_DIR, name), 'utf8'),
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

// Negativos incluídos (`-me-2`). O lookahead barra fração (`h-1/2`) e
// sufixos (`w-1\\/2`), que não vêm da escala de espaçamento.
const SPACING_CLASS = new RegExp(`(?:^|[\\s'"\`])-?(${SPACING_UTILITIES})-(\\d+(?:\\.\\d+)?)(?![\\w./-])`, 'g');

const SPACING_TOKEN_KEYS = new Set(Object.keys(tokens.spacing));

describe('aderência ao design system em src/components/ui', () => {
  it('encontra os componentes para varrer', () => {
    // Guarda da guarda: um teste de varredura que não varre nada passa sempre.
    expect(componentFiles.length).toBeGreaterThanOrEqual(15);
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
      `${file}: cor literal só existe em src/lib/tokens.ts (critério de aceitação do projeto).`,
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
        if (value && !SPACING_TOKEN_KEYS.has(value)) {
          offenders.add(`${utility}-${value}`);
        }
      }

      expect(
        [...offenders],
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
      .filter(({ source }) => stripComments(source).includes('border-line-subtle'))
      .map(({ file }) => file);

    expect(
      offenders,
      'border-line-subtle só serve para divisórias internas de um bloco que já tem limite ' +
        'próprio; nenhum componente base precisa dele hoje.',
    ).toEqual([]);
  });

  it('declara foco visível em todo componente interativo', () => {
    // WCAG 2.2 §2.4.13. `globals.css` também cobre :focus-visible, mas o
    // componente carrega o próprio contrato: ninguém quebra o foco de um botão
    // mexendo só no CSS base.
    const interactive = ['button.tsx', 'input.tsx', 'textarea.tsx', 'select.tsx', 'tabs.tsx'];

    for (const file of interactive) {
      const entry = componentFiles.find((item) => item.file === file);
      expect(entry, `${file} não encontrado`).toBeDefined();
      expect(
        entry?.source.includes('focusRing') || entry?.source.includes('focus-visible:'),
        `${file}: componente interativo sem estado de foco visível.`,
      ).toBe(true);
    }
  });

  /**
   * Um detector que nunca dispara é um teste que sempre passa. Estes casos
   * provam que as varreduras acima realmente PEGAM as violações que dizem
   * pegar — e que não pegam o que é legítimo.
   */
  describe('os próprios detectores', () => {
    it('pega classes da paleta padrão do Tailwind', () => {
      expect('bg-red-500'.match(PALETTE_CLASS)).toEqual(['bg-red-500']);
      expect('text-purple-400'.match(PALETTE_CLASS)).toEqual(['text-purple-400']);
      expect('border-zinc-800'.match(PALETTE_CLASS)).toEqual(['border-zinc-800']);
      expect('ring-slate-950'.match(PALETTE_CLASS)).toEqual(['ring-slate-950']);
    });

    it('não confunde tokens semânticos com a paleta padrão', () => {
      const legit =
        'bg-surface-raised text-content-primary border-line-default bg-state-danger-surface text-brand-gold';
      expect(legit.match(PALETTE_CLASS)).toBeNull();
    });

    it('pega hex cru em qualquer formato', () => {
      expect('#0B0B0F'.match(RAW_HEX)).toEqual(['#0B0B0F']);
      expect('#fff'.match(RAW_HEX)).toEqual(['#fff']);
      expect('#d87dffcc'.match(RAW_HEX)).toEqual(['#d87dffcc']);
    });

    it('pega valores arbitrários de cor', () => {
      expect('bg-[#0B0B0F]'.match(ARBITRARY_COLOR)).toHaveLength(1);
      expect('text-[rgb(11_11_15)]'.match(ARBITRARY_COLOR)).toHaveLength(1);
      expect('h-4 w-full rounded-md'.match(ARBITRARY_COLOR)).toBeNull();
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
      const legit = ' p-6 h-10 gap-1.5 -me-2 w-full h-1/2 max-w-lg inset-0 ';
      for (const [, , value] of legit.matchAll(SPACING_CLASS)) {
        expect(SPACING_TOKEN_KEYS.has(value ?? '')).toBe(true);
      }
    });

    it('ignora prosa dentro de comentários', () => {
      const source = [
        '/** Navy #0B0B0F, e nunca bg-red-500. */',
        "const a = 'bg-surface-base';",
      ].join('\n');
      const clean = stripComments(source);
      expect(clean.match(RAW_HEX)).toBeNull();
      expect(clean.match(PALETTE_CLASS)).toBeNull();
      expect(clean).toContain('bg-surface-base');
    });
  });

  it('não referencia animações do TCK-010', () => {
    // `src/lib/animations.ts` é do TCK-010 e ainda não existe; um import
    // especulativo daqui quebraria o build de quem consumir estes componentes.
    const offenders = componentFiles
      .filter(({ source }) => /from ['"][^'"]*lib\/animations/.test(source))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
