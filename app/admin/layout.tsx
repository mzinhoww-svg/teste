import { NOINDEX } from "@/lib/site/seo";

// Área administrativa: fora de buscador. Ver lib/site/seo.ts.
export const metadata = {
  title: { default: "Admin", template: "%s" },
  ...NOINDEX,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
