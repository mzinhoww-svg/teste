"use client";

import { useState, useTransition } from "react";
import { Bot, ExternalLink, Play, X } from "lucide-react";
import { toast } from "sonner";
import { markNotificationRead } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AGENT_LABEL_BY_KIND } from "@/lib/agent-suggest";

export interface NotificationVM {
  id: string; type: string; title: string; body: string;
  action_url: string | null; deal_id: string | null; read_at: string | null;
  created_at: string; metadata: any;
}

const typeLabel: Record<string, string> = {
  cadence: "Cadência", deal_won: "Ganho", deal_lost: "Perdido", deal_stage: "Funil",
  invite_created: "Convite", member_joined: "Membro", contract: "Contrato",
  contract_signed: "Assinatura", agent_error: "Agente", info: "Info",
  agent_suggestion: "Sugestão", lead_incomplete: "Lead",
};

async function runAgent(dealId: string, kind: string) {
  const res = await fetch("/api/agents/run", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ dealId, kind }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`);
  return body;
}

// Item da central: além de exibir o alerta, sugere e EXECUTA o agente recomendado.
export function NotificationItem({ n }: { n: NotificationVM }) {
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const agentKind: string | undefined = n.metadata?.agent_key;
  const reason: string | undefined = n.metadata?.reason;

  if (hidden) return null;

  function execute() {
    if (!n.deal_id || !agentKind) return;
    start(async () => {
      try {
        await runAgent(n.deal_id!, agentKind!);
        setResult(`${AGENT_LABEL_BY_KIND[agentKind!] ?? agentKind} executado — veja o resultado no lead.`);
        toast.success("Agente executado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao executar agente");
      }
    });
  }

  function dismiss() {
    setHidden(true);
    start(async () => { try { await markNotificationRead(n.id); } catch { setHidden(false); } });
  }

  return (
    <div className={`border-b border-slate-50 px-4 py-3 last:border-0 dark:border-slate-800 ${n.read_at ? "" : "bg-brand-50/40 dark:bg-brand-950/20"}`}>
      <div className="flex items-start gap-3">
        {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />}
        <div className={`min-w-0 flex-1 ${n.read_at ? "pl-5" : ""}`}>
          <div className="flex items-center gap-2">
            <Badge variant="muted" className="text-[10px]">{typeLabel[n.type] ?? n.type}</Badge>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{n.title}</span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>

          {agentKind && (
            <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 p-2.5 dark:border-brand-900 dark:bg-brand-950/30">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                <Bot className="h-3.5 w-3.5" aria-hidden /> Agente recomendado: {AGENT_LABEL_BY_KIND[agentKind] ?? agentKind}
              </div>
              {reason && <p className="mt-0.5 text-[11px] text-slate-500">{reason}</p>}
              {result ? (
                <p className="mt-2 text-[11px] text-emerald-600">{result}</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {n.deal_id && <Button size="xs" loading={pending} onClick={execute}><Play className="h-3 w-3" aria-hidden /> Executar agora</Button>}
                  {n.deal_id && <a href={`/app?deal=${n.deal_id}`} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700"><ExternalLink className="h-3 w-3" aria-hidden /> Abrir lead</a>}
                  <button onClick={dismiss} className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-400 hover:text-slate-600"><X className="h-3 w-3" aria-hidden /> Ignorar</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] text-slate-400">{String(n.created_at).slice(0, 16).replace("T", " ")}</span>
          {n.action_url && !agentKind && <a href={n.action_url} className="text-[11px] text-brand-600 hover:underline">abrir</a>}
        </div>
      </div>
    </div>
  );
}
