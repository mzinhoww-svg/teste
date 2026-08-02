"use client";

import { useState, useTransition } from "react";
import { Copy, MessageCircle, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  cancelInvite, createInvite, removeMemberAction, renameOrg, setMemberRole, updateOrgBrand,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inviteMessage, waShareLink } from "@/lib/whatsapp";

export interface MemberRow { user_id: string; email: string; role: string; joined_at: string }
export interface InviteRow { id: string; email: string; member_role: string; token: string; status: string; expires_at: string }

const roleLabel: Record<string, string> = { owner: "proprietário", admin: "admin", member: "membro" };

export function OrgManager({ orgName, orgBrand, members, invites, meId, myRole, baseUrl }: {
  orgName: string;
  orgBrand: { primary?: string; accent?: string; logoUrl?: string };
  members: MemberRow[];
  invites: InviteRow[];
  meId: string;
  myRole: string;
  baseUrl: string;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(orgName);
  const [confirmRename, setConfirmRename] = useState(false);
  const [primary, setPrimary] = useState(orgBrand.primary ?? "#4f46e5");
  const [accent, setAccent] = useState(orgBrand.accent ?? "#C9A227");
  const [toRemove, setToRemove] = useState<MemberRow | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [lastInviteRole, setLastInviteRole] = useState("member");

  const inviteLink = (token: string) => `${baseUrl}/convite/${token}`;

  function copy(text: string, label = "Link copiado") {
    navigator.clipboard.writeText(text).then(() => toast.success(label)).catch(() => toast.error("Não foi possível copiar"));
  }

  function submitInvite(fd: FormData) {
    start(async () => {
      try {
        const token = await createInvite(fd);
        const link = inviteLink(token);
        setLastInviteLink(link);
        setLastInviteRole(String(fd.get("role") ?? "member"));
        copy(link, "Convite criado — link copiado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao criar convite");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Nome da organização */}
      <Card>
        <CardHeader><CardTitle>Nome da organização</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 pt-3">
          <div className="min-w-[240px] flex-1">
            <Label htmlFor="org-name">Nome exibido no header e nos contratos</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button disabled={name.trim() === orgName || !name.trim()} onClick={() => setConfirmRename(true)}>
            Renomear
          </Button>
        </CardContent>
      </Card>

      {/* Marca (white label) */}
      <Card>
        <CardHeader><CardTitle>Marca do tenant (white label)</CardTitle></CardHeader>
        <CardContent className="pt-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="brand-primary">Cor primária</Label>
              <div className="flex items-center gap-2">
                <input id="brand-primary" type="color" value={primary} onChange={(e) => setPrimary(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
                <Input value={primary} onChange={(e) => setPrimary(e.target.value)} className="w-28 font-mono text-xs" />
              </div>
            </div>
            <div>
              <Label htmlFor="brand-accent">Cor de destaque</Label>
              <div className="flex items-center gap-2">
                <input id="brand-accent" type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
                <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="w-28 font-mono text-xs" />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: primary }}>
                {orgName.slice(0, 2).toUpperCase()}
              </span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
              <span className="text-xs text-slate-500">pré-visualização</span>
            </div>
            <Button loading={pending} onClick={() => start(async () => {
              try {
                await updateOrgBrand({ primary, accent });
                toast.success("Marca atualizada para toda a organização");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar marca"); }
            })}>
              Salvar marca
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Aplicada no logo do header e nos destaques do tenant. O tema global permanece como fallback para não
            comprometer contraste e acessibilidade.
          </p>
        </CardContent>
      </Card>

      {/* Membros */}
      <Card>
        <CardHeader><CardTitle>Membros ({members.length})</CardTitle></CardHeader>
        <CardContent className="pt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">E-mail</th>
                  <th className="py-2 pr-4">Papel</th>
                  <th className="py-2 pr-4">Desde</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-b border-slate-50">
                    <td className="py-2.5 pr-4 font-medium text-slate-700">
                      {m.email} {m.user_id === meId && <Badge variant="muted" className="ml-1 text-[10px]">você</Badge>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Select
                        value={m.role}
                        disabled={pending || m.user_id === meId || (myRole === "admin" && m.role === "owner")}
                        onChange={(e) => start(async () => {
                          try { await setMemberRole(m.user_id, e.target.value); toast.success("Papel atualizado"); }
                          catch (err) { toast.error(err instanceof Error ? err.message : "Falha"); }
                        })}
                        className="h-8 w-36 text-xs"
                        aria-label={`Papel de ${m.email}`}
                      >
                        <option value="owner">proprietário</option>
                        <option value="admin">admin</option>
                        <option value="member">membro</option>
                      </Select>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-400">{String(m.joined_at).slice(0, 10)}</td>
                    <td className="py-2.5 text-right">
                      {m.user_id !== meId && (
                        <Button variant="destructive-ghost" size="xs" onClick={() => setToRemove(m)}>remover</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Convites */}
      <Card>
        <CardHeader><CardTitle>Convidar pessoas</CardTitle></CardHeader>
        <CardContent className="space-y-4 pt-3">
          <form action={submitInvite} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="inv-email">E-mail do convidado</Label>
              <Input id="inv-email" name="email" type="email" required placeholder="pessoa@empresa.com" />
            </div>
            <div>
              <Label htmlFor="inv-role">Papel</Label>
              <Select id="inv-role" name="role" defaultValue="member" className="w-36">
                <option value="member">membro</option>
                <option value="admin">admin</option>
              </Select>
            </div>
            <Button type="submit" loading={pending}><UserPlus className="h-4 w-4" aria-hidden /> Gerar convite</Button>
          </form>
          <p className="text-xs text-slate-400">
            O convite é enviado por <strong>e-mail</strong> (quando o Brevo está configurado) e também gera um
            <strong> link copiável</strong> (expira em 7 dias) para enviar por onde quiser — inclusive pelo WhatsApp.
            A pessoa precisa entrar com o mesmo e-mail do convite.
          </p>

          {lastInviteLink && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm">
              <Send className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">{lastInviteLink}</code>
              <Button variant="outline" size="xs" onClick={() => copy(lastInviteLink)}>
                <Copy className="h-3 w-3" aria-hidden /> Copiar
              </Button>
              <a href={waShareLink(inviteMessage(orgName, lastInviteRole, lastInviteLink))} target="_blank" rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700">
                <MessageCircle className="h-3 w-3" aria-hidden /> Enviar pelo WhatsApp
              </a>
            </div>
          )}

          {invites.filter((i) => i.status === "pending").length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Convite pendente</th>
                    <th className="py-2 pr-4">Papel</th>
                    <th className="py-2 pr-4">Expira</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {invites.filter((i) => i.status === "pending").map((i) => (
                    <tr key={i.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-4 text-slate-700">{i.email}</td>
                      <td className="py-2.5 pr-4"><Badge>{roleLabel[i.member_role] ?? i.member_role}</Badge></td>
                      <td className="py-2.5 pr-4 text-xs text-slate-400">{String(i.expires_at).slice(0, 10)}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="xs" onClick={() => copy(inviteLink(i.token))}>
                            <Copy className="h-3 w-3" aria-hidden /> link
                          </Button>
                          <a href={waShareLink(inviteMessage(orgName, i.member_role, inviteLink(i.token)))} target="_blank" rel="noreferrer"
                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700">
                            <MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp
                          </a>
                          <Button variant="destructive-ghost" size="xs"
                            onClick={() => start(async () => {
                              try { await cancelInvite(i.id); toast.success("Convite cancelado"); }
                              catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
                            })}>
                            cancelar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmRename}
        onOpenChange={setConfirmRename}
        title="Renomear organização?"
        itemName={`"${orgName}" → "${name.trim()}"`}
        scopeName={orgName}
        description="O novo nome aparece no header, nos convites e nos contratos de todos os membros."
        confirmLabel="Renomear"
        loading={pending}
        onConfirm={() => start(async () => {
          try { await renameOrg(name); setConfirmRename(false); toast.success("Organização renomeada"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao renomear"); }
        })}
      />

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remover membro?"
        itemName={toRemove?.email ?? ""}
        scopeName={orgName}
        description="A pessoa perde imediatamente o acesso a todos os dados desta organização."
        confirmLabel="Remover"
        destructive
        loading={pending}
        onConfirm={() => {
          if (!toRemove) return;
          start(async () => {
            try { await removeMemberAction(toRemove.user_id); toast.success("Membro removido"); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao remover"); }
            finally { setToRemove(null); }
          });
        }}
      />
    </div>
  );
}
