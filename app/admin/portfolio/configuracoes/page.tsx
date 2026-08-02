import { getSiteConfig } from "@/lib/portfolio/data";
import { PageTitle } from "@/components/portfolio/admin/AdminUI";
import { ConfigForm } from "@/components/portfolio/admin/ConfigForm";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const config = await getSiteConfig();
  return (
    <>
      <PageTitle title="Configurações" />
      <ConfigForm config={config} />
    </>
  );
}
