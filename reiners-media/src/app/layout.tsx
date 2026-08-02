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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF7F2' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0F' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
