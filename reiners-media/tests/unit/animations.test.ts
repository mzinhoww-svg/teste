/**
 * TCK-010 — Testes do sistema de motion.
 *
 * Cobertura:
 *  - adaptadores token → framer-motion (ms→s, cubic-bezier→tupla);
 *  - DERIVAÇÃO: nenhuma variante tem número mágico; mudar um token de duração
 *    muda a variante (provado por remock do módulo de tokens);
 *  - PERFORMANCE (NFR-001): varredura de TODAS as variantes do catálogo — só
 *    `transform`/`opacity`; `width`/`height`/`top`/`left`/`margin` reprovam,
 *    com a única exceção declarada (`expand` → `height`);
 *  - ACESSIBILIDADE (NFR-002): sob `reduced`, nenhuma variante mantém
 *    deslocamento ou escala, e a degradação não é "a mesma coisa mais rápida".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMPOSITED_ANIMATABLE_PROPERTIES,
  DEFAULT_HOVER_SCALE,
  DEFAULT_SLIDE_DISTANCE,
  DEFAULT_STAGGER_STEP,
  LAYOUT_ANIMATION_EXCEPTIONS,
  LAYOUT_TRIGGERING_PROPERTIES,
  MOTION_PRESET_NAMES,
  durationOf,
  easingOf,
  expandVariants,
  fadeVariants,
  instantTransition,
  interactiveVariants,
  modalVariants,
  motionPresets,
  msToSeconds,
  overlayVariants,
  parseEasing,
  revealVariants,
  scaleVariants,
  scrollRevealViewport,
  shimmerVariants,
  slideVariants,
  staggerContainerVariants,
  staggerItemVariants,
  transitionOf,
} from '@/lib/animations';
import { tokens } from '@/lib/tokens';
import type { SlideDirection } from '@/lib/animations';

/* -------------------------------------------------------------------------- */
/* Helpers — oráculo independente da lib sob teste                             */
/* -------------------------------------------------------------------------- */

type PlainTarget = Record<string, unknown>;

/** Propriedades efetivamente animadas por uma variante (ignora a transição). */
function animatedKeys(variant: unknown): string[] {
  expect(typeof variant).toBe('object');
  return Object.keys(variant as PlainTarget).filter(
    (key) => key !== 'transition' && key !== 'transitionEnd',
  );
}

/** Todas as chaves animadas de um conjunto de variantes. */
function allAnimatedKeys(variants: Record<string, unknown>): string[] {
  return Object.values(variants).flatMap(animatedKeys);
}

function transitionOfVariant(variant: unknown): PlainTarget | undefined {
  return (variant as { transition?: PlainTarget }).transition;
}

/** Chaves de transform — o que a degradação precisa eliminar. */
const TRANSFORM_KEYS = [
  'x',
  'y',
  'z',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
] as const;

const MOVING_PRESETS = motionPresets({ reduced: false });
const REDUCED_PRESETS = motionPresets({ reduced: true });

/* -------------------------------------------------------------------------- */
/* 1. Adaptadores                                                              */
/* -------------------------------------------------------------------------- */

describe('adaptadores token → framer-motion', () => {
  it('converte duração CSS em segundos', () => {
    expect(msToSeconds('200ms')).toBe(0.2);
    expect(msToSeconds('0ms')).toBe(0);
    expect(msToSeconds('720ms')).toBeCloseTo(0.72, 10);
  });

  it('rejeita duração inválida', () => {
    expect(() => msToSeconds('rápido' as never)).toThrow(/Duração de motion inválida/);
  });

  it('converte cubic-bezier CSS na tupla do framer-motion', () => {
    expect(parseEasing('cubic-bezier(0.2, 0, 0, 1)')).toEqual([0.2, 0, 0, 1]);
    expect(parseEasing('linear')).toBe('linear');
  });

  it('rejeita curva inválida', () => {
    expect(() => parseEasing('ease-in-out' as never)).toThrow(/Curva de motion inválida/);
    expect(() => parseEasing('cubic-bezier(0, 1)' as never)).toThrow(
      /Curva de motion inválida/,
    );
  });

  it('durationOf e easingOf leem a escala de tokens', () => {
    expect(durationOf('normal')).toBe(msToSeconds(tokens.motion.duration.normal));
    expect(durationOf('instant')).toBe(0);
    expect(easingOf('emphasized')).toEqual(parseEasing(tokens.motion.easing.emphasized));
    expect(easingOf('linear')).toBe('linear');
  });

  it('transitionOf devolve o preset pareado do token', () => {
    expect(transitionOf('overlay')).toEqual({
      duration: msToSeconds(tokens.motion.transition.overlay.duration),
      ease: parseEasing(tokens.motion.transition.overlay.easing),
    });
  });

  it('transitionOf só emite delay quando ele existe', () => {
    expect(transitionOf('fade')).not.toHaveProperty('delay');
    expect(transitionOf('fade', 0.3)).toMatchObject({ delay: 0.3 });
  });

  it('instantTransition é literalmente 0ms (token duration.instant)', () => {
    expect(instantTransition().duration).toBe(msToSeconds(tokens.motion.duration.instant));
    expect(instantTransition().duration).toBe(0);
  });

  it('constantes de distância derivam da escala de espaçamento', () => {
    expect(DEFAULT_SLIDE_DISTANCE).toBe(Number.parseFloat(tokens.spacing['6']) * 16);
    expect(DEFAULT_STAGGER_STEP).toBe(durationOf('fast') / 2);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Derivação dos tokens                                                     */
/* -------------------------------------------------------------------------- */

describe('derivação dos tokens de motion', () => {
  const tokenDurations = new Set(
    Object.values(tokens.motion.duration).map((value) => msToSeconds(value)),
  );
  const tokenTransitionDurations = new Set(
    Object.values(tokens.motion.transition).map((preset) => msToSeconds(preset.duration)),
  );
  const tokenEasings = new Set<unknown>(
    Object.values(tokens.motion.easing).map((value) => JSON.stringify(parseEasing(value))),
  );

  it('toda duração usada nas variantes existe na escala de tokens', () => {
    for (const [name, variants] of Object.entries(MOVING_PRESETS)) {
      for (const variant of Object.values(variants)) {
        const transition = transitionOfVariant(variant);
        if (!transition || typeof transition.duration !== 'number') continue;

        const duration = transition.duration;
        const derived =
          tokenDurations.has(duration) ||
          tokenTransitionDurations.has(duration) ||
          // shimmer usa um múltiplo declarado do degrau mais lento
          duration === durationOf('slowest') * 2;

        expect(
          derived,
          `${name}: duração ${duration}s não deriva de nenhum token`,
        ).toBe(true);
      }
    }
  });

  it('toda curva usada nas variantes existe na escala de tokens', () => {
    for (const [name, variants] of Object.entries(MOVING_PRESETS)) {
      for (const variant of Object.values(variants)) {
        const transition = transitionOfVariant(variant);
        if (!transition || transition.ease === undefined) continue;

        expect(
          tokenEasings.has(JSON.stringify(transition.ease)),
          `${name}: curva ${JSON.stringify(transition.ease)} não deriva de nenhum token`,
        ).toBe(true);
      }
    }
  });

  it('mudar o token de duração muda a variante (sem número mágico no meio)', async () => {
    vi.resetModules();

    const actual = await vi.importActual<typeof import('@/lib/tokens')>('@/lib/tokens');

    vi.doMock('@/lib/tokens', () => ({
      ...actual,
      tokens: {
        ...actual.tokens,
        motion: {
          ...actual.tokens.motion,
          transition: {
            ...actual.tokens.motion.transition,
            fade: { duration: '999ms', easing: 'linear' },
          },
        },
      },
    }));

    const remocked = await import('@/lib/animations');
    const transition = transitionOfVariant(remocked.fadeVariants().visible);

    expect(transition?.duration).toBe(0.999);
    expect(transition?.ease).toBe('linear');

    vi.doUnmock('@/lib/tokens');
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/tokens');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Performance — NFR-001                                                    */
/* -------------------------------------------------------------------------- */

describe('performance: só propriedades compostas (NFR-001)', () => {
  const composited = new Set<string>(COMPOSITED_ANIMATABLE_PROPERTIES);
  const forbidden = new Set<string>(LAYOUT_TRIGGERING_PROPERTIES);

  it('nenhuma variante anima width/height/top/left/margin — exceto expand', () => {
    for (const [name, variants] of Object.entries(MOVING_PRESETS)) {
      const allowed = new Set(LAYOUT_ANIMATION_EXCEPTIONS[name] ?? []);

      for (const key of allAnimatedKeys(variants)) {
        if (!forbidden.has(key)) continue;

        expect(
          allowed.has(key),
          `${name} anima "${key}", que dispara layout a cada quadro (NFR-001). ` +
            'Use transform/opacity ou declare a exceção em LAYOUT_ANIMATION_EXCEPTIONS.',
        ).toBe(true);
      }
    }
  });

  it('a mesma regra vale com reduced-motion ligado', () => {
    for (const [name, variants] of Object.entries(REDUCED_PRESETS)) {
      const allowed = new Set(LAYOUT_ANIMATION_EXCEPTIONS[name] ?? []);

      for (const key of allAnimatedKeys(variants)) {
        if (!forbidden.has(key)) continue;
        expect(allowed.has(key), `${name} (reduced) anima "${key}"`).toBe(true);
      }
    }
  });

  it('toda propriedade animada é composta ou uma exceção declarada', () => {
    for (const [name, variants] of Object.entries(MOVING_PRESETS)) {
      const allowed = new Set(LAYOUT_ANIMATION_EXCEPTIONS[name] ?? []);

      for (const key of allAnimatedKeys(variants)) {
        expect(
          composited.has(key) || allowed.has(key),
          `${name} anima "${key}", fora da lista de propriedades compostas`,
        ).toBe(true);
      }
    }
  });

  it('a exceção de layout é exclusiva do expand e anima só a altura', () => {
    expect(Object.keys(LAYOUT_ANIMATION_EXCEPTIONS)).toEqual(['expand']);
    expect(LAYOUT_ANIMATION_EXCEPTIONS.expand).toEqual(['height']);
    expect(animatedKeys(expandVariants().expanded).sort()).toEqual(['height', 'opacity']);
  });

  it('o catálogo cobre exatamente os nomes publicados', () => {
    expect(Object.keys(MOVING_PRESETS).sort()).toEqual([...MOTION_PRESET_NAMES].sort());
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Acessibilidade — NFR-002 / WCAG 2.2                                      */
/* -------------------------------------------------------------------------- */

describe('reduced-motion: degradação para movimento zero (NFR-002)', () => {
  it('nenhuma variante mantém deslocamento ou escala', () => {
    for (const [name, variants] of Object.entries(REDUCED_PRESETS)) {
      for (const key of allAnimatedKeys(variants)) {
        expect(
          TRANSFORM_KEYS.includes(key as (typeof TRANSFORM_KEYS)[number]),
          `${name} (reduced) ainda anima transform "${key}"`,
        ).toBe(false);
      }
    }
  });

  it('sem reduced-motion, o sistema de fato move alguma coisa', () => {
    const movingKeys = new Set(
      Object.values(MOVING_PRESETS).flatMap((variants) => allAnimatedKeys(variants)),
    );

    expect([...TRANSFORM_KEYS].some((key) => movingKeys.has(key))).toBe(true);
  });

  it('slide degrada para fade puro nas quatro direções', () => {
    const directions: readonly SlideDirection[] = ['up', 'down', 'left', 'right'];

    for (const direction of directions) {
      const moving = slideVariants(direction);
      const reduced = slideVariants(direction, { reduced: true });

      expect(animatedKeys(moving.hidden).length).toBeGreaterThan(1);
      expect(animatedKeys(reduced.hidden)).toEqual(['opacity']);
      expect(animatedKeys(reduced.visible)).toEqual(['opacity']);
      expect(animatedKeys(reduced.exit)).toEqual(['opacity']);
    }
  });

  it('a degradação NÃO é apenas "mais rápido" — a opacidade mantém duração real', () => {
    const reduced = slideVariants('up', { reduced: true });
    const transition = transitionOfVariant(reduced.visible);

    expect(transition?.duration).toBe(msToSeconds(tokens.motion.transition.fade.duration));
    expect(transition?.duration).toBeGreaterThan(0);
  });

  it('scale e modal perdem a escala', () => {
    expect(animatedKeys(scaleVariants({ reduced: true }).visible)).toEqual(['opacity']);
    expect(animatedKeys(modalVariants({ reduced: true }).visible)).toEqual(['opacity']);
    expect(animatedKeys(modalVariants().visible).sort()).toEqual(['opacity', 'scale', 'y']);
  });

  it('interactive perde hover/tap scale mas continua tendo os três estados', () => {
    const reduced = interactiveVariants({ reduced: true });

    expect(Object.keys(reduced).sort()).toEqual(['hover', 'rest', 'tap']);
    expect(animatedKeys(reduced.hover)).toEqual([]);
    expect(animatedKeys(interactiveVariants().hover)).toEqual(['scale']);
    expect((interactiveVariants().hover as PlainTarget).scale).toBe(DEFAULT_HOVER_SCALE);
  });

  it('stagger zera a cascata', () => {
    const moving = transitionOfVariant(staggerContainerVariants().visible);
    const reduced = transitionOfVariant(
      staggerContainerVariants({ reduced: true, delayChildren: 1 }).visible,
    );

    expect(moving?.staggerChildren).toBe(DEFAULT_STAGGER_STEP);
    expect(reduced?.staggerChildren).toBe(0);
    expect(reduced?.delayChildren).toBe(0);
  });

  it('shimmer para o laço por completo (WCAG 2.2 §2.2.2)', () => {
    const moving = shimmerVariants();
    const reduced = shimmerVariants({ reduced: true });

    expect(animatedKeys(moving.shimmer)).toEqual(['x']);
    expect(transitionOfVariant(moving.shimmer)?.repeat).toBe(Number.POSITIVE_INFINITY);
    expect(animatedKeys(reduced.shimmer)).toEqual([]);
    expect(transitionOfVariant(reduced.shimmer)).toBeUndefined();
  });

  it('expand mantém a altura (exceção) mas vira instantâneo', () => {
    const moving = expandVariants();
    const reduced = expandVariants({ reduced: true });

    expect(transitionOfVariant(moving.expanded)?.duration).toBe(
      msToSeconds(tokens.motion.transition.expand.duration),
    );
    expect(transitionOfVariant(reduced.expanded)?.duration).toBe(0);
    expect(transitionOfVariant(reduced.collapsed)?.duration).toBe(0);
    expect((reduced.expanded as PlainTarget).height).toBe('auto');
  });

  it('fade é idêntico com e sem reduced-motion (opacidade não é movimento)', () => {
    expect(fadeVariants({ reduced: true })).toEqual(fadeVariants());
    expect(overlayVariants({ reduced: true })).toEqual(overlayVariants());
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Comportamento das variantes                                              */
/* -------------------------------------------------------------------------- */

describe('comportamento das variantes', () => {
  it('cada direção desloca no eixo e no sinal corretos', () => {
    expect(slideVariants('up').hidden).toMatchObject({ y: DEFAULT_SLIDE_DISTANCE });
    expect(slideVariants('down').hidden).toMatchObject({ y: -DEFAULT_SLIDE_DISTANCE });
    expect(slideVariants('left').hidden).toMatchObject({ x: DEFAULT_SLIDE_DISTANCE });
    expect(slideVariants('right').hidden).toMatchObject({ x: -DEFAULT_SLIDE_DISTANCE });
    expect(slideVariants('up').visible).toMatchObject({ y: 0, opacity: 1 });
  });

  it('aceita distância e delay customizados', () => {
    const variants = slideVariants('left', { distance: 64, delay: 0.25 });

    expect(variants.hidden).toMatchObject({ x: 64 });
    expect(transitionOfVariant(variants.visible)?.delay).toBe(0.25);
    expect(transitionOfVariant(variants.exit)).not.toHaveProperty('delay');
  });

  it('override de transição estende o preset do token sem apagá-lo', () => {
    const transition = transitionOfVariant(
      fadeVariants({ transition: { duration: 1.5 } }).visible,
    );

    expect(transition?.duration).toBe(1.5);
    expect(transition?.ease).toEqual(parseEasing(tokens.motion.transition.fade.easing));
  });

  it('staggerItem é slide "up" por padrão e respeita a direção pedida', () => {
    expect(staggerItemVariants()).toEqual(slideVariants('up'));
    expect(staggerItemVariants({ direction: 'right' })).toEqual(slideVariants('right'));
  });

  it('reveal usa a mesma mecânica de slide e um viewport de disparo único', () => {
    expect(revealVariants()).toEqual(slideVariants('up'));
    expect(scrollRevealViewport.once).toBe(true);
    expect(scrollRevealViewport.amount).toBeGreaterThan(0);
    expect(scrollRevealViewport.amount).toBeLessThanOrEqual(1);
  });

  it('o contêiner de stagger não anima nada por conta própria', () => {
    expect(allAnimatedKeys(staggerContainerVariants())).toEqual([]);
    expect(transitionOfVariant(staggerContainerVariants().exit)?.staggerDirection).toBe(-1);
  });

  it('overlay é fade puro — scrim de tela cheia nunca desloca', () => {
    expect(allAnimatedKeys(overlayVariants())).toEqual(['opacity', 'opacity', 'opacity']);
    expect(transitionOfVariant(overlayVariants().visible)?.duration).toBe(
      msToSeconds(tokens.motion.transition.overlay.duration),
    );
  });

  it('todas as variantes de entrada expõem hidden/visible/exit', () => {
    for (const factory of [
      fadeVariants,
      scaleVariants,
      overlayVariants,
      modalVariants,
      revealVariants,
      staggerItemVariants,
      staggerContainerVariants,
    ]) {
      expect(Object.keys(factory({})).sort()).toEqual(['exit', 'hidden', 'visible']);
    }
  });
});
