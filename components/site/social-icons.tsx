// Ícones sociais em SVG inline (20px, currentColor).
// São glifos genéricos — câmera, cartão, play, ondas — e não reproduções das
// marcas; quem nomeia a rede é o `aria-label` do link. Evita depender de
// brand icons, que saíram do lucide-react.

type IconProps = { className?: string };

const base = "h-5 w-5";

export function CameraGlyph({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CardGlyph({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 10v7M7 7v.01M12 17v-4a2 2 0 0 1 4 0v4" strokeLinecap="round" />
    </svg>
  );
}

export function PlayGlyph({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WavesGlyph({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 9.5c3-1 6-.8 9 .7M8 13c2.4-.8 4.8-.6 7.2.6M8.5 16.2c1.8-.6 3.6-.4 5.4.5" strokeLinecap="round" />
    </svg>
  );
}
