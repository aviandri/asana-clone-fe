import clsx from 'clsx';
import type { WorkspaceRef } from '@/api/types';

/** Black or white initials, whichever reads better on the tile colour (WCAG relative luminance). */
function inkFor(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return '#ffffff';
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast vs white = 1.05/(L+.05); vs black = (L+.05)/.05 — pick the larger.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#1a1d23';
}

const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

/** Slack-style square tile with the workspace's initial. Decorative: callers label the control. */
export function WorkspaceTile({
  workspace,
  size = 'md',
  className,
}: {
  workspace: Pick<WorkspaceRef, 'name' | 'color'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold',
        size === 'sm' && 'h-6 w-6 rounded-md text-xs',
        size === 'md' && 'h-8 w-8 rounded-lg text-sm',
        size === 'lg' && 'h-10 w-10 rounded-xl text-base',
        className,
      )}
      style={{
        backgroundColor: workspace.color,
        color: inkFor(workspace.color),
      }}
    >
      {initialOf(workspace.name)}
    </span>
  );
}
