const BASE = 'http://same-origin.invalid';

/**
 * Only allow same-origin relative redirects (prevents open redirects via ?next=). Parsed like the
 * browser would: `/\evil.com` and `/\t/evil.com` are protocol-relative there, so a prefix check
 * isn't enough.
 */
export function safeNext(next: string | null) {
  if (!next || !next.startsWith('/') || next.includes('\\') || [...next].some((c) => c.charCodeAt(0) < 0x20)) return '/';
  try {
    const url = new URL(next, BASE);
    return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}
