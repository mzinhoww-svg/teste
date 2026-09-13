"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SiteBadge } from "../badge";
import type { Service } from "@/lib/site/content";

// Seção "O que fazemos" — as frentes do estúdio, uma aba cada.
//
// É o padrão TABS da APG, não uma lista de links: só um painel existe no DOM
// por vez, a seleção acompanha o foco (ativação automática) e as setas do
// teclado andam pela lista. Por isso o `tabIndex` é rotativo — a lista inteira
// ocupa UMA parada de Tab, e não seis.
//
// Layout: no mobile a lista vira uma fila rolável de chips acima do painel
// (empilhar seis itens altos jogaria o conteúdo para fora da tela); a partir
// de `lg` vira a coluna vertical à esquerda. Mesmo DOM nos dois casos.

const NUMERAIS = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];

/** "seis frentes" lê melhor que "6 frentes" em texto corrido. */
function porExtenso(n: number): string {
  return NUMERAIS[n] ?? String(n);
}

export function ServicesSection({ services }: { services: Service[] }) {
  const [active, setActive] = React.useState(0);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  if (services.length === 0) return null;

  // Uma lista encurtada pelo CMS não pode deixar o índice apontando pro vazio.
  const index = Math.min(active, services.length - 1);
  const current = services[index];

  function onKeyDown(event: React.KeyboardEvent) {
    const last = services.length - 1;
    let next: number | null = null;

    // Aceita os dois eixos: a lista é horizontal no mobile e vertical no
    // desktop, e o mesmo componente atende os dois.
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;

    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="o-que-fazemos" className="bg-site-surface-base px-6 py-24" aria-labelledby="servicos-title">
      <div className="mx-auto max-w-6xl">
        <SiteBadge>O que fazemos</SiteBadge>
        <h2 id="servicos-title" className="mt-4 max-w-[640px] text-site-h2 font-medium text-site-text-primary">
          Diga o que você precisa gravar.
        </h2>
        <p className="mt-3 max-w-[520px] text-site-base text-site-text-primary/70">
          Podcast é onde começamos. Hoje são {porExtenso(services.length)} frentes para marcas
          de qualquer setor — escolha a sua.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-[2fr_3fr] lg:items-stretch">
          <div
            role="tablist"
            aria-label="Frentes de produção do estúdio"
            onKeyDown={onKeyDown}
            className={cn(
              "flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0",
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            {services.map((service, i) => (
              <ServiceTab
                key={service.id}
                ref={(el) => { tabRefs.current[i] = el; }}
                service={service}
                position={i + 1}
                selected={i === index}
                onSelect={() => setActive(i)}
              />
            ))}
          </div>

          <ServicePanel service={current} />
        </div>
      </div>
    </section>
  );
}

const ServiceTab = React.forwardRef<
  HTMLButtonElement,
  { service: Service; position: number; selected: boolean; onSelect: () => void }
>(function ServiceTab({ service, position, selected, onSelect }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`servico-tab-${service.id}`}
      aria-selected={selected}
      aria-controls={`servico-painel-${service.id}`}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "flex shrink-0 items-center gap-4 rounded-site-lg border px-5 py-4 text-left",
        "min-h-[44px] transition-colors duration-fast",
        selected
          ? "border-site-text-inverse bg-site-surface-raised"
          : "border-site-border-muted/[0.08] hover:border-site-border-muted/25",
        "lg:w-full lg:justify-between",
      )}
    >
      <span className="flex items-center gap-4">
        <span
          aria-hidden="true"
          // Mesmo corpo do rótulo: a escala do design system para em 17.5px
          // antes dos tamanhos de display, e um numeral display aqui brigaria
          // com o h2 da seção. Quem marca a seleção é a borda, não o tamanho.
          className={cn(
            "font-borna text-site-base tabular-nums",
            selected ? "text-site-text-inverse" : "text-site-text-primary/30",
          )}
        >
          {String(position).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "text-site-base font-medium",
            selected ? "text-site-text-primary" : "text-site-text-primary/70",
          )}
        >
          {service.title}
        </span>
      </span>
      {service.badge && <SiteBadge variant="accent" className="shrink-0">{service.badge}</SiteBadge>}
    </button>
  );
});

function ServicePanel({ service }: { service: Service }) {
  return (
    <div
      role="tabpanel"
      id={`servico-painel-${service.id}`}
      aria-labelledby={`servico-tab-${service.id}`}
      tabIndex={0}
      className="rounded-site-lg border border-site-border-muted/[0.08] bg-site-surface-raised/40 p-6 sm:p-8"
    >
      <h3 className="text-site-h2 font-medium text-site-text-primary">{service.title}</h3>
      {service.description && (
        <p className="mt-3 text-site-base text-site-text-primary/70">{service.description}</p>
      )}

      <ServiceMedia service={service} />

      {service.footnote && (
        <p className="mt-6 text-site-base text-site-text-primary/70">
          <Emphasized text={service.footnote} />
        </p>
      )}
    </div>
  );
}

/**
 * Vídeo OU até três imagens. Sem mídia o bloco não existe — a aba continua
 * completa com título, descrição e fecho, em vez de reservar uma moldura
 * vazia esperando arquivo.
 */
function ServiceMedia({ service }: { service: Service }) {
  if (service.videoUrl) {
    return (
      // `key` força o React a trocar o elemento em vez de reaproveitá-lo: sem
      // isso o player mantém o frame do vídeo anterior ao mudar de aba.
      <video
        key={service.videoUrl}
        src={service.videoUrl}
        poster={service.posterUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="mt-8 aspect-video w-full rounded-site-md border border-site-border-muted/[0.06] bg-site-surface-base object-cover"
      >
        <track kind="captions" />
      </video>
    );
  }

  if (service.images.length === 0) return null;

  return (
    <ul className={cn("mt-8 grid gap-3", service.images.length > 1 && "grid-cols-2 sm:grid-cols-3")}>
      {service.images.map((src) => (
        <li key={src} className="aspect-[4/3] overflow-hidden rounded-site-md border border-site-border-muted/[0.06] bg-site-surface-base">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL vinda do CMS (host livre) */}
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Só `**negrito**`. O fecho é escrito no CMS por quem não edita código, e um
 * campo que aceitasse HTML seria injeção — então o parser é intencionalmente
 * burro e o resto do texto sai literal.
 */
function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((chunk, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-medium text-site-text-primary">{chunk}</strong>
        ) : (
          <React.Fragment key={i}>{chunk}</React.Fragment>
        ),
      )}
    </>
  );
}
