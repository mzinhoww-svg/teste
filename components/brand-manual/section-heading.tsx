import * as React from "react";
import { cn } from "@/lib/utils";

// Cabeçalho repetido em todas as seções 01–08: kicker numerado + fio fino +
// label à direita, depois H2 grande em serifa. `theme` troca as cores para o
// par navy/creme quando a seção tem fundo escuro (04 — Tipografia).

export type SectionTheme = "light" | "dark";

export function GoldWord({
  children,
  theme = "light",
}: {
  children: React.ReactNode;
  theme?: SectionTheme;
}) {
  return (
    <span className={cn("italic", theme === "dark" ? "text-manual-ouro-claro" : "text-manual-ouro")}>
      {children}
    </span>
  );
}

export function SectionHeading({
  kicker,
  eyebrow,
  title,
  theme = "light",
  titleClassName,
}: {
  kicker: string;
  eyebrow: string;
  title: React.ReactNode;
  theme?: SectionTheme;
  titleClassName?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-[18px]">
        <span
          className={cn(
            "font-manual-mono text-[11px] font-medium uppercase tracking-[0.2em]",
            theme === "dark" ? "text-manual-ouro-claro" : "text-manual-ouro",
          )}
        >
          {kicker}
        </span>
        <span className={cn("h-px flex-1", theme === "dark" ? "bg-manual-ouro/35" : "bg-manual-ouro-palido")} />
        <span className="whitespace-nowrap font-manual-mono text-[10px] tracking-[0.14em] text-manual-claro">
          {eyebrow}
        </span>
      </div>
      <h2
        className={cn(
          "font-manual-serif text-[clamp(40px,6vw,72px)] font-light leading-[1.02] tracking-[-0.01em]",
          theme === "dark" ? "text-manual-creme" : "text-manual-navy",
          "mb-14 max-w-[16ch]",
          titleClassName,
        )}
      >
        {title}
      </h2>
    </div>
  );
}
