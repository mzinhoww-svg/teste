"use client";

import { WhatsappGlyph } from "./whatsapp-icon";
import { FLOATING_WHATSAPP_MESSAGE, formatWhatsappNumber, whatsappUrl } from "@/lib/site/whatsapp";
import { trackSiteEvent } from "@/lib/site/track";

/**
 * Botão flutuante de WhatsApp — o atalho sempre visível para o canal de
 * ativação da Reiners. Sem número configurado no CMS, não renderiza nada
 * (melhor ausente do que levando a um link quebrado).
 */
export function WhatsappFab({ number }: { number: string }) {
  const href = whatsappUrl(number, FLOATING_WHATSAPP_MESSAGE);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackSiteEvent("cta_click", "whatsapp_fab")}
      aria-label={`Falar no WhatsApp: ${formatWhatsappNumber(number)}`}
      className="group fixed bottom-6 right-6 z-30 inline-flex min-h-[44px] items-center gap-3 rounded-site-step7 bg-site-text-inverse px-5 py-3 text-site-surface-base shadow-site-3 transition-all duration-fast hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] motion-reduce:hover:scale-100"
    >
      <WhatsappGlyph className="h-5 w-5 shrink-0" />
      {/* No mobile o rótulo some: sobra o alvo circular de 44px. */}
      <span className="hidden text-site-base font-medium sm:inline">WhatsApp</span>
    </a>
  );
}
