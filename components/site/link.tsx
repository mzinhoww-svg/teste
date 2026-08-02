import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Link do site público. Variantes:
//  - inline: cor text.tertiary, sublinha no hover (link de corpo de texto)
//  - nav:    cor text.primary, sublinhado animado (width 0→100%) no hover
//  - cta:    cor text.inverse, weight 500, seta opcional
// Links em lista têm alvo de toque ≥44px (`touch`).

const siteLinkVariants = cva(
  "font-borna transition-all duration-fast",
  {
    variants: {
      variant: {
        inline:
          "text-site-text-inverse underline underline-offset-4 decoration-site-text-inverse/40 visited:text-site-text-inverse/80 hover:brightness-110 hover:decoration-site-text-inverse",
        nav: [
          "relative inline-flex items-center text-site-text-primary hover:text-site-text-inverse",
          "after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-site-text-inverse",
          "after:transition-all after:duration-fast hover:after:w-full",
        ].join(" "),
        cta: "inline-flex items-center gap-2 font-medium text-site-text-inverse hover:brightness-110",
        muted: "text-site-text-primary/60 hover:text-site-text-inverse",
      },
      touch: { true: "min-h-[44px] items-center py-2", false: "" },
    },
    defaultVariants: { variant: "inline", touch: false },
  },
);

export type SiteLinkProps = React.ComponentPropsWithoutRef<typeof Link> &
  VariantProps<typeof siteLinkVariants>;

export const SiteLink = React.forwardRef<HTMLAnchorElement, SiteLinkProps>(
  ({ className, variant, touch, ...props }, ref) => (
    <Link ref={ref} className={cn(siteLinkVariants({ variant, touch }), className)} {...props} />
  ),
);
SiteLink.displayName = "SiteLink";

export { siteLinkVariants };
