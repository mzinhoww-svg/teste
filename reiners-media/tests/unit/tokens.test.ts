/**
 * TCK-001 — Testes do design token system.
 *
 * Cobertura:
 *  - integridade: todo token semântico resolve para um valor definido;
 *  - nenhum token de cor é string vazia / hex inválido;
 *  - tokens semânticos referenciam primitivos (sem hex "solto");
 *  - escala tipográfica estritamente monotônica crescente;
 *  - contraste WCAG 2.2 AA (>= 4.5:1) de texto sobre superfície — cálculo
 *    implementado aqui, sem depender da lib sob teste;
 *  - motion com durações plausíveis;
 *  - sincronia entre `tokens.ts`, `globals.css` e `tailwind.config.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  colorCssVariables,
  colorGroupNames,
  colorVar,
  colorVarName,
  colorVarWithAlpha,
  hexToChannels,
  kebabCase,
  primitives,
  resolveColor,
  staticCssVariables,
  tailwindColorGroupAlias,
  tokens,
  typographyScaleOrder,
} from '@/lib/tokens';
import type {
  ColorScheme,
  ColorToken,
  ColorTokenPath,
  HexColor,
} from '@/types/tokens';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const SCHEMES: readonly ColorScheme[] = ['light', 'dark'];
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Contraste WCAG 2.x — implementação independente, para o teste ser oráculo. */
function relativeLuminance(hex: string): number {
  const raw = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(raw.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Todos os tokens de cor como tuplas `[caminho, token]`. */
function everyColorToken(): Array<[ColorTokenPath, ColorToken]> {
  const entries: Array<[ColorTokenPath, ColorToken]> = [];

  for (const group of colorGroupNames) {
    const groupTokens = tokens.color[group] as Readonly<Record<string, ColorToken>>;
    for (const [key, token] of Object.entries(groupTokens)) {
      entries.push([`${group}.${key}` as ColorTokenPath, token]);
    }
  }

  return entries;
}

/** Achatamento recursivo de qualquer sub-árvore de tokens. */
function flatten(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (value === null || typeof value !== 'object') {
    throw new Error(`Token não serializável em "${prefix}": ${String(value)}`);
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

const allPrimitiveValues = new Set(flatten(primitives).map(([, value]) => value));

const readSource = (relative: string): string =>
  readFileSync(path.resolve(process.cwd(), relative), 'utf8');

const globalsCss = readSource('src/styles/globals.css');
const tokensSource = readSource('src/lib/tokens.ts');
const typesSource = readSource('src/types/tokens.ts');

/** Recorta o trecho entre duas âncoras — para ancorar asserções ao contexto. */
function sectionOf(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  expect(start, `bloco não encontrado: "${startAnchor}"`).toBeGreaterThan(-1);

  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(end, `fim do bloco não encontrado: "${endAnchor}"`).toBeGreaterThan(start);

  return source.slice(start, end);
}

/**
 * Devolve o docblock COLADO acima de `anchor`. Falha se não houver docblock ou
 * se existir qualquer código entre o `*​/` e a âncora — é isso que impede o
 * teste de ser satisfeito por uma menção solta em outro ponto do arquivo.
 */
function docblockAbove(source: string, anchor: string): string {
  const index = source.indexOf(anchor);
  expect(index, `âncora não encontrada: "${anchor}"`).toBeGreaterThan(-1);

  const before = source.slice(0, index);
  const open = before.lastIndexOf('/**');
  const close = before.lastIndexOf('*/');

  expect(open, `não há docblock antes de "${anchor}"`).toBeGreaterThan(-1);
  expect(close, `docblock antes de "${anchor}" não foi fechado`).toBeGreaterThan(open);
  expect(
    before.slice(close + 2).trim(),
    `o docblock não está colado em "${anchor}" — há código entre os dois`,
  ).toBe('');

  return before.slice(open, close + 2);
}

function toNumber(value: string, unit: string): number {
  expect(value.endsWith(unit), `"${value}" deveria terminar em "${unit}"`).toBe(true);
  const parsed = Number.parseFloat(value.slice(0, -unit.length));
  expect(Number.isFinite(parsed)).toBe(true);
  return parsed;
}

/* -------------------------------------------------------------------------- */
/* 1. Integridade                                                              */
/* -------------------------------------------------------------------------- */

describe('integridade dos tokens', () => {
  it('expõe todos os grupos do contrato DesignTokens', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      [
        'breakpoint',
        'color',
        'motion',
        'radius',
        'shadow',
        'spacing',
        'typography',
        'zIndex',
      ].sort(),
    );
  });

  it('todo token semântico resolve para um valor definido e não vazio', () => {
    const flat = flatten(tokens);
    expect(flat.length).toBeGreaterThan(0);

    for (const [tokenPath, value] of flat) {
      expect(value, `token vazio/indefinido: ${tokenPath}`).toBeTypeOf('string');
      expect(value.trim(), `token vazio: ${tokenPath}`).not.toBe('');
      expect(value, `token com placeholder: ${tokenPath}`).not.toMatch(
        /undefined|null|NaN/,
      );
    }
  });

  it('nenhum token de cor é string vazia e todos são hex de 6 dígitos', () => {
    for (const [tokenPath, token] of everyColorToken()) {
      for (const scheme of SCHEMES) {
        const value = token[scheme];
        expect(value, `${tokenPath}.${scheme} vazio`).not.toBe('');
        expect(value, `${tokenPath}.${scheme} fora do padrão hex`).toMatch(
          HEX_PATTERN,
        );
      }
    }
  });

  it('cobre os dois esquemas em 100% dos tokens de cor', () => {
    for (const [tokenPath, token] of everyColorToken()) {
      expect(Object.keys(token).sort(), `${tokenPath}`).toEqual(['dark', 'light']);
    }
  });

  it('tokens semânticos referenciam primitivos (nenhum hex avulso)', () => {
    for (const [tokenPath, token] of everyColorToken()) {
      for (const scheme of SCHEMES) {
        expect(
          allPrimitiveValues.has(token[scheme]),
          `${tokenPath}.${scheme} = ${token[scheme]} não existe em \`primitives\``,
        ).toBe(true);
      }
    }
  });

  it('preserva os valores oficiais de marca sem ajuste', () => {
    expect(tokens.color.brand.navy.light).toBe('#0B0B0F');
    expect(tokens.color.brand.cream.light).toBe('#FAF7F2');
    expect(tokens.color.brand.gold.light).toBe('#9A7B35');
    // PodFactory: orquídea é o accentColor default de Podcast.
    expect(tokens.color.brand.orchid.light).toBe('#d87dff');
    expect(tokens.color.accent.default.dark).toBe('#d87dff');
    // PodFactory: surface.base preto no tema dark.
    expect(tokens.color.surface.base.dark).toBe('#000000');
    // Marca é imutável entre esquemas.
    for (const token of Object.values(tokens.color.brand)) {
      expect(token.light).toBe(token.dark);
    }
  });

  it('resolveColor devolve o hex do esquema pedido e rejeita caminho inválido', () => {
    expect(resolveColor('surface.base', 'dark')).toBe('#000000');
    expect(resolveColor('text.primary', 'light')).toBe('#0B0B0F');
    expect(() => resolveColor('surface.inexistente' as ColorTokenPath, 'dark')).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Tipografia                                                               */
/* -------------------------------------------------------------------------- */

describe('tipografia', () => {
  it('a ordem declarada cobre exatamente a escala', () => {
    expect([...typographyScaleOrder].sort()).toEqual(
      Object.keys(tokens.typography.scale).sort(),
    );
  });

  it('a escala de tamanhos é estritamente monotônica crescente', () => {
    const sizes = typographyScaleOrder.map((key) =>
      toNumber(tokens.typography.scale[key].fontSize, 'rem'),
    );

    for (let i = 1; i < sizes.length; i += 1) {
      expect(
        sizes[i],
        `${typographyScaleOrder[i]} (${sizes[i]}rem) deveria ser maior que ${typographyScaleOrder[i - 1]} (${sizes[i - 1]}rem)`,
      ).toBeGreaterThan(sizes[i - 1] as number);
    }
  });

  it('line-height decresce (ou se mantém) conforme o tamanho cresce', () => {
    const lineHeights = typographyScaleOrder.map((key) =>
      Number.parseFloat(tokens.typography.scale[key].lineHeight),
    );

    for (let i = 1; i < lineHeights.length; i += 1) {
      expect(lineHeights[i] as number).toBeLessThanOrEqual(lineHeights[i - 1] as number);
      expect(lineHeights[i] as number).toBeGreaterThanOrEqual(1);
    }
  });

  it('usa rem na escala (respeita o zoom do usuário) e em na métrica horizontal', () => {
    for (const key of typographyScaleOrder) {
      const step = tokens.typography.scale[key];
      expect(step.fontSize).toMatch(/^\d+(\.\d+)?rem$/);
      expect(step.letterSpacing).toMatch(/^-?\d+(\.\d+)?em$/);
    }
  });

  it('pesos são numéricos e crescentes', () => {
    const weights = Object.values(tokens.typography.weight).map(Number);
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
    for (const weight of weights) {
      expect(weight).toBeGreaterThanOrEqual(100);
      expect(weight).toBeLessThanOrEqual(900);
    }
  });

  it('declara a família display (Borna) com fallback de sistema', () => {
    const display = tokens.typography.family.display;
    expect(display).toContain('Borna');
    expect(display.split(',').length).toBeGreaterThan(2);
    expect(display).toMatch(/sans-serif$/);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Contraste WCAG 2.2 AA                                                    */
/* -------------------------------------------------------------------------- */

describe('contraste WCAG 2.2 AA', () => {
  const AA_TEXT = 4.5;
  const AA_NON_TEXT = 3;

  it('a função de contraste do teste bate com as referências da spec', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
    // Valor de referência conhecido (#767676 sobre branco = 4.54:1).
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeLessThan(4.5);
  });

  it.each(SCHEMES)(
    '[%s] text.primary sobre surface.base >= 4.5:1',
    (scheme) => {
      const ratio = contrastRatio(
        resolveColor('text.primary', scheme),
        resolveColor('surface.base', scheme),
      );
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(SCHEMES)(
    '[%s] text.secondary sobre surface.base >= 4.5:1',
    (scheme) => {
      const ratio = contrastRatio(
        resolveColor('text.secondary', scheme),
        resolveColor('surface.base', scheme),
      );
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it('matriz texto × superfície inteira passa em AA', () => {
    const textTokens: ColorTokenPath[] = [
      'text.primary',
      'text.secondary',
      'text.muted',
      'text.accent',
      'text.brand',
      'text.link',
    ];
    const surfaceTokens: ColorTokenPath[] = [
      'surface.base',
      'surface.sunken',
      'surface.raised',
      'surface.accent',
    ];

    const failures: string[] = [];

    for (const scheme of SCHEMES) {
      for (const surface of surfaceTokens) {
        for (const text of textTokens) {
          const ratio = contrastRatio(
            resolveColor(text, scheme),
            resolveColor(surface, scheme),
          );
          if (ratio < AA_TEXT) {
            failures.push(`[${scheme}] ${text} sobre ${surface} = ${ratio.toFixed(2)}:1`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('cores de estado passam em AA sobre as superfícies de conteúdo', () => {
    const stateTokens: ColorTokenPath[] = [
      'state.success',
      'state.warning',
      'state.danger',
      'state.info',
    ];
    const surfaceTokens: ColorTokenPath[] = [
      'surface.base',
      'surface.sunken',
      'surface.raised',
    ];

    for (const scheme of SCHEMES) {
      for (const surface of surfaceTokens) {
        for (const state of stateTokens) {
          const ratio = contrastRatio(
            resolveColor(state, scheme),
            resolveColor(surface, scheme),
          );
          expect(ratio, `[${scheme}] ${state} sobre ${surface}`).toBeGreaterThanOrEqual(
            AA_TEXT,
          );
        }
      }
    }
  });

  it('texto invertido e texto sobre acento passam em AA', () => {
    for (const scheme of SCHEMES) {
      expect(
        contrastRatio(
          resolveColor('text.inverse', scheme),
          resolveColor('surface.inverse', scheme),
        ),
        `[${scheme}] text.inverse sobre surface.inverse`,
      ).toBeGreaterThanOrEqual(AA_TEXT);

      expect(
        contrastRatio(
          resolveColor('text.onAccent', scheme),
          resolveColor('accent.default', scheme),
        ),
        `[${scheme}] text.onAccent sobre accent.default`,
      ).toBeGreaterThanOrEqual(AA_TEXT);

      expect(
        contrastRatio(
          resolveColor('accent.contrast', scheme),
          resolveColor('accent.hover', scheme),
        ),
        `[${scheme}] accent.contrast sobre accent.hover`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('anel de foco e borda forte passam no mínimo de 3:1 (não-texto)', () => {
    for (const scheme of SCHEMES) {
      expect(
        contrastRatio(
          resolveColor('border.focus', scheme),
          resolveColor('surface.base', scheme),
        ),
        `[${scheme}] border.focus`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);

      expect(
        contrastRatio(
          resolveColor('border.accent', scheme),
          resolveColor('surface.base', scheme),
        ),
        `[${scheme}] border.accent`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3b. Limite de componente — WCAG 2.2 §1.4.11 (Non-text Contrast)             */
/* -------------------------------------------------------------------------- */

/**
 * Quando a borda é o ÚNICO indicador do limite de um componente — o caso do
 * grid do portfólio (TCK-013), onde cards `bg-surface-raised` assentam sobre
 * `surface.base` com diferença de 1.07:1 entre as duas superfícies — ela
 * precisa de 3:1 contra as cores adjacentes.
 *
 * `border.subtle` está deliberadamente FORA desta suíte: é decorativo.
 */
describe('limite de componente (WCAG 2.2 §1.4.11)', () => {
  const AA_NON_TEXT = 3;

  /**
   * Superfícies sobre as quais um componente pode assentar.
   * `surface.inverse` INVERTE a polaridade dentro do mesmo tema (no dark é
   * creme, no light é navy), então uma borda válida precisa sobreviver aos
   * dois extremos do mesmo esquema — é a superfície que mais aperta.
   */
  const contentSurfaces: ColorTokenPath[] = [
    'surface.base',
    'surface.sunken',
    'surface.raised',
    'surface.accent',
    'surface.inverse',
  ];

  /**
   * Bordas que podem ser o único indicador de limite ou de estado.
   * `focus` e `accent` entram: o anel de foco de teclado é desenhado sobre
   * qualquer superfície onde o componente estiver, inclusive a invertida.
   */
  const boundaryBorders: ColorTokenPath[] = [
    'border.default',
    'border.strong',
    'border.accent',
    'border.focus',
  ];

  it('toda borda de limite tem >= 3:1 contra toda superfície, inclusive a invertida', () => {
    const failures: string[] = [];

    for (const scheme of SCHEMES) {
      for (const border of boundaryBorders) {
        for (const surface of contentSurfaces) {
          const ratio = contrastRatio(
            resolveColor(border, scheme),
            resolveColor(surface, scheme),
          );
          if (ratio < AA_NON_TEXT) {
            failures.push(
              `[${scheme}] ${border} sobre ${surface} = ${ratio.toFixed(2)}:1`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('a borda do card é visível contra o próprio card e contra a página', () => {
    // Caso concreto do TCK-013: card `surface.raised` sobre `surface.base`.
    for (const scheme of SCHEMES) {
      const border = resolveColor('border.default', scheme);
      expect(
        contrastRatio(border, resolveColor('surface.raised', scheme)),
        `[${scheme}] borda do card contra o preenchimento do card`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(
        contrastRatio(border, resolveColor('surface.base', scheme)),
        `[${scheme}] borda do card contra a página`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('a escala de bordas é monotônica: subtle < default <= strong', () => {
    for (const scheme of SCHEMES) {
      const base = resolveColor('surface.base', scheme);
      const subtle = contrastRatio(resolveColor('border.subtle', scheme), base);
      const def = contrastRatio(resolveColor('border.default', scheme), base);
      const strong = contrastRatio(resolveColor('border.strong', scheme), base);

      expect(subtle, `[${scheme}] subtle deveria ser mais discreto que default`).toBeLessThan(
        def,
      );
      expect(strong, `[${scheme}] strong deveria ser >= default`).toBeGreaterThanOrEqual(
        def,
      );
    }
  });

  /**
   * Estes três testes são ancorados ao CONTEXTO, não ao arquivo inteiro:
   * casam o docblock imediatamente acima do alvo. Apagar a documentação real
   * de `border.subtle` derruba o teste mesmo que as palavras "decorativo" e
   * "1.4.11" continuem existindo em outras linhas dos mesmos arquivos.
   */
  it('o docblock colado em border.subtle avisa que ele não serve de limite', () => {
    const borderGroup = sectionOf(tokensSource, '  border: {', '\n  },');
    const doc = docblockAbove(borderGroup, 'subtle:');

    expect(doc, 'docblock de border.subtle: falta "decorativo"').toMatch(/decorativ/i);
    expect(doc, 'docblock de border.subtle: falta a referência 1.4.11').toMatch(
      /1\.4\.11/,
    );
    expect(doc, 'docblock de border.subtle: falta a proibição de uso').toMatch(
      /(nunca|não\s+usar|nao\s+usar)/i,
    );
    expect(doc, 'docblock de border.subtle: falta apontar a alternativa').toMatch(
      /border\.default|`default`/,
    );
  });

  it('o docblock de BorderKey diferencia subtle de default', () => {
    const doc = docblockAbove(typesSource, 'export type BorderKey');

    expect(doc, 'docblock de BorderKey: falta citar `subtle`').toMatch(/subtle/);
    expect(doc, 'docblock de BorderKey: falta "decorativo"').toMatch(/decorativ/i);
    expect(doc, 'docblock de BorderKey: falta a referência 1.4.11').toMatch(/1\.4\.11/);
    expect(doc, 'docblock de BorderKey: falta descrever `default` como seguro').toMatch(
      /default/,
    );
  });

  it('o cabeçalho de tokens.ts registra o ajuste de limite de componente', () => {
    const header = tokensSource.slice(0, tokensSource.indexOf('*/') + 2);

    expect(header, 'cabeçalho: falta a seção de limite de componente').toMatch(
      /LIMITE DE COMPONENTE/i,
    );
    expect(header, 'cabeçalho: falta a referência 1.4.11').toMatch(/1\.4\.11/);
    expect(header, 'cabeçalho: falta registrar a borda ajustada').toMatch(
      /border\.default/,
    );
  });

  it('estados têm >= 3:1 contra a própria superfície tonal', () => {
    const pairs: Array<[ColorTokenPath, ColorTokenPath]> = [
      ['state.success', 'state.successSurface'],
      ['state.warning', 'state.warningSurface'],
      ['state.danger', 'state.dangerSurface'],
      ['state.info', 'state.infoSurface'],
    ];

    for (const scheme of SCHEMES) {
      for (const [foreground, background] of pairs) {
        expect(
          contrastRatio(resolveColor(foreground, scheme), resolveColor(background, scheme)),
          `[${scheme}] ${foreground} sobre ${background}`,
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    }
  });

  it('no dark a elevação não pode depender de sombra preta sobre base preta', () => {
    // Sombras puramente pretas somem sobre `surface.base` #000000; o token de
    // elevação precisa carregar uma borda derivada de CSS var (theme-aware).
    expect(tokens.shadow.raised).toContain(colorVar('border.default'));
    expect(tokens.shadow.poster).toContain(colorVar('border.strong'));
  });
});


/* -------------------------------------------------------------------------- */
/* 4. Espaço, forma e elevação                                                 */
/* -------------------------------------------------------------------------- */

describe('espaçamento, radius e sombras', () => {
  it('a escala de espaçamento é crescente e usa rem (exceto hairline)', () => {
    // A ordem das chaves numéricas em JS não é a de declaração: ordenamos pelo
    // degrau para validar a monotonicidade real da escala.
    const steps = Object.entries(tokens.spacing)
      .filter(([key]) => key !== 'px')
      .sort(([a], [b]) => Number.parseFloat(a) - Number.parseFloat(b));

    for (const [key, value] of steps) {
      expect(value, key).toMatch(/^\d+(\.\d+)?(rem|px)$/);
    }

    const numeric = steps.map(([, value]) => Number.parseFloat(value));
    for (let i = 1; i < numeric.length; i += 1) {
      expect(
        numeric[i] as number,
        `${steps[i]?.[0]} deveria ser maior que ${steps[i - 1]?.[0]}`,
      ).toBeGreaterThan(numeric[i - 1] as number);
    }
    expect(tokens.spacing.px).toBe('1px');
    expect(tokens.spacing['4']).toBe('1rem');
  });

  it('radius são não-negativos e `full` cobre pílulas', () => {
    for (const [key, value] of Object.entries(tokens.radius)) {
      expect(value, key).toMatch(/^\d+(\.\d+)?(rem|px)$/);
    }
    expect(Number.parseFloat(tokens.radius.full)).toBeGreaterThanOrEqual(9999);
  });

  it('sombras derivam de primitivos e nenhuma contém hex literal', () => {
    for (const [key, value] of Object.entries(tokens.shadow)) {
      expect(value, key).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      if (key !== 'none') {
        expect(value, key).toContain('rgb(');
      }
    }
    expect(tokens.shadow.glow).toContain(hexToChannels(primitives.orchid[500]));
  });

  it('z-index são inteiros crescentes na ordem declarada', () => {
    const values = Object.values(tokens.zIndex).map(Number);
    for (let i = 1; i < values.length; i += 1) {
      expect(Number.isInteger(values[i] as number)).toBe(true);
      expect(values[i] as number).toBeGreaterThan(values[i - 1] as number);
    }
  });

  it('breakpoints são crescentes e em px', () => {
    const values = Object.values(tokens.breakpoint).map((value) => toNumber(value, 'px'));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i] as number).toBeGreaterThan(values[i - 1] as number);
    }
    expect(values[0] as number).toBeGreaterThanOrEqual(320);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Motion                                                                   */
/* -------------------------------------------------------------------------- */

describe('motion', () => {
  it('durações são plausíveis (0ms–1000ms) e crescentes', () => {
    const durations = Object.entries(tokens.motion.duration).map(
      ([key, value]) => [key, toNumber(value, 'ms')] as const,
    );

    for (const [key, ms] of durations) {
      expect(ms, `${key} negativa`).toBeGreaterThanOrEqual(0);
      expect(ms, `${key} longa demais para UI`).toBeLessThanOrEqual(1000);
    }

    expect(tokens.motion.duration.instant).toBe('0ms');
    for (let i = 1; i < durations.length; i += 1) {
      expect(durations[i]?.[1] as number).toBeGreaterThan(
        durations[i - 1]?.[1] as number,
      );
    }
  });

  it('easings são curvas CSS válidas', () => {
    for (const [key, value] of Object.entries(tokens.motion.easing)) {
      if (value === 'linear') continue;
      expect(value, key).toMatch(
        /^cubic-bezier\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\)$/,
      );
    }
  });

  it('presets de transição reutilizam duração e easing declaradas', () => {
    const durations = Object.values(tokens.motion.duration) as string[];
    const easings = Object.values(tokens.motion.easing) as string[];

    for (const [key, preset] of Object.entries(tokens.motion.transition)) {
      expect(durations, `${key}.duration`).toContain(preset.duration);
      expect(easings, `${key}.easing`).toContain(preset.easing);
      const ms = toNumber(preset.duration, 'ms');
      expect(ms, `${key} imperceptível/lenta demais`).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(500);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Helpers de CSS var                                                       */
/* -------------------------------------------------------------------------- */

describe('helpers de CSS custom properties', () => {
  it('hexToChannels converte hex em canais RGB', () => {
    expect(hexToChannels('#000000')).toBe('0 0 0');
    expect(hexToChannels('#FAF7F2')).toBe('250 247 242');
    expect(hexToChannels('#d87dff')).toBe('216 125 255');
    expect(hexToChannels('#fff')).toBe('255 255 255');
    expect(() => hexToChannels('#zzz')).toThrow();
  });

  it('gera nomes de variável em kebab-case', () => {
    expect(colorVarName('surface.base')).toBe('--color-surface-base');
    expect(colorVarName('text.onAccent')).toBe('--color-text-on-accent');
    expect(colorVar('text.primary')).toBe('rgb(var(--color-text-primary))');
    expect(colorVarWithAlpha('accent.default')).toBe(
      'rgb(var(--color-accent-default) / <alpha-value>)',
    );
  });

  it('colorCssVariables cobre todos os tokens nos dois esquemas', () => {
    const total = everyColorToken().length;
    for (const scheme of SCHEMES) {
      const vars = colorCssVariables(scheme);
      expect(Object.keys(vars)).toHaveLength(total);
      for (const value of Object.values(vars)) {
        expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Sincronia com globals.css                                                */
/* -------------------------------------------------------------------------- */

describe('globals.css', () => {
  it('inclui as diretivas do Tailwind', () => {
    expect(globalsCss).toContain('@tailwind base;');
    expect(globalsCss).toContain('@tailwind components;');
    expect(globalsCss).toContain('@tailwind utilities;');
  });

  it('declara :root (light) e .dark com color-scheme', () => {
    expect(globalsCss).toMatch(/:root\s*\{[\s\S]*color-scheme:\s*light;/);
    expect(globalsCss).toMatch(/\.dark\s*\{[\s\S]*color-scheme:\s*dark;/);
  });

  it('declara toda custom property de cor com o valor de tokens.ts', () => {
    const lightBlock = globalsCss.slice(
      globalsCss.indexOf(':root {'),
      globalsCss.indexOf('.dark {'),
    );
    const darkBlock = globalsCss.slice(globalsCss.indexOf('.dark {'));

    for (const [name, channels] of Object.entries(colorCssVariables('light'))) {
      expect(lightBlock, `light: ${name}`).toContain(`${name}: ${channels};`);
    }
    for (const [name, channels] of Object.entries(colorCssVariables('dark'))) {
      expect(darkBlock, `dark: ${name}`).toContain(`${name}: ${channels};`);
    }
  });

  it('declara as custom properties independentes de tema', () => {
    for (const [name, value] of Object.entries(staticCssVariables())) {
      expect(globalsCss, name).toContain(`${name}: ${value};`);
    }
  });

  it('respeita prefers-reduced-motion zerando animações e transições', () => {
    expect(globalsCss).toContain('@media (prefers-reduced-motion: reduce)');
    const block = globalsCss.slice(
      globalsCss.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    expect(block).toMatch(/animation-duration:\s*0ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0ms\s*!important/);
  });

  it('define foco visível acessível sem suprimir o foco de teclado', () => {
    expect(globalsCss).toMatch(/:focus-visible\s*\{[^}]*outline:/);
    expect(globalsCss).toContain('var(--color-border-focus)');
    expect(globalsCss).toMatch(/:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;/);
  });

  it('documenta onde plugar o arquivo licenciado da Borna', () => {
    expect(globalsCss).toContain('Borna');
    expect(globalsCss).toContain('public/fonts/borna/');
    expect(globalsCss).toContain('@font-face');
    // Deve ser CSS puro: nada de next/font aqui.
    expect(globalsCss).not.toMatch(/next\/font\/(google|local)/);
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Sincronia com tailwind.config.ts                                         */
/* -------------------------------------------------------------------------- */

describe('tailwind.config.ts', () => {
  it('consome os tokens e não redigita valores', async () => {
    const { default: config } = await import('../../tailwind.config');

    expect(config.darkMode).toBe('class');
    expect(config.content).toContain('./src/**/*.{ts,tsx}');
    expect(config.plugins?.length).toBeGreaterThan(0);

    const theme = config.theme ?? {};
    const extend = (theme.extend ?? {}) as Record<string, unknown>;
    const colors = extend.colors as Record<string, Record<string, string>>;

    for (const group of colorGroupNames) {
      const alias = tailwindColorGroupAlias[group];
      const scale = colors[alias];
      expect(scale, `grupo ausente no Tailwind: ${alias}`).toBeDefined();

      for (const key of Object.keys(tokens.color[group])) {
        const expected = colorVarWithAlpha(`${group}.${key}` as ColorTokenPath);
        expect(scale?.[kebabCase(key)], `${alias}.${kebabCase(key)}`).toBe(expected);
        if (key === 'default') {
          expect(scale?.DEFAULT, `${alias}.DEFAULT`).toBe(expected);
        }
      }
    }

    expect(theme.screens).toEqual({ ...tokens.breakpoint });
    expect(extend.spacing).toEqual({ ...tokens.spacing });
    expect(extend.borderRadius).toEqual({ ...tokens.radius });
    expect(extend.boxShadow).toEqual({ ...tokens.shadow });
    expect(extend.zIndex).toEqual({ ...tokens.zIndex });
    expect(extend.transitionDuration).toEqual({ ...tokens.motion.duration });
    expect(extend.transitionTimingFunction).toEqual({ ...tokens.motion.easing });
  });

  it('não contém hex literal fora dos arquivos de token', () => {
    const configSource = readFileSync(
      path.resolve(process.cwd(), 'tailwind.config.ts'),
      'utf8',
    );
    expect(configSource).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

/* -------------------------------------------------------------------------- */
/* 9. Tipagem (compile-time)                                                   */
/* -------------------------------------------------------------------------- */

describe('tipagem', () => {
  it('tokens de cor são atribuíveis a HexColor', () => {
    const value: HexColor = tokens.color.surface.base.dark;
    const scheme: ColorScheme = 'dark';
    expect(value.startsWith('#')).toBe(true);
    expect(SCHEMES).toContain(scheme);
  });
});
