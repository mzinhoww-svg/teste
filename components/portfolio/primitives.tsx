import { initialsOf, STATUS_LABEL, type Host, type PodcastStatus, type SocialLinks } from "@/lib/portfolio/types";

// Primitivas visuais compartilhadas entre o grid, o painel expansível e a
// página dedicada do programa. Todas server-safe (sem estado).

/** Badge de status — accent 12% de fundo, borda accent 25%. */
export function StatusBadge({ status }: { status: PodcastStatus }) {
  return (
    <span className="inline-flex items-center rounded-pf-xs border border-pf-inverse/25 bg-pf-inverse/[0.12] px-2 py-1 text-pf-xs uppercase tracking-pf-meta text-pf-inverse">
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Linha de metadados: categoria · ano — Borna xs, uppercase, 50%. */
export function MetaLine({
  items,
  className = "",
}: {
  items: (string | number | null | undefined)[];
  className?: string;
}) {
  const parts = items.filter((v): v is string | number => v !== null && v !== undefined && v !== "");
  if (!parts.length) return null;
  return (
    <p className={`text-pf-xs uppercase tracking-pf-meta text-pf-primary/50 ${className}`}>
      {parts.join(" · ")}
    </p>
  );
}

/**
 * Avatar de host. Sem foto, cai nas iniciais sobre surface.strong — o formato
 * circular usa o raio step8.
 */
export function HostAvatar({ host, size = 36 }: { host: Host; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-pf-circle bg-pf-strong text-pf-xs font-medium text-pf-inverse"
    >
      {host.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={host.photo} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOf(host)
      )}
    </span>
  );
}

export function HostList({ hosts, compact = false }: { hosts: Host[]; compact?: boolean }) {
  if (!hosts.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {hosts.map((host) => (
        <li key={host.name} className="flex items-center gap-3">
          <HostAvatar host={host} size={compact ? 36 : 44} />
          <span className="min-w-0">
            <span
              className={`block truncate font-medium text-pf-primary ${compact ? "text-pf-sm" : "text-pf-base"}`}
            >
              {host.name}
            </span>
            {host.role ? (
              <span className="block truncate text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                {host.role}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Ícones textuais — a spec pede rótulos curtos em círculos de 34px.
const SOCIAL_ORDER: { key: keyof SocialLinks; short: string; label: string }[] = [
  { key: "instagram", short: "IG", label: "Instagram" },
  { key: "twitter", short: "X", label: "X (Twitter)" },
  { key: "linkedin", short: "in", label: "LinkedIn" },
  { key: "tiktok", short: "TT", label: "TikTok" },
  { key: "github", short: "GH", label: "GitHub" },
  { key: "website", short: "Web", label: "Site oficial" },
];

export function SocialRow({
  links,
  podcastTitle,
}: {
  links: SocialLinks;
  podcastTitle: string;
}) {
  const available = SOCIAL_ORDER.filter((s) => links[s.key]);
  if (!available.length) {
    return (
      <p className="text-pf-sm text-pf-primary/30">Sem redes cadastradas</p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {available.map((s) => (
        <li key={s.key}>
          <a
            href={links[s.key]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${s.label} de ${podcastTitle} (abre em nova aba)`}
            // 34px visuais, mas alvo de toque de 44px via padding transparente.
            className="grid h-11 w-11 place-items-center rounded-pf-circle text-pf-xs text-pf-primary transition-colors duration-pf-fast ease-pf"
          >
            <span className="grid h-[34px] w-[34px] place-items-center rounded-pf-circle border border-pf-muted/[0.08] bg-pf-strong transition-colors duration-pf-fast ease-pf hover:border-pf-inverse hover:bg-pf-inverse/15">
              {s.short}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Estado vazio padrão do módulo. */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-pf-sm text-pf-primary/30">{children}</p>;
}
