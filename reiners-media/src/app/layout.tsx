/**
 * TCK-000 — Root layout.
 *
 * Nenhum ticket do pacote declara ownership de `src/app/layout.tsx` (TCK-017
 * é dono apenas de `src/app/admin/layout.tsx`), mas o App Router exige um root
 * layout para que `next build` e `next lint` sequer executem. Entra como infra.
 *
 * Escopo deliberadamente mínimo: shell HTML, import dos tokens e metadata base.
 * A metadata dinâmica por rota é responsabilidade de TCK-022 (SEO); a Navbar e
 * o Footer entram via TCK-009 nos layouts de segmento.
 */
import type { Metadata, Viewport } from 'next';
import { tokens } from '@/lib/tokens';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Reiners Media — Estúdio de Podcast',
    template: '%s · Reiners Media',
  },
  description:
    'Estúdio de podcast full-service: gravação, edição, distribuição e estratégia de conteúdo.',
};

export const viewport: Viewport = {
  colorScheme: 'dark light',
  // Derivado dos tokens, nunca literal: o critério de aceitação de TCK-001 é
  // "nenhum hex raw fora dos arquivos de tokens", e vale para o repositório
  // inteiro. Hardcodar aqui faria a cor da barra do navegador mobile divergir
  // silenciosamente da marca quando a paleta mudasse.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: tokens.color.surface.base.light },
    { media: '(prefers-color-scheme: dark)', color: tokens.color.surface.base.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
