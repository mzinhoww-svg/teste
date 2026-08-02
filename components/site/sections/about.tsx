import { Mic, Clock, Palette, Radio } from "lucide-react";
import { SiteBadge } from "../badge";

// Seção 5 — Sobre / diferenciais. Duas colunas no desktop, empilha no mobile.

const DIFFERENTIALS = [
  { icon: Mic, label: "Equipamento broadcast", desc: "Microfones, câmeras 4K e mesa de som de padrão profissional." },
  { icon: Clock, label: "Edição em 48h", desc: "Episódio, cortes e reel entregues em dois dias úteis." },
  { icon: Palette, label: "Identidade visual inclusa", desc: "Capa, vinheta e templates de corte no pacote." },
  { icon: Radio, label: "Distribuição em todas as plataformas", desc: "Spotify, YouTube, Apple Podcasts e feeds próprios." },
];

export function AboutSection() {
  return (
    <section id="sobre" className="bg-site-surface-base px-6 py-24" aria-labelledby="sobre-title">
      <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2">
        <div>
          <SiteBadge>Sobre</SiteBadge>
          <h2 id="sobre-title" className="mt-4 text-site-h2 font-medium text-site-text-primary">
            Por que a Reiners Media?
          </h2>

          <ul className="mt-10 flex flex-col gap-6">
            {DIFFERENTIALS.map((d) => (
              <li key={d.label} className="flex items-start gap-4">
                <d.icon className="mt-1 h-5 w-5 shrink-0 text-site-text-inverse" aria-hidden />
                <div>
                  <p className="text-site-base font-medium text-site-text-primary/80">{d.label}</p>
                  <p className="mt-1 text-site-sm text-site-text-primary/50">{d.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div
          aria-hidden="true"
          className="aspect-[4/3] overflow-hidden rounded-site-lg border border-site-border-muted/[0.06] bg-site-surface-raised bg-[radial-gradient(circle_at_70%_30%,rgb(var(--site-text-inverse)/0.16),transparent_60%)]"
        />
      </div>
    </section>
  );
}
