// WhatsApp — MVP click-to-chat via wa.me (zero custo, sem aprovação).
// A arquitetura de provedor oficial (Cloud API) entra em /api/webhooks/whatsapp.

export function waMeLink(phone: string | undefined | null, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
