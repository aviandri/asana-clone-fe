const BASE = 'http://same-origin.invalid';

/**
 * Only allow same-origin relative redirects (prevents open redirects via ?next=). Parsed like the
 * browser would: `/\evil.com` and `/\t/evil.com` are protocol-relative there, so a prefix check
 * isn't enough. And checked again after parsing: dot segments (`/.//evil.com`, `/%2e//evil.com`)
 * normalize to a pathname that starts with `//`.
 */
export function safeNext(next: string | null) {
  if (!next || !next.startsWith('/') || next.includes('\\') || [...next].some((c) => c.charCodeAt(0) < 0x20)) return '/';
  try {
    const url = new URL(next, BASE);
    const out = `${url.pathname}${url.search}${url.hash}`;
    return url.origin === BASE && /^\/(?!\/)/.test(out) ? out : '/';
  } catch {
    return '/';
  }
}
