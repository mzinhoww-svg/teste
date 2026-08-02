/**
 * TCK-008 — Helper de composição de classes do design system.
 *
 * `cn` = `clsx` (condicionais) + `tailwind-merge` (resolução de conflito).
 * Sem ele, `cn(buttonVariants({ variant: 'primary' }), 'bg-surface-sunken')`
 * deixaria as duas cores de fundo na string e o resultado dependeria da ordem
 * em que o Tailwind emitiu o CSS — não da ordem em que o autor escreveu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE `extendTailwindMerge` E NÃO O `twMerge` PADRÃO
 * ─────────────────────────────────────────────────────────────────────────────
 * O `tailwind-merge` conhece a escala PADRÃO do Tailwind, não a nossa. Os
 * tokens de TCK-001 introduzem degraus que ele classificaria no grupo errado —
 * e classificar errado significa *não* remover o conflito (ou remover a classe
 * errada):
 *
 *   - `text-2xs`   → sem o registro abaixo cai no grupo `text-color`, então
 *                    `cn('text-2xs', 'text-content-primary')` apagaria o
 *                    TAMANHO em vez da cor.
 *   - `shadow-raised` / `shadow-poster` → elevação theme-aware (embutem o
 *                    hairline de borda). Precisam conflitar com `shadow-md`.
 *   - `rounded-xs`, `z-modal`, `duration-fast`, `ease-emphasized` → idem.
 *
 * Sempre que um token novo virar utilitário nomeado, registre-o aqui.
 */
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import { tokens, typographyScaleOrder } from '@/lib/tokens';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // A escala inteira, e não só `2xs`: assim a classificação não depende da
      // heurística de "t-shirt size" do tailwind-merge continuar batendo com a
      // nossa escala se ela mudar em TCK-001.
      'font-size': [{ text: [...typographyScaleOrder] }],
      shadow: [{ shadow: ['raised', 'poster', 'glow'] }],
      rounded: [{ rounded: ['xs'] }],
      z: [{ z: Object.keys(tokens.zIndex) }],
      duration: [{ duration: Object.keys(tokens.motion.duration) }],
      ease: [{ ease: Object.keys(tokens.motion.easing) }],
    },
  },
});

/** Compõe classes Tailwind resolvendo conflitos — a última declaração vence. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
