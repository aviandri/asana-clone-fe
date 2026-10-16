import clsx from 'clsx';
import type { GoalStatus } from '@/api/types';
import { GOAL_STATUS } from '@/lib/goals';

// Status is always conveyed by text + a shape glyph, never colour alone (colour-blind safe).
const TONE: Record<string, { cls: string; glyph: string }> = {
  neutral: { cls: 'bg-gray-100 text-gray-700', glyph: '○' },
  good: { cls: 'bg-emerald-100 text-emerald-900', glyph: '●' },
  warn: { cls: 'bg-amber-100 text-amber-900', glyph: '▲' },
  bad: { cls: 'bg-rose-100 text-rose-900', glyph: '■' },
  done: { cls: 'bg-blue-100 text-blue-900', glyph: '✓' },
};

export function StatusPill({ status, className }: { status: GoalStatus; className?: string }) {
  const s = GOAL_STATUS[status];
  const t = TONE[s.tone];
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', t.cls, className)}>
      <span aria-hidden>{t.glyph}</span>
      {s.label}
    </span>
  );
}

export function ProgressBar({ value, label, className, size = 'sm' }: { value: number; label: string; className?: string; size?: 'sm' | 'lg' }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 10) / 10}
        className={clsx('flex-1 overflow-hidden rounded-full bg-gray-200', size === 'lg' ? 'h-2.5' : 'h-1.5')}
      >
        <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${v}%` }} />
      </div>
      <span className={clsx('shrink-0 tabular-nums text-gray-700', size === 'lg' ? 'w-14 text-sm font-semibold' : 'w-11 text-xs')}>
        {Math.round(v)}%
      </span>
    </div>
  );
}
