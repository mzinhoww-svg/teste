import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPrisma } from "./prisma";
import type { AdminRole } from "./types";

// ==========================================================================
// Acesso ao admin do catálogo.
//
// Autenticação: Supabase Auth (e-mail/senha) — o mesmo provedor já usado pelo
// resto do repositório, então não há um segundo login para manter.
// Autorização: a tabela `portfolio_admin_users` decide o papel (ADMIN/EDITOR).
// Um envelope de emergência (PORTFOLIO_ADMIN_EMAILS) permite entrar antes de
// existir qualquer linha na tabela — é o caminho de bootstrap do primeiro admin.
//
// ADMIN  → tudo, incluindo Configurações e Usuários
// EDITOR → programas e episódios
// ==========================================================================

export interface PortfolioSession {
  userId: string;
  email: string;
  role: AdminRole;
}

function bootstrapEmails(): string[] {
  return (process.env.PORTFOLIO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Sessão do admin do catálogo, ou null se não autenticado/autorizado.
 * Atualiza `lastLoginAt` de forma oportunista (falha aqui não bloqueia acesso).
 */
export async function getPortfolioSession(): Promise<PortfolioSession | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  const email = user.email.toLowerCase();

  const prisma = getPrisma();
  if (!prisma) {
    // Sem banco não há tabela de papéis: só o envelope de emergência entra.
    return bootstrapEmails().includes(email)
      ? { userId: user.id, email, role: "ADMIN" }
      : null;
  }

  try {
    const admin = await prisma.adminUser.findUnique({ where: { email } });

    if (admin) {
      void prisma.adminUser
        .update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })
        .catch(() => {});
      return {
        userId: user.id,
        email,
        role: admin.role === "ADMIN" ? "ADMIN" : "EDITOR",
      };
    }

    return bootstrapEmails().includes(email)
      ? { userId: user.id, email, role: "ADMIN" }
      : null;
  } catch (error) {
    console.error("[portfolio] getPortfolioSession falhou:", error);
    return bootstrapEmails().includes(email)
      ? { userId: user.id, email, role: "ADMIN" }
      : null;
  }
}

/** Guarda para Server Actions: lança quando o papel não basta. */
export async function requireRole(minimum: AdminRole = "EDITOR"): Promise<PortfolioSession> {
  const session = await getPortfolioSession();
  if (!session) throw new Error("Não autenticado no admin do catálogo.");
  if (minimum === "ADMIN" && session.role !== "ADMIN") {
    throw new Error("Esta ação exige papel ADMIN.");
  }
  return session;
}
