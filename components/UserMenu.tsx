"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronDown, ListChecks, LogOut, Settings2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { logout } from "@/app/login/actions";
import { switchOrg } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgMembership, MemberRole } from "@/lib/db";

const roleLabel: Record<MemberRole, string> = {
  owner: "proprietário", admin: "admin", member: "membro",
};

// Identidade do tenant ativo (sempre visível) + menu do usuário (escopo pessoal).
// Com 2+ orgs, o badge vira switcher — a troca é validada no servidor.

export function TenantBadge({ orgName, memberships, activeOrgId }: {
  orgName: string; memberships: OrgMembership[]; activeOrgId: string;
}) {
  const [pending, start] = useTransition();
  const multi = memberships.length > 1;

  if (!multi) {
    return (
      <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span className="truncate" title={orgName}>{orgName}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        aria-label={`Organização ativa: ${orgName}. Trocar organização`}
        disabled={pending}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span className="truncate">{orgName}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Trocar organização</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.orgId}
            onSelect={() => {
              if (m.orgId === activeOrgId) return;
              start(async () => {
                try {
                  await switchOrg(m.orgId);
                  toast.success(`Agora você está em "${m.orgName}"`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao trocar de organização");
                }
              });
            }}
          >
            <span className="flex-1 truncate">{m.orgName}</span>
            <span className="text-[10px] text-slate-400">{roleLabel[m.role]}</span>
            {m.orgId === activeOrgId && <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ email, role, orgName, isTenantAdmin }: { email: string; role: MemberRole; orgName: string; isTenantAdmin?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        aria-label="Menu do usuário"
      >
        <UserRound className="h-4 w-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>
          <div className="truncate font-medium text-slate-700">{email}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge variant="brand">{roleLabel[role]}</Badge>
            <span className="truncate text-[11px] text-slate-400">em {orgName}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isTenantAdmin && (
          <>
            <DropdownMenuItem asChild>
              <a href="/app/org"><Settings2 className="h-4 w-4" aria-hidden /> Organização e membros</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/app/auditoria"><ListChecks className="h-4 w-4" aria-hidden /> Auditoria de agentes</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <form action={logout}>
          <button type="submit" className="w-full">
            <DropdownMenuItem className="text-rose-600 data-[highlighted]:bg-rose-50">
              <LogOut className="h-4 w-4" aria-hidden /> Sair da conta
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
