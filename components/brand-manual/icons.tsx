// Ícones de linha do manual de marca — seção 05. Grade 24×24, traço 1,5px,
// cantos arredondados, cor única via `currentColor` (mesma convenção de
// components/site/social-icons.tsx). Copiados 1:1 dos paths de referência.

type IconProps = { className?: string };

const base = "h-10 w-10";
const strokeProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function StrategyGlyph({ className = base }: IconProps) {
  return (
    <svg {...strokeProps} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function PresenceGlyph({ className = base }: IconProps) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M4 14 Q8 10 12 14 Q16 18 20 14" />
      <path d="M4 8 Q8 4 12 8 Q16 12 20 8" />
    </svg>
  );
}

export function VoiceGlyph({ className = base }: IconProps) {
  return (
    <svg {...strokeProps} className={className}>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M6 11 Q6 17 12 17 Q18 17 18 11" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

export function ReputationGlyph({ className = base }: IconProps) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M12 3 L5 6 V12 Q5 18 12 21 Q19 18 19 12 V6 Z" />
      <path d="M9 12 l2 2 4 -4" />
    </svg>
  );
}

export function RecurrenceGlyph({ className = base }: IconProps) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M20 12 A8 8 0 1 1 12 4" />
      <path d="M20 4 v5 h-5" />
    </svg>
  );
}

export function InCompanyGlyph({ className = base }: IconProps) {
  return (
    <svg {...strokeProps} className={className}>
      <path d="M4 20 V8 l7 -4 v16" />
      <path d="M11 20 V11 l8 -3 v12" />
      <line x1="3" y1="20" x2="21" y2="20" />
      <line x1="7" y1="9" x2="7" y2="9.5" />
      <line x1="7" y1="13" x2="7" y2="13.5" />
    </svg>
  );
}

export const BRAND_ICON_SET = [
  { Icon: StrategyGlyph, label: "Estratégia" },
  { Icon: PresenceGlyph, label: "Presença" },
  { Icon: VoiceGlyph, label: "Voz" },
  { Icon: ReputationGlyph, label: "Reputação" },
  { Icon: RecurrenceGlyph, label: "Recorrência" },
  { Icon: InCompanyGlyph, label: "In company" },
] as const;
