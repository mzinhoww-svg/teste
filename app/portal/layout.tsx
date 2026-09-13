import { NOINDEX } from "@/lib/site/seo";

// Portal do cliente: fora de buscador. Ver lib/site/seo.ts.
export const metadata = {
  title: { default: "Portal do cliente", template: "%s" },
  ...NOINDEX,
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
