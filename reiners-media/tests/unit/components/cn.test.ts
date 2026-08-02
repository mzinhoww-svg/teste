/**
 * TCK-008 — `cn` precisa conhecer a escala de TCK-001, não a do Tailwind.
 *
 * Estes casos são exatamente os que quebram com o `twMerge` cru: o helper
 * classificaria `text-2xs` como COR e apagaria o tamanho, ou não veria conflito
 * entre `shadow-md` e `shadow-raised`.
 */
import { describe, expect, it } from 'vitest';

import { cn } from '@/components/ui/cn';

describe('cn', () => {
  it('mantém classes sem conflito', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('resolve condicionais e ignora valores falsos', () => {
    expect(cn('flex', false && 'hidden', undefined, null, 'gap-2')).toBe('flex gap-2');
  });

  it('faz a última classe conflitante vencer', () => {
    expect(cn('bg-surface-base', 'bg-surface-raised')).toBe('bg-surface-raised');
  });

  it('separa TAMANHO de fonte de COR de texto (degrau customizado 2xs)', () => {
    // Sem registrar a escala, `text-2xs` cairia no grupo de cor e sumiria.
    expect(cn('text-2xs', 'text-content-primary')).toBe('text-2xs text-content-primary');
    expect(cn('text-2xs', 'text-lg')).toBe('text-lg');
  });

  it('trata as sombras de elevação como conflitantes com as decorativas', () => {
    expect(cn('shadow-md', 'shadow-raised')).toBe('shadow-raised');
    expect(cn('shadow-raised', 'shadow-poster')).toBe('shadow-poster');
  });

  it('reconhece raio, z-index, duração e easing nomeados por token', () => {
    expect(cn('rounded-md', 'rounded-xs')).toBe('rounded-xs');
    expect(cn('z-modal', 'z-toast')).toBe('z-toast');
    expect(cn('duration-fast', 'duration-slow')).toBe('duration-slow');
    expect(cn('ease-standard', 'ease-emphasized')).toBe('ease-emphasized');
  });

  it('preserva variantes de estado como grupos independentes', () => {
    expect(cn('bg-surface-raised', 'hover:bg-surface-sunken')).toBe(
      'bg-surface-raised hover:bg-surface-sunken',
    );
  });
});
