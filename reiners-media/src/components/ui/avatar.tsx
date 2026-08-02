'use client';

/**
 * TCK-008 — Avatar.
 *
 * Fallback em cascata: imagem → iniciais de `name` → `fallback` → ícone
 * genérico. O `onError` da imagem derruba para o fallback, então uma URL de
 * capa quebrada (risco registrado no PRD §14) não deixa um quadrado vazio.
 *
 * Acessibilidade: quando a imagem aparece, quem carrega o nome é o `alt`. Sem
 * imagem, as iniciais viram `aria-hidden` (um leitor de tela lendo "RM" não
 * ajuda ninguém) e o contêiner assume `role="img"` + `aria-label` com o nome
 * completo. Sem imagem e sem nome, o avatar é puramente decorativo e sai da
 * árvore de acessibilidade — nada a anunciar.
 *
 * `<img>` nativo em vez de `next/image` porque as fontes são URLs remotas do
 * Supabase e `next/image` exigiria configurar `images.remotePatterns` em
 * `next.config.js` — arquivo que não pertence a este ticket. Trocar depois é um
 * detalhe interno deste arquivo.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { User } from 'lucide-react';
import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn';

export const avatarVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden',
    'rounded-full border border-line-default bg-surface-sunken',
    'font-medium text-content-secondary',
  ],
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-2xs',
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-sm',
        lg: 'h-12 w-12 text-base',
        xl: 'h-16 w-16 text-lg',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface AvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof avatarVariants> {
  /** URL da imagem. */
  src?: string | null;
  /** Texto alternativo da imagem. Cai para `name` quando ausente. */
  alt?: string;
  /** Nome completo — origem das iniciais e do rótulo acessível. */
  name?: string;
  /** Conteúdo alternativo quando não há imagem nem nome. */
  fallback?: ReactNode;
}

/** "Ana Maria Reiners" → "AR". Primeira + última palavra, no máximo 2 letras. */
export function getInitials(name: string | undefined): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const first = words[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1] ?? '' : '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function Avatar({ className, size, src, alt, name, fallback, ...rest }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // Uma nova URL merece uma nova chance: sem isso, um `src` trocado depois de
  // um erro ficaria preso no fallback para sempre.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;
  const initials = getInitials(name);
  const accessibleName = alt ?? name;

  const labelling = showImage
    ? {}
    : accessibleName
      ? ({ role: 'img' as const, 'aria-label': accessibleName })
      : ({ 'aria-hidden': true } as const);

  return (
    <span className={cn(avatarVariants({ size }), className)} {...labelling} {...rest}>
      {showImage && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- ver docblock
        <img
          src={src}
          alt={accessibleName ?? ''}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        (fallback ?? <User aria-hidden="true" className="h-1/2 w-1/2" />)
      )}
    </span>
  );
}
