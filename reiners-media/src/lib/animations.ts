/**
 * TCK-010 — Sistema de motion do Reiners Media Podcast Studio.
 *
 * Camadas (mesma lógica de `src/lib/tokens.ts`):
 *   1. `tokens.motion`  — durações e curvas (ÚNICA fonte de número mágico).
 *   2. este arquivo     — adaptadores para framer-motion + variantes nomeadas.
 *   3. Consumo          — TCK-013 (grid), TCK-014 (card expansível),
 *                         TCK-015 (player modal) e demais telas.
 *
 * Nada aqui inventa duração ou curva: tudo sai de `@/lib/tokens`. Trocar
 * `tokens.motion.transition.fade.duration` muda toda a aplicação — há teste
 * que prova essa derivação (`tests/unit/animations.test.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A) CONTRATO DE ACESSIBILIDADE (NFR-002 / WCAG 2.2 §2.3.3)
 * ─────────────────────────────────────────────────────────────────────────────
 * TODA fábrica de variante aceita `{ reduced }`. Passe o retorno de
 * `useReducedMotion()` e a variante degrada sozinha. NÃO reimplemente isso em
 * componente — é este arquivo que carrega a regra.
 *
 *   Degradar significa, literalmente:
 *     - SEM deslocamento  → as chaves `x` / `y` somem da variante;
 *     - SEM escala        → as chaves `scale` / `scaleX` / `scaleY` somem;
 *     - opacidade PODE ficar (fade não é movimento vestibular);
 *     - animação em laço (shimmer) para de vez;
 *     - stagger vira 0 (os itens entram juntos, sem cascata).
 *
 *   Degradar NÃO é "a mesma animação, mais rápida". Uma animação de 60ms com
 *   deslocamento continua sendo deslocamento e continua disparando náusea em
 *   quem tem desordem vestibular. As chaves de transform são REMOVIDAS, não
 *   encurtadas.
 *
 *   Exceção documentada: `expandVariants` (item C).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * B) CONTRATO DE PERFORMANCE (NFR-001 — FCP < 1.8s, TTI < 3.5s)
 * ─────────────────────────────────────────────────────────────────────────────
 * Anime SOMENTE propriedades compostas — `transform` (x, y, scale, rotate) e
 * `opacity`. Elas são resolvidas na thread de composição da GPU: não disparam
 * layout nem paint, e por isso não competem com hidratação/TTI.
 *
 * Animar `width`, `height`, `top`, `left`, `right`, `bottom`, `margin` ou
 * `padding` força reflow a cada quadro na thread principal — é o caminho mais
 * curto para long tasks e queda de INP. `tests/unit/animations.test.ts` varre
 * TODAS as variantes exportadas e falha se alguma tocar nessas propriedades.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * C) A ÚNICA EXCEÇÃO: `expandVariants` anima `height` (TCK-014)
 * ─────────────────────────────────────────────────────────────────────────────
 * Expandir/colapsar é, por definição, uma mudança de altura: não existe
 * equivalente em `transform` que revele conteúdo antes escondido
 * (`scaleY` deforma o conteúdo e não devolve espaço no fluxo, logo os irmãos
 * não se reposicionam). A exceção é declarada em
 * `LAYOUT_ANIMATION_EXCEPTIONS` e o teste só a tolera nessa variante.
 *
 * Mitigações obrigatórias no consumidor (TCK-014):
 *   1. `style={{ overflow: 'hidden' }}` no invólucro — sem isso o conteúdo
 *      vaza durante o colapso e força repaint da árvore inteira;
 *   2. `contain: 'layout paint'` (utilitário CSS) no invólucro, para conter o
 *      reflow ao subárvore do card em vez de propagar para o grid;
 *   3. UM card expandido por vez — reflow de N cards simultâneos é o cenário
 *      que derruba o INP;
 *   4. sob `reduced`, a transição vai para `duration.instant` (0ms): o
 *      conteúdo simplesmente aparece. Isso não é "mais rápido", é a REMOÇÃO da
 *      animação — a única degradação coerente quando a propriedade animada é o
 *      próprio layout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D) API (o que TCK-013/014/015 consomem)
 * ─────────────────────────────────────────────────────────────────────────────
 * ```tsx
 * 'use client';
 * import { motion, AnimatePresence } from 'framer-motion';
 * import { useReducedMotion } from '@/hooks/useReducedMotion';
 * import { staggerContainerVariants, staggerItemVariants } from '@/lib/animations';
 *
 * const reduced = useReducedMotion();
 *
 * // TCK-013 — grid Netflix-style
 * <motion.ul variants={staggerContainerVariants({ reduced })} initial="hidden" animate="visible">
 *   {items.map((item) => (
 *     <motion.li key={item.id} variants={staggerItemVariants({ reduced })}>…</motion.li>
 *   ))}
 * </motion.ul>
 *
 * // TCK-014 — card expansível
 * <motion.div
 *   variants={expandVariants({ reduced })}
 *   initial={false}
 *   animate={open ? 'expanded' : 'collapsed'}
 *   style={{ overflow: 'hidden' }}
 * />
 *
 * // TCK-015 — player modal
 * <AnimatePresence>
 *   {open ? (
 *     <>
 *       <motion.div variants={overlayVariants({ reduced })} initial="hidden" animate="visible" exit="exit" />
 *       <motion.div variants={modalVariants({ reduced })} initial="hidden" animate="visible" exit="exit" />
 *     </>
 *   ) : null}
 * </AnimatePresence>
 *
 * // reveal on scroll
 * <motion.section
 *   variants={revealVariants({ reduced })}
 *   initial="hidden"
 *   whileInView="visible"
 *   viewport={scrollRevealViewport}
 * />
 * ```
 *
 * Nomes de estado, estáveis em toda a aplicação:
 *   entrada/saída → `hidden` | `visible` | `exit`
 *   expansão      → `collapsed` | `expanded`
 *   interação     → `rest` | `hover` | `tap`
 *   skeleton      → `idle` | `shimmer`
 */
import type { BezierDefinition, TargetAndTransition, Transition, Variants } from 'framer-motion';

import { tokens } from '@/lib/tokens';
import type {
  DurationKey,
  DurationValue,
  EasingKey,
  EasingValue,
  TransitionKey,
} from '@/types/tokens';

/* ========================================================================== */
/* 1. Adaptadores token → framer-motion                                       */
/* ========================================================================== */

/**
 * `'200ms'` → `0.2`. O CSS fala em milissegundos, o framer-motion em segundos;
 * esta é a única ponte entre os dois.
 */
export function msToSeconds(value: DurationValue): number {
  const milliseconds = Number.parseFloat(value);

  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Duração de motion inválida: ${value}`);
  }

  return milliseconds / 1000;
}

/** Duração (em segundos) de um degrau da escala — ex.: `durationOf('slow')`. */
export function durationOf(key: DurationKey): number {
  return msToSeconds(tokens.motion.duration[key]);
}

/**
 * `'cubic-bezier(0.2, 0, 0, 1)'` → `[0.2, 0, 0, 1]`.
 * O framer-motion aceita a tupla ou a palavra-chave `'linear'`, nunca a string
 * CSS completa.
 */
export function parseEasing(value: EasingValue): BezierDefinition | 'linear' {
  if (value === 'linear') return 'linear';

  const match = /^cubic-bezier\(([^)]*)\)$/.exec(value);
  if (!match) {
    throw new Error(`Curva de motion inválida: ${value}`);
  }

  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Curva de motion inválida: ${value}`);
  }

  return [parts[0], parts[1], parts[2], parts[3]] as BezierDefinition;
}

/** Curva de um degrau da escala — ex.: `easingOf('emphasized')`. */
export function easingOf(key: EasingKey): BezierDefinition | 'linear' {
  return parseEasing(tokens.motion.easing[key]);
}

/** Transição concreta derivada de um token (duração + curva já pareadas). */
interface TokenTransition {
  readonly duration: number;
  readonly ease: BezierDefinition | 'linear';
  readonly delay?: number;
}

/**
 * Preset de transição do design system pronto para o framer-motion.
 * `transitionOf('overlay')` → `{ duration: 0.2, ease: [0.2, 0, 0, 1] }`.
 */
export function transitionOf(key: TransitionKey, delay = 0): TokenTransition {
  const preset = tokens.motion.transition[key];

  return {
    duration: msToSeconds(preset.duration),
    ease: parseEasing(preset.easing),
    ...(delay > 0 ? { delay } : {}),
  };
}

/** Transição instantânea (token `duration.instant`), usada na degradação. */
export function instantTransition(delay = 0): TokenTransition {
  return {
    duration: durationOf('instant'),
    ease: easingOf('linear'),
    ...(delay > 0 ? { delay } : {}),
  };
}

function mergeTransition(base: TokenTransition, override?: Transition): Transition {
  return (override ? { ...base, ...override } : base) as Transition;
}

/* ========================================================================== */
/* 2. Tipos públicos                                                          */
/* ========================================================================== */

export type SlideDirection = 'up' | 'down' | 'left' | 'right';

/** Opções comuns a todas as fábricas de variante. */
export interface MotionOptions {
  /**
   * `true` degrada a variante para movimento zero (item A do cabeçalho).
   * Passe o retorno de `useReducedMotion()`. Default: `false`.
   */
  readonly reduced?: boolean;
  /** Atraso de entrada, em segundos. Default: `0`. */
  readonly delay?: number;
  /** Sobrescreve/estende a transição derivada do token. Use com parcimônia. */
  readonly transition?: Transition;
}

export interface SlideOptions extends MotionOptions {
  /** Deslocamento em px. Default: `DEFAULT_SLIDE_DISTANCE` (token `spacing.6`). */
  readonly distance?: number;
  /** Direção do MOVIMENTO (`'up'` entra vindo de baixo). Default: `'up'`. */
  readonly direction?: SlideDirection;
}

export interface ScaleOptions extends MotionOptions {
  /** Escala inicial/final. Default: `DEFAULT_SCALE_FROM`. */
  readonly from?: number;
}

export interface StaggerOptions extends MotionOptions {
  /** Intervalo entre filhos, em segundos. Default: `DEFAULT_STAGGER_STEP`. */
  readonly stagger?: number;
  /** Atraso antes do primeiro filho, em segundos. Default: `0`. */
  readonly delayChildren?: number;
}

export interface InteractiveOptions extends MotionOptions {
  /** Escala no hover/focus. Default: `DEFAULT_HOVER_SCALE`. */
  readonly hoverScale?: number;
  /** Escala no press. Default: `DEFAULT_TAP_SCALE`. */
  readonly tapScale?: number;
}

/** Variantes de entrada/saída — estados `hidden` | `visible` | `exit`. */
export type EnterExitVariants = Variants & {
  hidden: TargetAndTransition;
  visible: TargetAndTransition;
  exit: TargetAndTransition;
};

/** Variantes de expansão — estados `collapsed` | `expanded`. */
export type ExpandVariants = Variants & {
  collapsed: TargetAndTransition;
  expanded: TargetAndTransition;
};

/** Variantes de interação — estados `rest` | `hover` | `tap`. */
export type InteractiveVariants = Variants & {
  rest: TargetAndTransition;
  hover: TargetAndTransition;
  tap: TargetAndTransition;
};

/** Variantes de skeleton — estados `idle` | `shimmer`. */
export type ShimmerVariants = Variants & {
  idle: TargetAndTransition;
  shimmer: TargetAndTransition;
};

/* ========================================================================== */
/* 3. Constantes derivadas                                                    */
/* ========================================================================== */

/** `'1.5rem'` → `24`. Mantém a distância de slide presa à escala de espaço. */
function remToPixels(value: string): number {
  const amount = Number.parseFloat(value);

  if (!Number.isFinite(amount)) {
    throw new Error(`Valor de espaçamento inválido: ${value}`);
  }

  return value.trim().endsWith('rem') ? amount * 16 : amount;
}

/** Deslocamento padrão de slide/reveal: token `spacing.6` (1.5rem = 24px). */
export const DEFAULT_SLIDE_DISTANCE = remToPixels(tokens.spacing['6']);

/** Deslocamento curto (modal, dropdown): token `spacing.2` (0.5rem = 8px). */
export const DEFAULT_MODAL_OFFSET = remToPixels(tokens.spacing['2']);

/** Escala inicial de `scaleVariants` / `modalVariants`. */
export const DEFAULT_SCALE_FROM = 0.96;

/** Escala de hover do card do catálogo (TCK-013). */
export const DEFAULT_HOVER_SCALE = 1.04;

/** Escala de press — feedback tátil sem deslocar o layout. */
export const DEFAULT_TAP_SCALE = 0.98;

/**
 * Intervalo entre filhos no stagger: metade do degrau `duration.fast`
 * (120ms / 2 = 60ms). Um grid de 20 posters fecha a cascata em 1.2s, dentro do
 * orçamento de percepção do NFR-001.
 */
export const DEFAULT_STAGGER_STEP = durationOf('fast') / 2;

/** Cascata de saída: metade da de entrada (sair é mais rápido que entrar). */
export const DEFAULT_STAGGER_EXIT_STEP = DEFAULT_STAGGER_STEP / 2;

/**
 * Propriedades que este sistema tem permissão para animar — todas compostas
 * (`transform` + `opacity`). Ver item B do cabeçalho.
 */
export const COMPOSITED_ANIMATABLE_PROPERTIES = [
  'opacity',
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

/**
 * Propriedades PROIBIDAS: disparam layout/reflow a cada quadro na thread
 * principal. O teste unitário falha se alguma variante as usar.
 */
export const LAYOUT_TRIGGERING_PROPERTIES = [
  'width',
  'height',
  'top',
  'left',
  'right',
  'bottom',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
] as const;

/**
 * Exceções conscientes à regra acima, por preset. Ver item C do cabeçalho:
 * `expand` anima `height` porque revelar conteúdo É mudar a altura do fluxo.
 * Qualquer entrada nova aqui exige justificativa no code review.
 */
export const LAYOUT_ANIMATION_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  expand: ['height'],
};

/**
 * `viewport` padrão do reveal on scroll: dispara uma única vez, quando 20% do
 * bloco entrou na tela. `once: true` é requisito de acessibilidade — reanimar a
 * cada scroll é movimento repetido e desnecessário.
 */
export const scrollRevealViewport = { once: true, amount: 0.2 } as const;

/* ========================================================================== */
/* 4. Fábricas de variante                                                    */
/* ========================================================================== */

/** Deslocamento inicial de um slide, já degradado sob reduced-motion. */
function slideOffset(
  direction: SlideDirection,
  distance: number,
  reduced: boolean,
): TargetAndTransition {
  if (reduced) return {};

  switch (direction) {
    case 'up':
      return { y: distance };
    case 'down':
      return { y: -distance };
    case 'left':
      return { x: distance };
    case 'right':
      return { x: -distance };
  }
}

/** Alvo neutro de transform (só existe quando há transform para neutralizar). */
function restOffset(direction: SlideDirection, reduced: boolean): TargetAndTransition {
  if (reduced) return {};
  return direction === 'up' || direction === 'down' ? { y: 0 } : { x: 0 };
}

/**
 * Fade puro. É a variante que MENOS degrada: opacidade não é movimento, então
 * sob `reduced` ela permanece idêntica.
 */
export function fadeVariants(options: MotionOptions = {}): EnterExitVariants {
  const { delay = 0, transition } = options;
  const enter = mergeTransition(transitionOf('fade', delay), transition);
  const leave = mergeTransition(transitionOf('fade'), transition);

  return {
    hidden: { opacity: 0, transition: leave },
    visible: { opacity: 1, transition: enter },
    exit: { opacity: 0, transition: leave },
  };
}

/**
 * Slide + fade nas quatro direções. `direction` descreve para onde o elemento
 * VAI ao entrar (`'up'` = sobe, portanto começa abaixo).
 *
 * Sob `reduced`: vira fade puro — `x`/`y` deixam de existir na variante.
 */
export function slideVariants(
  direction: SlideDirection = 'up',
  options: SlideOptions = {},
): EnterExitVariants {
  const { reduced = false, delay = 0, distance = DEFAULT_SLIDE_DISTANCE, transition } = options;
  const token = reduced ? 'fade' : 'slide';
  const enter = mergeTransition(transitionOf(token, delay), transition);
  const leave = mergeTransition(transitionOf(token), transition);
  const offset = slideOffset(direction, distance, reduced);

  return {
    hidden: { opacity: 0, ...offset, transition: leave },
    visible: { opacity: 1, ...restOffset(direction, reduced), transition: enter },
    exit: { opacity: 0, ...offset, transition: leave },
  };
}

/**
 * Scale + fade (badges, ícones, popovers).
 * Sob `reduced`: vira fade puro — `scale` deixa de existir na variante.
 */
export function scaleVariants(options: ScaleOptions = {}): EnterExitVariants {
  const { reduced = false, delay = 0, from = DEFAULT_SCALE_FROM, transition } = options;
  const token = reduced ? 'fade' : 'scale';
  const enter = mergeTransition(transitionOf(token, delay), transition);
  const leave = mergeTransition(transitionOf(token), transition);
  const hiddenScale: TargetAndTransition = reduced ? {} : { scale: from };
  const visibleScale: TargetAndTransition = reduced ? {} : { scale: 1 };

  return {
    hidden: { opacity: 0, ...hiddenScale, transition: leave },
    visible: { opacity: 1, ...visibleScale, transition: enter },
    exit: { opacity: 0, ...hiddenScale, transition: leave },
  };
}

/**
 * Contêiner de lista/grid (TCK-013). Não anima nada por si — apenas orquestra
 * a entrada dos filhos.
 *
 * Sob `reduced`: `staggerChildren` = 0. A cascata é movimento distribuído no
 * tempo; sem ela os itens entram juntos, com o fade de cada um.
 */
export function staggerContainerVariants(options: StaggerOptions = {}): EnterExitVariants {
  const {
    reduced = false,
    delay = 0,
    delayChildren = delay,
    stagger = DEFAULT_STAGGER_STEP,
    transition,
  } = options;

  const step = reduced ? 0 : stagger;
  const exitStep = reduced ? 0 : Math.min(stagger, DEFAULT_STAGGER_EXIT_STEP);

  return {
    hidden: { transition: mergeTransition(instantTransition(), transition) },
    visible: {
      transition: {
        ...mergeTransition(instantTransition(), transition),
        staggerChildren: step,
        delayChildren: reduced ? 0 : delayChildren,
      },
    },
    exit: {
      transition: {
        ...mergeTransition(instantTransition(), transition),
        staggerChildren: exitStep,
        staggerDirection: -1,
      },
    },
  };
}

/**
 * Item de lista/grid orquestrado por `staggerContainerVariants`.
 * Slide curto + fade; sob `reduced`, fade puro.
 *
 * IMPORTANTE: o item NÃO declara `delay` próprio — quem distribui o tempo é o
 * contêiner via `staggerChildren`.
 */
export function staggerItemVariants(options: SlideOptions = {}): EnterExitVariants {
  const { direction = 'up', ...rest } = options;
  return slideVariants(direction, rest);
}

/**
 * Expand/collapse de altura (TCK-014). ÚNICA variante que anima layout —
 * ver item C do cabeçalho para a justificativa e as mitigações obrigatórias.
 *
 * A opacidade tem transição própria e mais curta que a altura, para o conteúdo
 * não "piscar" enquanto o contêiner ainda cresce.
 *
 * Sob `reduced`: transição vai para `duration.instant` (0ms) — o conteúdo
 * aparece/some sem animação alguma. Não é a mesma animação mais rápida: é a
 * ausência dela.
 */
export function expandVariants(options: MotionOptions = {}): ExpandVariants {
  const { reduced = false, delay = 0, transition } = options;
  const base = reduced ? instantTransition() : transitionOf('expand', delay);
  const opacity = reduced ? instantTransition() : transitionOf('fade');
  const merged = mergeTransition(base, transition);

  return {
    collapsed: {
      height: 0,
      opacity: 0,
      transition: { ...merged, opacity: mergeTransition(opacity) },
    },
    expanded: {
      height: 'auto',
      opacity: 1,
      transition: { ...merged, opacity: mergeTransition(opacity) },
    },
  };
}

/**
 * Scrim do modal (TCK-015). Fade puro por definição — o scrim cobre a tela
 * inteira, qualquer transform nele seria movimento em tela cheia.
 */
export function overlayVariants(options: MotionOptions = {}): EnterExitVariants {
  const { delay = 0, transition } = options;
  const enter = mergeTransition(transitionOf('overlay', delay), transition);
  const leave = mergeTransition(transitionOf('overlay'), transition);

  return {
    hidden: { opacity: 0, transition: leave },
    visible: { opacity: 1, transition: enter },
    exit: { opacity: 0, transition: leave },
  };
}

/**
 * Painel do modal/player (TCK-015): fade + scale + subida curta.
 * Sob `reduced`: fade puro, sem `scale` e sem `y`.
 *
 * Lembrete de a11y para TCK-015: a variante cuida do movimento, não do foco.
 * O modal continua precisando de focus trap, `aria-modal` e retorno de foco.
 */
export function modalVariants(options: ScaleOptions = {}): EnterExitVariants {
  const { reduced = false, delay = 0, from = DEFAULT_SCALE_FROM, transition } = options;
  const token = reduced ? 'fade' : 'scale';
  const enter = mergeTransition(transitionOf(token, delay), transition);
  const leave = mergeTransition(transitionOf(token), transition);
  const offscreen: TargetAndTransition = reduced
    ? {}
    : { scale: from, y: DEFAULT_MODAL_OFFSET };
  const onscreen: TargetAndTransition = reduced ? {} : { scale: 1, y: 0 };

  return {
    hidden: { opacity: 0, ...offscreen, transition: leave },
    visible: { opacity: 1, ...onscreen, transition: enter },
    exit: { opacity: 0, ...offscreen, transition: leave },
  };
}

/**
 * Reveal on scroll — use com `whileInView="visible"` e `viewport={scrollRevealViewport}`.
 * Deslocamento maior e curva `emphasized` (token `transition.slide`), porque o
 * bloco entra de fora da tela.
 *
 * Sob `reduced`: fade puro, disparado no mesmo ponto de scroll.
 */
export function revealVariants(options: SlideOptions = {}): EnterExitVariants {
  const { direction = 'up', ...rest } = options;
  return slideVariants(direction, rest);
}

/**
 * Skeleton shimmer (loading do grid/poster). Anima o `x` de uma faixa de
 * gradiente — transform, nunca `background-position`, que repinta.
 *
 * Consumo: um `motion.div` absoluto, com `inset-0` e um gradiente horizontal,
 * dentro de um contêiner `overflow-hidden`.
 *
 * Sob `reduced`: o laço não existe. WCAG 2.2 §2.2.2 — animação em loop precisa
 * de mecanismo de parada; a preferência do sistema É esse mecanismo. O
 * skeleton permanece estático (a cor de fundo já comunica "carregando", junto
 * de `aria-busy`).
 */
export function shimmerVariants(options: MotionOptions = {}): ShimmerVariants {
  const { reduced = false, transition } = options;

  if (reduced) {
    return { idle: {}, shimmer: {} };
  }

  return {
    idle: {},
    shimmer: {
      x: ['-100%', '100%'],
      transition: {
        ...mergeTransition(
          { duration: durationOf('slowest') * 2, ease: easingOf('linear') },
          transition,
        ),
        repeat: Number.POSITIVE_INFINITY,
        repeatType: 'loop',
      },
    },
  };
}

/**
 * Card interativo do catálogo (TCK-013): cresce no hover/focus, encolhe no
 * press. `scale` só — nada de `width`/`margin`, que empurrariam o grid inteiro.
 *
 * Sob `reduced`: os três estados ficam sem transform. O componente DEVE
 * continuar sinalizando hover/focus por cor e anel de foco (`border.focus`),
 * que não dependem de motion.
 */
export function interactiveVariants(options: InteractiveOptions = {}): InteractiveVariants {
  const {
    reduced = false,
    hoverScale = DEFAULT_HOVER_SCALE,
    tapScale = DEFAULT_TAP_SCALE,
    transition,
  } = options;

  const base = mergeTransition(transitionOf(reduced ? 'colors' : 'scale'), transition);

  if (reduced) {
    return {
      rest: { transition: base },
      hover: { transition: base },
      tap: { transition: base },
    };
  }

  return {
    rest: { scale: 1, transition: base },
    hover: { scale: hoverScale, transition: base },
    tap: { scale: tapScale, transition: base },
  };
}

/* ========================================================================== */
/* 5. Catálogo                                                                */
/* ========================================================================== */

/**
 * Todas as variantes do sistema, já resolvidas para um mesmo conjunto de
 * opções. Serve a dois propósitos:
 *   - consumo: `const m = motionPresets({ reduced })` numa tela que usa várias;
 *   - garantia: o teste unitário varre este catálogo, então TODA variante nova
 *     precisa ser registrada aqui e passa automaticamente a ser auditada pelas
 *     regras de performance e de reduced-motion.
 */
export function motionPresets(options: MotionOptions = {}) {
  return {
    fade: fadeVariants(options),
    slideUp: slideVariants('up', options),
    slideDown: slideVariants('down', options),
    slideLeft: slideVariants('left', options),
    slideRight: slideVariants('right', options),
    scale: scaleVariants(options),
    staggerContainer: staggerContainerVariants(options),
    staggerItem: staggerItemVariants(options),
    expand: expandVariants(options),
    overlay: overlayVariants(options),
    modal: modalVariants(options),
    reveal: revealVariants(options),
    shimmer: shimmerVariants(options),
    interactive: interactiveVariants(options),
  } as const;
}

export type MotionPresets = ReturnType<typeof motionPresets>;
export type MotionPresetName = keyof MotionPresets;

/** Ordem estável dos presets — usada pelos testes e por documentação. */
export const MOTION_PRESET_NAMES = [
  'fade',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'scale',
  'staggerContainer',
  'staggerItem',
  'expand',
  'overlay',
  'modal',
  'reveal',
  'shimmer',
  'interactive',
] as const satisfies readonly MotionPresetName[];
