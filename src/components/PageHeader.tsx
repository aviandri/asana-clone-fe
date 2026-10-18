import type { ReactNode } from 'react';

export function PageHeader({ title, icon, actions, children }: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-gray-200 px-6 pt-4">
      <div className="flex items-center gap-3 pb-3">
        {icon}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-gray-900">{title}</h1>
        {actions}
      </div>
      {children}
    </header>
  );
}

type Illustration = 'tasks' | 'inbox' | 'goals' | 'search' | 'none';

/** Small, friendly spot illustration (brand tints + petals). Decorative only. */
function EmptyArt({ kind }: { kind: Exclude<Illustration, 'none'> }) {
  return (
    <svg viewBox="0 0 96 72" className="mb-3 h-[72px] w-24" aria-hidden focusable="false">
      <ellipse cx="48" cy="64" rx="30" ry="4" fill="rgb(var(--gray-200))" />
      <rect x="22" y="10" width="52" height="46" rx="12" fill="rgb(var(--primary-100))" />
      {kind === 'tasks' && (
        <g fill="rgb(var(--primary-500))">
          <rect x="32" y="21" width="22" height="5" rx="2.5" />
          <rect x="32" y="30.5" width="15" height="5" rx="2.5" />
          <rect x="32" y="40" width="9" height="5" rx="2.5" />
          <path d="M47 41.5l4 4 9-10" fill="none" stroke="rgb(var(--primary-500))" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {kind === 'inbox' && (
        <g fill="none" stroke="rgb(var(--primary-500))" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M33 26h30v20H33z" />
          <path d="M33 37h8l3 4h8l3-4h8" />
        </g>
      )}
      {kind === 'goals' && (
        <g fill="none" stroke="rgb(var(--primary-500))" strokeWidth="4">
          <circle cx="48" cy="33" r="13" />
          <circle cx="48" cy="33" r="5" fill="rgb(var(--primary-500))" stroke="none" />
        </g>
      )}
      {kind === 'search' && (
        <g fill="none" stroke="rgb(var(--primary-500))" strokeWidth="4.5" strokeLinecap="round">
          <circle cx="45" cy="30" r="9" />
          <path d="M52 37l7 7" />
        </g>
      )}
      {/* Mekari-flower petals */}
      <path d="M78 14c2 1.8 3.2 4.2 2.5 6.6-.5 1.8-1.5 2.8-2.5 3.3-1-.5-2-1.5-2.5-3.3C74.8 18.2 76 15.8 78 14Z" fill="rgb(var(--accent))" />
      <path d="M16 46c1.6 1.4 2.5 3.3 2 5.2-.4 1.4-1.2 2.2-2 2.6-.8-.4-1.6-1.2-2-2.6-.5-1.9.4-3.8 2-5.2Z" fill="rgb(var(--primary-300))" />
    </svg>
  );
}

export function EmptyState({ title, children, illustration = 'tasks' }: { title: string; children?: ReactNode; illustration?: Illustration }) {
  return (
    <div className="flex animate-rise-in flex-col items-center justify-center px-6 py-16 text-center">
      {illustration !== 'none' && <EmptyArt kind={illustration} />}
      <h2 className="text-base font-medium text-gray-900">{title}</h2>
      {children && <div className="mt-2 max-w-sm text-sm text-gray-500">{children}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </div>
  );
}
