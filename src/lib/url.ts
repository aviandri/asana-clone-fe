/** Only allow same-origin relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
