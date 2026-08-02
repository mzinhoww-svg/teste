import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Estado de acesso negado com contexto explícito: qual papel o usuário tem,
// em qual organização, e o que seria necessário.
export function PermissionDenied({ orgName, role }: { orgName: string; role: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600">
        <ShieldAlert className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Permissão insuficiente</h1>
      <p className="mt-2 text-sm text-slate-500">
        Seu papel nesta organização é <Badge variant="default">{role}</Badge> e esta área exige{" "}
        <Badge variant="brand">owner</Badge> ou <Badge variant="brand">admin</Badge>.
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Organização ativa: <strong className="text-slate-600">{orgName}</strong>. Peça a um administrador para
        ajustar seu papel se você precisa de acesso.
      </p>
    </div>
  );
}
