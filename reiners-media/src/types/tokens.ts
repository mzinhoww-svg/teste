/**
 * TCK-001 — Contratos de tipo do design token system.
 *
 * Este arquivo descreve APENAS o formato dos tokens (o "schema").
 * Os valores vivem em `src/lib/tokens.ts` — nenhum literal de cor aqui.
 *
 * Referências:
 * - Reiners Media Design System 2026 (Navy / Creme / Ouro)
 * - PodFactory tokens (surface.base preto, acento orquídea, tipografia Borna)
 *
 * Regras:
 * - Nenhum `any`.
 * - Todo token de cor é um par light/dark, para suportar `darkMode: 'class'`.
 * - Todo token primitivo é hexadecimal; tokens semânticos referenciam primitivos.
 */

/* -------------------------------------------------------------------------- */
/* Primitivos                                                                  */
/* -------------------------------------------------------------------------- */

/** Cor hexadecimal (`#RRGGBB`). Único formato aceito para tokens primitivos. */
export type HexColor = `#${string}`;

/** Esquemas de cor suportados pelo theme system. */
export type ColorScheme = 'light' | 'dark';

/** Trio de canais RGB em notação de espaço (`"250 247 242"`), usado nas CSS custom properties. */
export type RgbChannels = `${number} ${number} ${number}`;

/* -------------------------------------------------------------------------- */
/* ColorToken                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Token semântico de cor: sempre resolvido nos dois esquemas.
 * O consumidor nunca escolhe o valor — escolhe o papel semântico.
 */
export interface ColorToken {
  readonly light: HexColor;
  readonly dark: HexColor;
}

/** Grupo de tokens de cor indexado por chave semântica. */
export type ColorTokenGroup<K extends string> = {
  readonly [P in K]: ColorToken;
};

/** Papéis de superfície (fundos). */
export type SurfaceKey =
  | 'base'
  | 'sunken'
  | 'raised'
  | 'overlay'
  | 'inverse'
  | 'accent';

/** Papéis de texto. `onAccent` é o texto colocado sobre `accent.default`. */
export type TextKey =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'accent'
  | 'brand'
  | 'onAccent'
  | 'link';

/**
 * Papéis de borda / divisória.
 *
 * ATENÇÃO ao escolher (WCAG 2.2 §1.4.11 — Non-text Contrast):
 * - `subtle`  — DECORATIVO. ~1.1:1. Só para divisórias internas de um bloco
 *               que já tem limite próprio. NUNCA como único indicador do
 *               limite de um componente (card, input, botão fantasma).
 * - `default` — limite de componente padrão, garantido >= 3:1 contra todas as
 *               superfícies de conteúdo nos dois esquemas. É o token seguro.
 * - `strong`  — limite enfático, >= 4.7:1.
 * - `accent`  — limite em estado selecionado/ativo, >= 3:1.
 * - `focus`   — anel de foco de teclado, >= 3:1.
 *
 * `accent` e `focus` são meios-tons de propósito: garantem os 3:1 tanto sobre
 * as superfícies normais quanto sobre `surface.inverse`, que inverte a
 * polaridade dentro do mesmo tema. Não troque por um tom mais claro no dark
 * "para destacar" — é exatamente o que reprova sobre a faixa invertida.
 */
export type BorderKey = 'subtle' | 'default' | 'strong' | 'accent' | 'focus';

/** Papéis do acento interativo (default de `Podcast.accentColor`). */
export type AccentKey = 'default' | 'hover' | 'active' | 'subtle' | 'contrast';

/** Papéis de estado (feedback). `*Surface` são fundos tonais do mesmo estado. */
export type StateKey =
  | 'success'
  | 'successSurface'
  | 'warning'
  | 'warningSurface'
  | 'danger'
  | 'dangerSurface'
  | 'info'
  | 'infoSurface';

/**
 * Cores de marca — imutáveis entre esquemas por definição.
 * NUNCA ajustar por contraste: para texto legível use `text.brand` / `text.accent`.
 */
export type BrandKey = 'navy' | 'cream' | 'gold' | 'orchid';

/** Conjunto completo de cores semânticas. */
export interface ColorTokens {
  readonly surface: ColorTokenGroup<SurfaceKey>;
  readonly text: ColorTokenGroup<TextKey>;
  readonly border: ColorTokenGroup<BorderKey>;
  readonly accent: ColorTokenGroup<AccentKey>;
  readonly state: ColorTokenGroup<StateKey>;
  readonly brand: ColorTokenGroup<BrandKey>;
}

/** Caminho `grupo.chave` de um token de cor — usado por `colorVar()`. */
export type ColorTokenPath =
  | `surface.${SurfaceKey}`
  | `text.${TextKey}`
  | `border.${BorderKey}`
  | `accent.${AccentKey}`
  | `state.${StateKey}`
  | `brand.${BrandKey}`;

/** Nome da CSS custom property gerada para um token de cor. */
export type ColorCssVarName = `--color-${string}`;

/* -------------------------------------------------------------------------- */
/* TypographyToken                                                             */
/* -------------------------------------------------------------------------- */

/** Font stack completa (família semântica + fallbacks). */
export type FontFamilyToken = string;

/** Famílias tipográficas semânticas. */
export type FontFamilyKey = 'display' | 'sans' | 'mono';

/** Tamanho de fonte em `rem` (nunca `px`, para respeitar o zoom do usuário). */
export type FontSizeValue = `${number}rem`;

/** Peso tipográfico como string (compatível com CSS custom properties). */
export type FontWeightValue = `${number}`;

/** Line-height sem unidade (multiplicador). */
export type LineHeightValue = `${number}`;

/** Letter-spacing relativo ao tamanho da fonte. */
export type LetterSpacingValue = `${number}em`;

export type FontWeightKey =
  | 'light'
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'black';

export type LineHeightKey =
  | 'none'
  | 'tight'
  | 'snug'
  | 'normal'
  | 'relaxed'
  | 'loose';

export type LetterSpacingKey =
  | 'tighter'
  | 'tight'
  | 'normal'
  | 'wide'
  | 'wider'
  | 'widest';

/**
 * Degraus da escala tipográfica, em ordem crescente.
 * A ordem desta união é normativa: `typographyScaleOrder` deve segui-la e
 * os tamanhos precisam ser estritamente monotônicos crescentes.
 */
export type TypographyScaleKey =
  | '2xs'
  | 'xs'
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl'
  | '8xl';

/** Um degrau da escala: tamanho + métricas verticais/horizontais associadas. */
export interface TypographyToken {
  readonly fontSize: FontSizeValue;
  readonly lineHeight: LineHeightValue;
  readonly letterSpacing: LetterSpacingValue;
}

export interface TypographyTokens {
  readonly family: { readonly [K in FontFamilyKey]: FontFamilyToken };
  readonly weight: { readonly [K in FontWeightKey]: FontWeightValue };
  readonly lineHeight: { readonly [K in LineHeightKey]: LineHeightValue };
  readonly letterSpacing: { readonly [K in LetterSpacingKey]: LetterSpacingValue };
  readonly scale: { readonly [K in TypographyScaleKey]: TypographyToken };
}

/* -------------------------------------------------------------------------- */
/* SpacingToken / RadiusToken / ShadowToken                                    */
/* -------------------------------------------------------------------------- */

/** Espaçamento em `rem` (ou `px` apenas para hairlines). */
export type SpacingToken = `${number}rem` | `${number}px`;

export type SpacingKey =
  | '0'
  | 'px'
  | '0.5'
  | '1'
  | '1.5'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '8'
  | '10'
  | '12'
  | '16'
  | '20'
  | '24'
  | '32'
  | '40'
  | '48'
  | '64'
  | '80';

export type SpacingTokens = { readonly [K in SpacingKey]: SpacingToken };

/** Raio de canto. `full` usa um valor grande o suficiente para pílulas/círculos. */
export type RadiusToken = `${number}rem` | `${number}px`;

export type RadiusKey =
  | 'none'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | 'full';

export type RadiusTokens = { readonly [K in RadiusKey]: RadiusToken };

/** Valor de `box-shadow` já montado (pode conter múltiplas camadas). */
export type ShadowToken = string;

/**
 * `raised` e `poster` são os tokens de ELEVAÇÃO: embutem um hairline derivado
 * de `border.*` via CSS var, então funcionam nos dois esquemas. `xs`…`xl` são
 * sombras pretas — decorativas no dark, onde somem sobre `surface.base`
 * #000000 e não delimitam nada.
 */
export type ShadowKey =
  | 'none'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'raised'
  | 'poster'
  | 'glow';

export type ShadowTokens = { readonly [K in ShadowKey]: ShadowToken };

/* -------------------------------------------------------------------------- */
/* MotionToken                                                                 */
/* -------------------------------------------------------------------------- */

export type DurationValue = `${number}ms`;
export type EasingValue = 'linear' | `cubic-bezier(${string})`;

export type DurationKey =
  | 'instant'
  | 'fast'
  | 'normal'
  | 'slow'
  | 'slower'
  | 'slowest';

export type EasingKey =
  | 'linear'
  | 'standard'
  | 'accelerate'
  | 'decelerate'
  | 'emphasized'
  | 'spring';

/** Preset de transição: duração + curva já pareadas. */
export interface MotionToken {
  readonly duration: DurationValue;
  readonly easing: EasingValue;
}

export type TransitionKey =
  | 'fade'
  | 'scale'
  | 'slide'
  | 'expand'
  | 'overlay'
  | 'colors';

export interface MotionTokens {
  readonly duration: { readonly [K in DurationKey]: DurationValue };
  readonly easing: { readonly [K in EasingKey]: EasingValue };
  readonly transition: { readonly [K in TransitionKey]: MotionToken };
}

/* -------------------------------------------------------------------------- */
/* Layout: z-index e breakpoints                                               */
/* -------------------------------------------------------------------------- */

export type ZIndexValue = `${number}`;

export type ZIndexKey =
  | 'base'
  | 'raised'
  | 'sticky'
  | 'dropdown'
  | 'overlay'
  | 'modal'
  | 'popover'
  | 'toast'
  | 'tooltip'
  | 'max';

export type ZIndexTokens = { readonly [K in ZIndexKey]: ZIndexValue };

export type BreakpointValue = `${number}px`;

export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export type BreakpointTokens = { readonly [K in BreakpointKey]: BreakpointValue };

/* -------------------------------------------------------------------------- */
/* Agregador                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Contrato completo do design system. `src/lib/tokens.ts` satisfaz este tipo.
 * Consumidores (TCK-008, TCK-009, ...) devem tipar contra ele, nunca contra hex.
 */
export interface DesignTokens {
  readonly color: ColorTokens;
  readonly typography: TypographyTokens;
  readonly spacing: SpacingTokens;
  readonly radius: RadiusTokens;
  readonly shadow: ShadowTokens;
  readonly motion: MotionTokens;
  readonly zIndex: ZIndexTokens;
  readonly breakpoint: BreakpointTokens;
}

/** Nome de um grupo de cores (`surface`, `text`, ...). */
export type ColorGroupName = keyof ColorTokens;
