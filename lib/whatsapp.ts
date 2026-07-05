// WhatsApp — MVP click-to-chat via wa.me (zero custo, sem aprovação).
// A arquitetura de provedor oficial (Cloud API) entra em /api/webhooks/whatsapp.

export function waMeLink(phone: string | undefined | null, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Compartilhar via WhatsApp sem telefone definido (tela de escolha de contato). */
export function waShareLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function inviteMessage(orgName: string, role: string, link: string): string {
  return `Olá! Você foi convidado(a) para a organização "${orgName}" no CRM AI Studio, como ${role === "admin" ? "administrador(a)" : "membro"}.\n\nAcesse o link para aceitar (use este mesmo e-mail ao entrar):\n${link}`;
}
