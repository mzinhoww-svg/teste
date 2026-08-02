import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Card do site público. Variantes: plan | testimonial | poster.
// Todo card interativo (`interactive`) tem hover E focus-visible — cards sem
// estado são anti-pattern no design system.

const siteCardVariants = cva("relative", {
  variants: {
    variant: {
      plan: "rounded-site-lg border border-site-border-muted/[0.08] bg-site-surface-base p-8 shadow-site-1",
      testimonial: "rounded-site-lg border border-site-border-muted/[0.06] bg-site-surface-base p-8 shadow-site-1",
      poster: "aspect-[2/3] overflow-hidden rounded-site-sm border border-site-border-muted/[0.06] bg-site-surface-raised",
      plain: "rounded-site-lg border border-site-border-muted/[0.06] bg-site-surface-raised p-6",
    },
    interactive: {
      true: [
        "transition-all duration-slow ease-out",
        "hover:-translate-y-1 hover:border-site-text-inverse/25 hover:shadow-site-3",
        "active:scale-[0.98]",
        "motion-reduce:hover:translate-y-0",
      ].join(" "),
      false: "",
    },
    featured: {
      true: "border-site-text-inverse/30",
      false: "",
    },
  },
  defaultVariants: { variant: "plain", interactive: false, featured: false },
});

export type SiteCardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof siteCardVariants>;

export const SiteCard = React.forwardRef<HTMLDivElement, SiteCardProps>(
  ({ className, variant, interactive, featured, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(siteCardVariants({ variant, interactive, featured }), className)}
      {...props}
    />
  ),
);
SiteCard.displayName = "SiteCard";

/** Placeholder padronizado quando não há conteúdo publicado ainda. */
export function SiteCardEmpty({ children = "Conteúdo em breve" }: { children?: React.ReactNode }) {
  return (
    <p className="py-12 text-center text-site-sm text-site-text-primary/55">{children}</p>
  );
}

export { siteCardVariants };
