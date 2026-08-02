import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badge / eyebrow do site público.
//  - accent: "Mais popular" (pill, fundo text.inverse a 12%)
//  - eyebrow: rótulo de seção (uppercase, tracking 0.12em, text.inverse)
//  - info: badge informativo (text.tertiary)

const siteBadgeVariants = cva(
  "inline-flex items-center gap-s7 font-borna font-medium uppercase",
  {
    variants: {
      variant: {
        accent: "rounded-site-step7 bg-site-text-inverse/[0.12] px-3 py-1 text-site-xs text-site-text-inverse",
        eyebrow: "text-site-xs text-site-text-inverse",
        info: "rounded-site-step7 bg-site-text-tertiary/20 px-3 py-1 text-site-xs text-site-text-primary",
      },
    },
    defaultVariants: { variant: "eyebrow" },
  },
);

export type SiteBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof siteBadgeVariants>;

export function SiteBadge({ className, variant, ...props }: SiteBadgeProps) {
  return <span className={cn(siteBadgeVariants({ variant }), className)} {...props} />;
}

export { siteBadgeVariants };
