"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Badge } from "./badge";

// Confirmação para ações sensíveis/destrutivas.
// Regra multi-tenant: sempre nomeia O QUE será afetado e EM QUAL organização.

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** nome explícito do registro afetado (ex.: nome da automação, referência do contrato) */
  itemName: string;
  /** nome da organização (tenant) afetada — exibido sempre */
  scopeName?: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open, onOpenChange, title, itemName, scopeName, description,
  confirmLabel = "Confirmar", destructive = false, loading, onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${destructive ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}>
            <TriangleAlert className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1">
              {description ?? "Esta ação não pode ser desfeita."}
            </DialogDescription>
            <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="truncate font-medium text-slate-800">{itemName}</div>
              {scopeName && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  Afeta a organização <Badge variant="brand">{scopeName}</Badge>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
