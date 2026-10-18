import clsx from 'clsx';

/** Shimmer block. `motion-reduce` keeps it static. Hidden from assistive tech; pair with a status. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx('block animate-pulse rounded bg-gray-200 motion-reduce:animate-none', className)} />;
}

/** Announces loading once for the whole skeleton region. */
function Loading({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={className}>
      {children}
    </div>
  );
}

const WIDTHS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5', 'w-1/3'];

export function ListSkeleton({ rows = 8, label = 'Loading tasks' }: { rows?: number; label?: string }) {
  return (
    <Loading label={label} className="px-6 py-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-gray-100 py-2.5">
          <Skeleton className="h-[18px] w-[18px] rounded-full" />
          <Skeleton className={clsx('h-3.5', WIDTHS[i % WIDTHS.length])} />
          <span className="flex-1" />
          <Skeleton className="hidden h-5 w-5 rounded-full md:block" />
          <Skeleton className="hidden h-3.5 w-16 md:block" />
        </div>
      ))}
    </Loading>
  );
}

export function BoardSkeleton() {
  return (
    <Loading label="Loading board" className="flex gap-3 p-4">
      {[4, 3, 2].map((n, c) => (
        <div key={c} className="w-72 shrink-0 space-y-2 rounded-xl bg-gray-100/70 p-2">
          <Skeleton className="m-1 h-4 w-24" />
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
              <Skeleton className={clsx('h-3.5', WIDTHS[(i + c) % WIDTHS.length])} />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ))}
    </Loading>
  );
}

export function DashboardSkeleton() {
  return (
    <Loading label="Loading dashboard" className="space-y-4 p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-gray-200 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>
        ))}
      </div>
    </Loading>
  );
}
