import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Botão do site público (design system PodFactory).
//
// Estados cobertos: default, hover, focus-visible, active, disabled, loading e
// (via `size`) alvo de toque ≥44×44px. O foco vem do token global
// `.site-root :focus-visible` (outline 2px text.inverse, offset 2px) — não
// anulamos outline em lugar nenhum.

const siteButtonVariants = cva(
  [
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap",
    "font-borna font-medium leading-none",
    "transition-all duration-fast ease-out",
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-35 aria-disabled:pointer-events-none aria-disabled:opacity-35",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "rounded-site-md bg-site-text-inverse text-site-surface-base hover:brightness-110 hover:shadow-site-3",
        secondary:
          "rounded-site-md border border-site-border-muted/15 bg-transparent text-site-text-primary hover:border-site-text-inverse hover:text-site-text-inverse",
        ghost:
          "rounded-site-md bg-transparent text-site-text-primary hover:text-site-text-inverse",
        // `pill` usa o radius step7 — reservado a CTAs de destaque, nunca ao
        // botão padrão (ver anti-patterns em docs/site-design-system.md).
        pill:
          "rounded-site-step7 bg-site-text-inverse text-site-surface-base shadow-site-3 hover:scale-[1.02] hover:brightness-110",
        surface:
          "rounded-site-md bg-site-surface-strong text-site-text-primary hover:bg-site-text-inverse hover:text-site-surface-base",
      },
      size: {
        // min-h/min-w garantem o alvo de toque de 44px do critério de a11y.
        md: "min-h-[44px] min-w-[44px] px-6 py-3 text-site-base",
        sm: "min-h-[44px] min-w-[44px] px-4 py-s8 text-site-xl tracking-normal",
        lg: "min-h-[44px] min-w-[44px] px-8 py-3.5 text-site-base",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type SiteButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof siteButtonVariants> & { loading?: boolean };

export const SiteButton = React.forwardRef<HTMLButtonElement, SiteButtonProps>(
  ({ className, variant, size, block, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(siteButtonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      <span className={cn(loading && "opacity-50")}>{children}</span>
    </button>
  ),
);
SiteButton.displayName = "SiteButton";

export type SiteButtonLinkProps = React.ComponentPropsWithoutRef<typeof Link> &
  VariantProps<typeof siteButtonVariants>;

/** Mesma anatomia do botão, semântica de link (navegação, âncora). */
export const SiteButtonLink = React.forwardRef<HTMLAnchorElement, SiteButtonLinkProps>(
  ({ className, variant, size, block, children, ...props }, ref) => (
    <Link ref={ref} className={cn(siteButtonVariants({ variant, size, block }), className)} {...props}>
      {children}
    </Link>
  ),
);
SiteButtonLink.displayName = "SiteButtonLink";

export { siteButtonVariants };
