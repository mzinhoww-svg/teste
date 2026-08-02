import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="h-[57px] border-b border-slate-200 bg-white" />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <Skeleton className="mb-2 h-6 w-48" />
        <Skeleton className="mb-6 h-4 w-80" />
        <div className="space-y-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </main>
    </div>
  );
}
