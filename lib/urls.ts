// URLs profissionais, uma única fonte da verdade. Deriva os subdomínios de
// NEXT_PUBLIC_ROOT_DOMAIN (ex.: reiners.agency); se não houver raiz, usa
// NEXT_PUBLIC_APP_URL; em último caso, string vazia (link relativo).
//
// - CRM interno  → crm.<root>   (convite de membro, área logada)
// - Portal       → app.<root>   (convite/acesso do cliente)
// - Público/apex → <root>       (proposta, assinatura, landing)
//
// Ambas as envs são NEXT_PUBLIC_*, então este módulo funciona em client e server.

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
const APP = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";

function base(sub: "" | "crm" | "app"): string {
  if (ROOT) return sub ? `https://${sub}.${ROOT}` : `https://${ROOT}`;
  return APP; // sem raiz configurada: cai no APP_URL (ou "" → relativo)
}

export const crmBaseUrl = () => base("crm");
export const portalBaseUrl = () => base("app");
export const publicBaseUrl = () => base("");

/** Link de convite de MEMBRO (interno) — abre em crm.<root>/convite/<token>. */
export const memberInviteUrl = (token: string) => `${crmBaseUrl()}/convite/${token}`;
/** Link de convite do CLIENTE (portal) — abre em app.<root>/portal/convite/<token>. */
export const clientInviteUrl = (token: string) => `${portalBaseUrl()}/portal/convite/${token}`;
/** Link público de PROPOSTA — <root>/proposta/<token>. */
export const proposalUrl = (token: string) => `${publicBaseUrl()}/proposta/${token}`;
/** Link público de ASSINATURA de contrato — <root>/sign/contracts/<token>. */
export const contractSignUrl = (token: string) => `${publicBaseUrl()}/sign/contracts/${token}`;
