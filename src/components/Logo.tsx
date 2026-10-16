export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <g fill="#f06a6a">
        <circle cx="16" cy="9" r="6" />
        <circle cx="8" cy="22" r="6" />
        <circle cx="24" cy="22" r="6" />
      </g>
    </svg>
  );
}
