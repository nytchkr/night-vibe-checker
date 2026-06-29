import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] px-4 pb-24 pt-5 text-white" role="status" aria-label="Loading...">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <Skeleton className="h-9 w-56 rounded-[8px] bg-white/10" />
          <Skeleton className="h-4 w-36 rounded-[8px] bg-white/10" />
        </header>

        <section className="grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-[8px] border border-white/[0.08] bg-[#14141A] p-3">
              <Skeleton className="h-16 w-16 shrink-0 rounded-[8px] bg-white/10" />
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-4 w-2/3 rounded-[8px] bg-white/10" />
                <Skeleton className="h-3 w-24 rounded-[8px] bg-white/10" />
                <Skeleton className="h-7 w-20 rounded-full bg-white/10" />
              </div>
              <Skeleton className="h-10 w-10 shrink-0 rounded-[8px] bg-white/10" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
