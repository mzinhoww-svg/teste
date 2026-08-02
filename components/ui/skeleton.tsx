import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-slate-200/70 motion-reduce:animate-none", className)}
      aria-hidden
      {...props}
    />
  );
}

export { Skeleton };
