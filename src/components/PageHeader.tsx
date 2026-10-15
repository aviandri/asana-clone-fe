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

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="text-base font-medium text-gray-800">{title}</h2>
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
