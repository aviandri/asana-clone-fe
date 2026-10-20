import { describe, expect, it } from 'vitest';
import { safeNext } from './url';

describe('safeNext', () => {
  it('keeps same-origin paths, with query and hash', () => {
    expect(safeNext('/connect/authorize?request=abc')).toBe('/connect/authorize?request=abc');
    expect(safeNext('/projects/p1/list?task=t1#c')).toBe('/projects/p1/list?task=t1#c');
  });

  it('falls back to home for anything that could leave the site', () => {
    for (const bad of [
      null,
      '',
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\\/evil.com',
      '\\\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      'javascript:alert(1)',
      'evil.com',
      // Dot segments normalize to a protocol-relative pathname.
      '/.//evil.com',
      '/x/..//evil.com',
      '/%2e//evil.com',
      '/%2E%2E//evil.com',
    ]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
