"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  archivePipeline, createPipeline, deleteStage, moveStagePosition, renamePipeline, saveStage,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";

export interface StageRow {
  id: string; name: string; position: number; accent: string;
  sla_days: number | null; probability: number | null; is_won: boolean; is_lost: boolean;
  dealCount: number;
}
export interface PipelineRow { id: string; name: string; archived: boolean; stages: StageRow[] }

function StageEditorDialog({ open, onOpenChange, pipelineId, stage, pending, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; pipelineId: string;
  stage: StageRow | null; pending: boolean;
  onSave: (stageId: string | null, pipelineId: string, fd: FormData) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{stage ? `Editar estágio "${stage.name}"` : "Novo estágio"}</DialogTitle>
        <form action={(fd) => onSave(stage?.id ?? null, pipelineId, fd)} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="st-name">Nome*</Label>
              <Input id="st-name" name="name" required defaultValue={stage?.name ?? ""} />
            </div>
            <div>
              <Label htmlFor="st-accent">Cor</Label>
              <div className="flex items-center gap-2">
                <input id="st-accent" name="accent" type="color" defaultValue={stage?.accent ?? "#6366f1"}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="st-sla">SLA (dias, vazio = sem SLA)</Label>
              <Input id="st-sla" name="slaDays" type="number" min="0" defaultValue={stage?.sla_days ?? ""} />
            </div>
            <div>
              <Label htmlFor="st-prob">Probabilidade (%)</Label>
              <Input id="st-prob" name="probability" type="number" min="0" max="100" defaultValue={stage?.probability ?? ""} />
            </div>
            <div>
              <Label htmlFor="st-type">Tipo</Label>
              <Select id="st-type" name="stageType" defaultValue={stage?.is_won ? "won" : stage?.is_lost ? "lost" : "normal"}>
                <option value="normal">Intermediário</option>
                <option value="won">Terminal — ganho</option>
                <option value="lost">Terminal — perdido</option>
              </Select>
            </div>
          </div>
          <Button type="submit" loading={pending} className="w-full">{stage ? "Salvar estágio" : "Criar estágio"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PipelineManager({ pipelines, orgName }: { pipelines: PipelineRow[]; orgName: string }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ pipelineId: string; stage: StageRow | null } | null>(null);
  const [toDelete, setToDelete] = useState<{ pipelineId: string; stage: StageRow } | null>(null);
  const [migrateTo, setMigrateTo] = useState<string>("");
  const [newName, setNewName] = useState("");

  function onSaveStage(stageId: string | null, pipelineId: string, fd: FormData) {
    const type = String(fd.get("stageType") ?? "normal");
    start(async () => {
      try {
        await saveStage(stageId, pipelineId, {
          name: String(fd.get("name") ?? ""),
          accent: String(fd.get("accent") ?? "#6366f1"),
          slaDays: fd.get("slaDays") ? Number(fd.get("slaDays")) : null,
          probability: fd.get("probability") ? Number(fd.get("probability")) : null,
          isWon: type === "won",
          isLost: type === "lost",
        });
        setEditing(null);
        toast.success(stageId ? "Estágio atualizado" : "Estágio criado");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar estágio"); }
    });
  }

  return (
    <div className="space-y-6">
      <form
        action={(fd) => start(async () => {
          try { await createPipeline(String(fd.get("name") ?? "")); setNewName(""); toast.success("Funil criado"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao criar funil"); }
        })}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[240px] flex-1 sm:max-w-xs">
          <Label htmlFor="np-name">Novo funil</Label>
          <Input id="np-name" name="name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex.: Produção e Entrega" />
        </div>
        <Button type="submit" loading={pending} disabled={!newName.trim()}><Plus className="h-4 w-4" aria-hidden /> Criar funil</Button>
      </form>

      {pipelines.map((p) => (
        <Card key={p.id} className={p.archived ? "opacity-60" : undefined}>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
              {p.archived && <Badge variant="muted">arquivado</Badge>}
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="xs" onClick={() => {
                const name = prompt("Novo nome do funil:", p.name);
                if (name && name.trim() && name !== p.name) {
                  start(async () => {
                    try { await renamePipeline(p.id, name); toast.success("Funil renomeado"); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
                  });
                }
              }}><Pencil className="h-3 w-3" aria-hidden /> Renomear</Button>
              <Button variant="outline" size="xs" onClick={() => start(async () => {
                try { await archivePipeline(p.id, !p.archived); toast.success(p.archived ? "Funil reativado" : "Funil arquivado"); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
              })}>{p.archived ? "Reativar" : "Arquivar"}</Button>
              <Button size="xs" onClick={() => setEditing({ pipelineId: p.id, stage: null })}>
                <Plus className="h-3 w-3" aria-hidden /> Estágio
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <ul className="divide-y divide-slate-50">
              {p.stages.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.accent }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{s.name}</span>
                  {s.is_won && <Badge variant="success">ganho</Badge>}
                  {s.is_lost && <Badge variant="muted">perdido</Badge>}
                  {s.sla_days != null && <Badge variant="outline">SLA {s.sla_days}d</Badge>}
                  {s.probability != null && <Badge variant="outline">{s.probability}%</Badge>}
                  <Badge variant="muted">{s.dealCount} deal(s)</Badge>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={i === 0}
                      onClick={() => start(() => moveStagePosition(s.id, "up"))}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Descer" disabled={i === p.stages.length - 1}
                      onClick={() => start(() => moveStagePosition(s.id, "down"))}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar ${s.name}`}
                      onClick={() => setEditing({ pipelineId: p.id, stage: s })}><Pencil className="h-3.5 w-3.5" aria-hidden /></Button>
                    <Button variant="destructive-ghost" size="xs" onClick={() => { setToDelete({ pipelineId: p.id, stage: s }); setMigrateTo(""); }}>
                      remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {editing && (
        <StageEditorDialog
          open onOpenChange={(o) => !o && setEditing(null)}
          pipelineId={editing.pipelineId} stage={editing.stage}
          pending={pending} onSave={onSaveStage}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Remover estágio?"
        itemName={toDelete ? `${toDelete.stage.name} (${toDelete.stage.dealCount} deal(s))` : ""}
        scopeName={orgName}
        description={
          toDelete && toDelete.stage.dealCount > 0
            ? "Este estágio tem deals ativos — eles serão movidos para o estágio escolhido abaixo antes da remoção."
            : "O estágio será removido do funil."
        }
        confirmLabel="Remover estágio"
        destructive
        loading={pending}
        onConfirm={() => {
          if (!toDelete) return;
          if (toDelete.stage.dealCount > 0 && !migrateTo) {
            toast.error("Escolha o estágio de destino para os deals");
            return;
          }
          start(async () => {
            try { await deleteStage(toDelete.stage.id, migrateTo || undefined); toast.success("Estágio removido"); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao remover"); }
            finally { setToDelete(null); }
          });
        }}
      />
      {toDelete && toDelete.stage.dealCount > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[60] w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <Label htmlFor="migrate-to">Mover os {toDelete.stage.dealCount} deal(s) para…</Label>
          <Select id="migrate-to" value={migrateTo} onChange={(e) => setMigrateTo(e.target.value)}>
            <option value="">Selecione o destino</option>
            {pipelines.find((p) => p.id === toDelete.pipelineId)?.stages
              .filter((s) => s.id !== toDelete.stage.id)
              .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      )}
    </div>
  );
}
