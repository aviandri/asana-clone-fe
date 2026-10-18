import type { ReactNode } from 'react';
import { AppIcon, MekariLockup } from '@/components/brand/Brand';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-primary-50 via-white to-info-soft px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <AppIcon className="h-12 w-12 drop-shadow-sm" />
          <MekariLockup />
          <h1 className="text-center text-2xl font-semibold text-gray-900">{title}</h1>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
