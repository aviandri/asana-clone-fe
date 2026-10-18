import clsx from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary-500',
        className,
      )}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
