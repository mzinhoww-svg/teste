'use client';

/**
 * TCK-021 — Google Analytics 4 (FR-017).
 *
 * ---------------------------------------------------------------------------
 * REGRAS QUE ESTE COMPONENTE CUMPRE
 * ---------------------------------------------------------------------------
 *  1. SEM `NEXT_PUBLIC_GA4_ID`, NÃO RENDERIZA NADA. Ambiente local, preview e
 *     CI não têm a env: o componente devolve `null`, nenhuma tag entra no HTML,
 *     nenhuma requisição a terceiro sai e o build não quebra. É o motivo de a
 *     env ser lida com fallback em vez de `!`.
 *  2. ID VALIDADO (`G-XXXXXXX`). O valor é interpolado na URL do gtag.js e
 *     passado ao `gtag`; um valor colado com aspas/espaço vira requisição
 *     quebrada e, num ambiente onde a env não é confiável, vetor de injeção.
 *     `isValidGa4MeasurementId` barra antes de qualquer uso.
 *  3. CONSENTIMENTO ANTES DA REDE. Do Not Track, Global Privacy Control e
 *     opt-out são avaliados no cliente (`isAnalyticsEnabled`) ANTES de a tag
 *     existir — o gtag.js sequer é baixado. A decisão sai de um `useEffect`, e
 *     não do render, porque o servidor não conhece DNT nem `localStorage`:
 *     decidir no render produziria markup diferente do da hidratação.
 *  4. `strategy="afterInteractive"`. Analytics não pode competir com o LCP
 *     (NFR-001). `beforeInteractive` bloquearia o carregamento por um script de
 *     terceiro; `lazyOnload` perderia os primeiros eventos da sessão.
 *
 * ---------------------------------------------------------------------------
 * REQUISITO PARA TCK-024 — CSP (docs/SECURITY.md)
 * ---------------------------------------------------------------------------
 * `docs/SECURITY.md` fixa `default-src 'self'; script-src 'self' 'unsafe-inline'`,
 * e os headers de segurança são configurados em TCK-024 (`next.config.js` /
 * middleware — fora dos write_paths deste ticket). Com a política atual, o
 * gtag.js é BLOQUEADO: `'self'` não cobre `www.googletagmanager.com`. GA4 só
 * funciona quando TCK-024 acrescentar as origens:
 *
 * ```
 * script-src  'self' https://www.googletagmanager.com;
 * connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com
 *             https://www.googletagmanager.com;
 * img-src     'self' data: blob: https://*.google-analytics.com
 *             https://www.googletagmanager.com;
 * ```
 *
 * DUAS OBSERVAÇÕES QUE VALEM O PARÁGRAFO:
 *
 *  a) Este componente NÃO usa script inline. O snippet canônico do GA4 injeta
 *     um `<script>` inline com o shim do `dataLayer`; aqui esse shim mora no
 *     bundle (`initGa4`, em `@/lib/analytics-client`), executado por efeito.
 *     Logo, GA4 não é motivo para manter `'unsafe-inline'` nem para introduzir
 *     nonce/hash em `script-src`. Se TCK-024 optar por nonce (recomendado —
 *     `'unsafe-inline'` anula boa parte do valor da CSP contra XSS), este
 *     componente continua válido sem alteração.
 *
 *  b) NÃO afrouxe a política para fazer GA4 passar. Acrescentar as três origens
 *     acima é o escopo mínimo; `script-src 'unsafe-eval'` ou wildcard de host
 *     não são requisito do GA4 em modo gtag.js.
 *
 * Enquanto TCK-024 não ajustar a CSP, o efeito prático é o desejado por padrão:
 * sem env, sem tag; com env mas com CSP restritiva, o browser bloqueia o script
 * e o EventLog interno (`POST /api/events`, mesma origem) continua funcionando
 * — a telemetria de negócio não depende do GA4.
 */
import Script from 'next/script';
import { useEffect, useState } from 'react';

import {
  GA4_SCRIPT_ID,
  buildGa4ScriptUrl,
  initGa4,
  isAnalyticsEnabled,
  isValidGa4MeasurementId,
} from '@/lib/analytics-client';

export interface Ga4ScriptProps {
  /**
   * Sobrescreve `NEXT_PUBLIC_GA4_ID` (testes, Storybook, multi-tenant futuro).
   * Sem ela, o valor vem da env — e sem env, o componente não renderiza nada.
   */
  measurementId?: string;
}

/**
 * Carrega o gtag.js e configura o measurement ID.
 *
 * O `PAGE_VIEW` automático do GA4 fica DESLIGADO em `initGa4`: quem envia é
 * `trackPageView`/`usePageView` (`@/hooks/useAnalytics`), que também enxerga a
 * navegação client-side do App Router. Com os dois ligados, toda página seria
 * contada em dobro.
 */
export function Ga4Script({ measurementId }: Ga4ScriptProps): JSX.Element | null {
  // `process.env.NEXT_PUBLIC_*` precisa aparecer literal para o Next inlinar o
  // valor no bundle do cliente.
  const resolvedId = (measurementId ?? process.env.NEXT_PUBLIC_GA4_ID ?? '').trim();
  const isUsable = isValidGa4MeasurementId(resolvedId);

  // Começa `false` nos dois lados (servidor e primeira renderização do
  // cliente): mesmo markup, sem hydration mismatch.
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (!isUsable) return;
    if (!isAnalyticsEnabled()) {
      // Também marca `ga-disable-<ID>`: se o gtag.js entrar por outro caminho,
      // ele já nasce desligado para este measurement ID.
      initGa4(resolvedId);
      return;
    }
    // Enfileira `js` + `config` no `dataLayer` antes de o gtag.js carregar —
    // o próprio gtag.js consome a fila quando executa.
    initGa4(resolvedId);
    setConsented(true);
  }, [isUsable, resolvedId]);

  if (!isUsable || !consented) return null;

  return (
    <Script
      id={GA4_SCRIPT_ID}
      src={buildGa4ScriptUrl(resolvedId)}
      strategy="afterInteractive"
    />
  );
}

export default Ga4Script;
