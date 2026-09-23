import * as React from "react";
import { cn } from "@/lib/utils";

// A grade "efeito tabela" repetida em várias seções: células com fundo sólido
// separadas por um fio de 1px, obtido com `gap-px` sobre um fundo ouro-pálido
// (o gap deixa a cor do container aparecer como borda entre as células).
// `className` define `grid-template-columns` — varia por seção.
export function TableGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("grid gap-px border border-manual-ouro-palido bg-manual-ouro-palido", className)}>{children}</div>;
}
