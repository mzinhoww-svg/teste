"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { importLeads } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { CreateLeadInput } from "@/app/actions";

// Parser CSV mínimo (vírgula, cabeçalho na 1ª linha). Colunas reconhecidas:
// name/nome, company/empresa, email, phone/telefone, amount/valor.
function parseCsv(text: string): Array<Partial<CreateLeadInput>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = idx(["name", "nome", "contato"]);
  const iCompany = idx(["company", "empresa", "organização", "organizacao"]);
  const iEmail = idx(["email", "e-mail"]);
  const iPhone = idx(["phone", "telefone", "whatsapp", "celular"]);
  const iAmount = idx(["amount", "valor"]);
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      name: iName >= 0 ? cols[iName] : cols[0],
      company: iCompany >= 0 ? cols[iCompany] : undefined,
      email: iEmail >= 0 ? cols[iEmail] : undefined,
      phone: iPhone >= 0 ? cols[iPhone] : undefined,
      amount: iAmount >= 0 ? Number(cols[iAmount]) || undefined : undefined,
    } as Partial<CreateLeadInput>;
  }).filter((r) => r.name);
}

export function CsvImport() {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [count, setCount] = useState<number | null>(null);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      if (!rows.length) { toast.error("CSV vazio ou sem coluna de nome"); return; }
      setCount(rows.length);
      start(async () => {
        try { const res = await importLeads(rows); toast.success(`${res.created} importados${res.failed ? `, ${res.failed} falharam` : ""}`); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Falha na importação"); }
      });
    };
    reader.readAsText(file);
  }

  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <Button size="sm" variant="outline" loading={pending} onClick={() => ref.current?.click()}>
        <Upload className="h-3.5 w-3.5" aria-hidden /> Importar CSV{count ? ` (${count})` : ""}
      </Button>
    </>
  );
}
