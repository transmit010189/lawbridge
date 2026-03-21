"use client";

export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 shrink-0 rounded-full bg-slate-100" />
        <div className="flex-1 space-y-3">
          <div className="h-5 w-2/3 rounded-lg bg-slate-100" />
          <div className="h-4 w-1/3 rounded-lg bg-slate-100" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="h-4 w-full rounded-lg bg-slate-100" />
        <div className="h-4 w-5/6 rounded-lg bg-slate-100" />
      </div>
      <div className="mt-5 flex gap-2">
        <div className="h-7 w-16 rounded-full bg-slate-100" />
        <div className="h-7 w-20 rounded-full bg-slate-100" />
        <div className="h-7 w-14 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="animate-pulse flex items-center justify-between rounded-[1.2rem] bg-slate-50 px-4 py-3">
      <div className="space-y-2">
        <div className="h-4 w-24 rounded-lg bg-slate-100" />
        <div className="h-3 w-32 rounded-lg bg-slate-100" />
      </div>
      <div className="h-4 w-16 rounded-lg bg-slate-100" />
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonStatCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-100" />
            <div className="h-4 w-20 rounded-lg bg-slate-100" />
          </div>
          <div className="mt-3 h-7 w-24 rounded-lg bg-slate-100" />
          <div className="mt-2 h-3 w-32 rounded-lg bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
