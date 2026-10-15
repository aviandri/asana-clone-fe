import clsx from 'clsx';
import type { UserSummary } from '@/api/types';
import { initials } from '@/lib/initials';

const SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

export function Avatar({
  user,
  size = 'sm',
  className,
}: {
  user: Pick<UserSummary, 'name' | 'avatarColor'> | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        aria-label="Unassigned"
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-gray-400 text-gray-400',
          SIZES[size],
          className,
        )}
      >
        <svg viewBox="0 0 16 16" className="h-3/5 w-3/5" fill="currentColor" aria-hidden>
          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-2.7 0-5 1.3-5 3V14h10v-1.5c0-1.7-2.3-3-5-3Z" />
        </svg>
      </span>
    );
  }
  return (
    <span
      title={user.name}
      aria-label={user.name}
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: user.avatarColor || '#8d84e8' }}
    >
      {initials(user.name)}
    </span>
  );
}
