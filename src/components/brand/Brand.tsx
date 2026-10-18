// Mekari Project brand marks. The Mekari mark + "mekari" wordmark paths are from Mekari's official
// logo (brand-ref/logo-mekari.svg — permitted for this internal Mekari tool); the lockup follows
// the mekari.com product pattern: mark + wordmark, thin #B2B9C4 divider, product name.
import clsx from 'clsx';
import { useId } from 'react';

const MARK = 'M135.75 59.24L102.94 52.8L113.71 21.1C115.62 15.58 114.27 10 109.42 7.20001C104.57 4.40001 99.01 6.17 95.24 10.44L73.17 35.61L51.1 10.44C47.23 6.11 41.73 4.45001 36.92 7.20001C32.06 9.98001 30.71 15.64 32.63 21.1L43.39 52.8L10.58 59.25C4.83999 60.34 0.669991 64.45 0.659991 70.04C0.649991 75.64 4.94999 79.58 10.53 80.73L43.39 87.17L32.63 118.87C30.72 124.39 32.07 129.97 36.92 132.77C41.77 135.57 47.33 133.8 51.1 129.53L73.17 104.36L95.24 129.53C99.11 133.86 104.61 135.52 109.42 132.77C114.28 129.99 115.63 124.33 113.71 118.87L102.95 87.17L135.81 80.72C141.39 79.57 145.69 75.63 145.68 70.03C145.67 64.43 141.5 60.33 135.76 59.24H135.75Z';
const WORDMARK = [
  'M235.61 118.52V74.26C235.61 63.4 231.27 56.22 221.41 56.22C211.55 56.22 206.55 65.07 206.55 74.42V118.51H182.5V36.02H205.21V45.37C210.39 36.35 219.91 34.18 226.92 34.18C235.94 34.18 245.63 37.52 250.97 49.54C258.32 38.35 266.17 34.01 278.36 34.01C295.56 34.01 311.26 42.69 311.26 73.42V118.51H287.04V73.92C287.04 63.57 284.2 56.72 274.51 56.72C264.82 56.72 259.31 64.9 259.31 74.26V118.52H235.6H235.61Z',
  'M407.45 74.43C407.45 77.99 407.12 81.44 406.45 84.78H348.67C349.34 89.57 351.68 93.33 355.68 96.05C359.69 98.78 364.2 100.14 369.21 100.14C377.67 100.14 385.13 97.58 391.59 92.46L402.78 107.99C394.21 116.23 382.57 120.35 367.88 120.35C354.52 120.35 343.58 116.65 335.06 109.24C326.54 101.84 322.28 91.23 322.28 77.43C322.28 63.63 326.65 53.24 335.39 45.62C344.13 38 354.62 34.18 366.87 34.18C379.12 34.18 388.66 37.72 396.18 44.78C403.7 51.85 407.45 61.73 407.45 74.42V74.43ZM378.06 57.98C374.94 55.25 370.99 53.89 366.2 53.89C361.41 53.89 357.4 55.25 354.18 57.98C350.95 60.71 349.11 64.69 348.67 69.92H382.57C382.68 64.69 381.18 60.71 378.06 57.98Z',
  'M442.68 1.77997V68.42L467.06 36.19H495.45V37.69L465.22 74.93L500.13 116.68V118.52H471.24L442.68 82.28V118.52H418.63V1.77997H442.68Z',
  'M541.54 34.18C555.34 34.18 565.78 36.77 572.85 41.95C579.92 47.13 583.45 55.39 583.45 66.75V118.52H560.4V103.49C558.17 108.5 554.05 112.51 549.04 115.51C544.03 118.52 538.29 120.02 531.84 120.02C523.38 120.02 516.36 117.6 510.8 112.76C505.23 107.92 502.45 101.43 502.45 93.3C502.45 84.73 505.54 78.05 511.72 73.26C517.9 68.47 525.89 66.08 535.68 66.08C544.25 66.08 551.43 67.53 557.22 70.42V68.75C557.22 58.95 550.87 54.05 538.18 54.05C530.61 54.05 522.26 55.61 513.13 58.73L508.29 40.53C518.98 36.3 530.05 34.18 541.52 34.18H541.54ZM540.2 99.81C544.76 99.81 548.66 98.59 551.89 96.14C555.12 93.69 557.07 90.29 557.73 85.95C552.61 83.28 547.1 81.94 541.2 81.94C537.3 81.94 534.21 82.72 531.93 84.28C529.65 85.84 528.51 88.12 528.51 91.13C528.51 93.91 529.62 96.06 531.85 97.56C534.08 99.06 536.86 99.81 540.2 99.81V99.81Z',
  'M620.04 36.19V45.21C625.55 37.53 632.9 34.19 642.08 34.19C649.93 34.19 656.44 36.53 662.29 41.71L652.27 60.75C648.26 57.91 644.09 56.57 639.08 56.57C628.73 56.57 619.87 63.25 619.87 75.61V118.53H595.82V36.19H620.04Z',
  'M694.02 14.14C694.02 32.18 666.63 32.18 666.63 14.14C666.63 -3.90001 694.02 -3.90001 694.02 14.14ZM668.3 35.85V118.52H692.35V35.85H668.3Z',
];

/**
 * "mekari | project" lockup. `variant="dark"` is for dark surfaces (the sidebar): the mark and
 * wordmark turn white (the purple mark is only 2.35:1 on the sidebar) and the divider softens.
 */
export function MekariLockup({ variant = 'light', className }: { variant?: 'light' | 'dark'; className?: string }) {
  const dark = variant === 'dark';
  return (
    <span role="img" aria-label="Mekari Project" className={clsx('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 695 135" className="h-[18px] w-auto shrink-0" aria-hidden focusable="false">
        <path d={MARK} fill={dark ? '#FFFFFF' : '#651FFF'} />
        {WORDMARK.map((d, i) => (
          <path key={i} d={d} fill={dark ? '#FFFFFF' : '#232933'} />
        ))}
      </svg>
      <span aria-hidden className={clsx('h-5 w-px shrink-0', dark ? 'bg-white/35' : 'bg-[#B2B9C4]')} />
      <span aria-hidden className={clsx('text-[17px] font-medium leading-none tracking-tight', dark ? 'text-sidebar-text' : 'text-gray-900')}>
        project
      </span>
    </span>
  );
}

/**
 * Mekari Project app icon (product-icon pattern: 24×24 rounded square, diagonal magenta gradient,
 * white glyph — three task bars + a check — with a soft shadow). Same artwork as public/favicon.svg.
 */
export function AppIcon({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="16.239" y1="23.648" x2="8.367" y2="2.018" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B0136B" />
          <stop offset=".5" stopColor="#E0257F" />
          <stop offset="1" stopColor="#FF5FA2" />
        </linearGradient>
        <linearGradient id={`${id}-g`} x1="12" y1="19" x2="12" y2="5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD1E6" />
          <stop offset=".7" stopColor="#F7F7F7" />
        </linearGradient>
        <filter id={`${id}-s`} x="-30%" y="-30%" width="160%" height="180%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy=".7" stdDeviation=".7" floodColor="#6E0A40" floodOpacity=".35" />
        </filter>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${id}-bg)`} />
      <g filter={`url(#${id}-s)`}>
        <rect x="5" y="5.6" width="11" height="2.8" rx="1.4" fill={`url(#${id}-g)`} />
        <rect x="5" y="10.6" width="7.4" height="2.8" rx="1.4" fill={`url(#${id}-g)`} />
        <rect x="5" y="15.6" width="4.2" height="2.8" rx="1.4" fill={`url(#${id}-g)`} />
        <path d="M12 16.4l2.2 2.2 4.6-5.1" stroke={`url(#${id}-g)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
