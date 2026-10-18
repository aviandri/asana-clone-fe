import clsx from 'clsx';

/** Small "Guest" pill (SPEC §12): people outside the workspace's core membership. */
export function GuestBadge({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[11px] font-semibold',
        tone === 'light' ? 'bg-amber-100 text-amber-800' : 'bg-white/15 text-white',
        className,
      )}
    >
      Guest
    </span>
  );
}
