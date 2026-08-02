import { listAdminUsers } from "@/lib/portfolio/data";
import { getPortfolioSession } from "@/lib/portfolio/auth";
import { isDatabaseConfigured } from "@/lib/portfolio/prisma";
import { Card, PageTitle } from "@/components/portfolio/admin/AdminUI";
import { AdminUserManager } from "@/components/portfolio/admin/AdminUserManager";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const [users, session] = await Promise.all([listAdminUsers(), getPortfolioSession()]);

  return (
    <>
      <PageTitle title="Usuários" />

      <Card className="mb-6">
        <p className="text-pf-sm text-pf-primary/60">
          O login é feito pelo Supabase Auth. Esta lista controla <strong>quem</strong> entra no
          admin do catálogo e com <strong>qual papel</strong>: <em>ADMIN</em> acessa tudo,
          incluindo Configurações e Usuários; <em>EDITOR</em> gerencia programas e episódios. A
          pessoa precisa ter conta no Supabase Auth com o mesmo e-mail.
        </p>
        {!isDatabaseConfigured() && (
          <p className="mt-3 text-pf-sm text-pf-inverse">
            Sem DATABASE_URL, apenas os e-mails de <code>PORTFOLIO_ADMIN_EMAILS</code> entram.
          </p>
        )}
      </Card>

      <AdminUserManager users={users} currentEmail={session?.email ?? ""} />
    </>
  );
}
