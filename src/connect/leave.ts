/** Leaving the app for the client's redirect, behind an object so tests can watch it (jsdom can't navigate). */
export const leave = {
  to(url: string) {
    window.location.assign(url);
  },
};

/** The decision's redirect: only http(s) (never `javascript:` and friends, whatever the server says). */
export function isSafeRedirect(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Framed (clickjacking): the page refuses to show its buttons, in case the frame-ancestors header is missing. */
export function isFramed() {
  try {
    return window.top !== window.self;
  } catch {
    // A cross-origin top that throws on access is a frame too.
    return true;
  }
}
