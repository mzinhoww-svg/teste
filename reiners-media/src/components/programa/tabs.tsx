'use client';

/**
 * TCK-016 — Abas da página de programa (Sobre · Episódios · Redes).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ÚNICA ILHA DE CLIENTE DESTA ROTA
 * ─────────────────────────────────────────────────────────────────────────────
 * Trocar de aba é interação: precisa de estado e de teclado, logo precisa de
 * JS. Mas o CONTEÚDO dos painéis não precisa. Por isso as seções chegam como
 * `ReactNode` já renderizado no servidor (`content`): o Server Component monta
 * hero, lista de episódios e redes, e este componente recebe a árvore pronta
 * pelo payload RSC. O bundle do cliente leva o mecanismo das abas e mais nada —
 * nem o texto dos 25 episódios, nem os componentes que os desenham.
 *
 * O comportamento ARIA (tabindex itinerante, setas, `aria-controls`) é todo do
 * `Tabs` do TCK-008; aqui não se reimplementa nada disso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HIERARQUIA DE HEADINGS
 * ─────────────────────────────────────────────────────────────────────────────
 * Rótulo de aba é `<button role="tab">`, não heading — ele não entra na lista
 * de títulos do leitor de tela. Sem um `h2` no painel, os `h3` dos episódios
 * ficariam órfãos sob o `h1` do hero (salto de nível, WCAG 2.2 §1.3.1). Cada
 * painel ganha então um `h2` `sr-only`: a hierarquia fica correta na árvore de
 * acessibilidade sem duplicar visualmente o rótulo que já está na aba.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOVIMENTO
 * ─────────────────────────────────────────────────────────────────────────────
 * A troca de painel usa `fadeVariants` de `@/lib/animations` alimentado por
 * `useReducedMotion()`. Fade é opacidade pura — sem deslocamento, sem escala —
 * e sob `reduced` a própria fábrica degrada a variante (item A do docblock de
 * `animations.ts`). Nada de duração hardcoded aqui.
 *
 * `LazyMotion` + `m` em vez de `motion`: o componente `motion` arrasta o
 * conjunto COMPLETO de features do framer (drag, layout, gestos, SVG path) para
 * o bundle da rota — ~60 kB para fazer um fade. `domAnimation` carrega só
 * animação e variantes; `strict` faz o build falhar se alguém reintroduzir
 * `motion.*` aqui por engano. Isso é NFR-001 (TTI < 3.5s) numa rota que, fora
 * as abas, não tem JavaScript nenhum.
 */
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { useState, type ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fadeVariants } from '@/lib/animations';

export interface ProgramaTabSection {
  /** Identificador estável da aba — vira parte de ids do DOM. */
  readonly value: string;
  /** Rótulo visível da aba. */
  readonly label: string;
  /** Heading acessível do painel. Default: o próprio `label`. */
  readonly heading?: string;
  /** Conteúdo do painel, renderizado no servidor. */
  readonly content: ReactNode;
}

export interface ProgramaTabsProps {
  sections: readonly ProgramaTabSection[];
  /** Nome acessível do conjunto de abas (WAI-ARIA APG exige). */
  label: string;
  /** Aba inicial. Default: a primeira. */
  defaultValue?: string;
  className?: string;
}

export function ProgramaTabs({ sections, label, defaultValue, className }: ProgramaTabsProps) {
  const firstValue = sections[0]?.value ?? '';
  const [value, setValue] = useState(defaultValue ?? firstValue);
  const reduced = useReducedMotion();
  const variants = fadeVariants({ reduced });

  if (sections.length === 0) return null;

  return (
    <LazyMotion features={domAnimation} strict>
      <Tabs
        value={value}
        onValueChange={setValue}
        // `manual` não é necessário (o conteúdo já está no cliente, atravessar
        // as abas com a seta não dispara fetch nenhum), então fica o
        // `automatic`.
        className={cn('gap-6', className)}
      >
        <TabsList aria-label={label} className="max-w-full overflow-x-auto">
          {sections.map((section) => (
            <TabsTrigger key={section.value} value={section.value}>
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {sections.map((section) => (
          <TabsContent key={section.value} value={section.value}>
            <h2 className="sr-only">{section.heading ?? section.label}</h2>
            <m.div
              variants={variants}
              initial={false}
              animate={value === section.value ? 'visible' : 'hidden'}
            >
              {section.content}
            </m.div>
          </TabsContent>
        ))}
      </Tabs>
    </LazyMotion>
  );
}
