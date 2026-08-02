import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        brand: "bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300",
        success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        warning: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
        danger: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
        outline: "border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:text-slate-300",
        muted: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
