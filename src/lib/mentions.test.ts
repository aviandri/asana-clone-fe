import { describe, expect, it } from 'vitest';
import { activeMentionQuery, bodyPreview, mentionMarkup, tokenizeBody } from './mentions';

describe('mentions', () => {
  it('tokenises mentions, links and text', () => {
    expect(tokenizeBody('hi @[Ada Admin](u-1), see https://example.com/x.')).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', name: 'Ada Admin', userId: 'u-1' },
      { kind: 'text', text: ', see ' },
      { kind: 'link', href: 'https://example.com/x' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('treats HTML as plain text and ignores non-http links', () => {
    const tokens = tokenizeBody('<img src=x onerror=alert(1)> javascript:alert(1)');
    expect(tokens).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)> javascript:alert(1)' }]);
  });

  it('serialises mentions safely', () => {
    expect(mentionMarkup({ id: 'u1', name: 'Bob (Ops) [x]' })).toBe('@[Bob Ops x](u1)');
  });

  it('detects an @query at the caret', () => {
    expect(activeMentionQuery('hello @al', 9)).toEqual({ query: 'al', start: 6 });
    expect(activeMentionQuery('@', 1)).toEqual({ query: '', start: 0 });
    expect(activeMentionQuery('mail a@b', 8)).toBeNull();
    expect(activeMentionQuery('hello @al ', 10)).toBeNull();
  });

  it('previews bodies as plain text', () => {
    expect(bodyPreview('ping @[Ada](u1)')).toBe('ping @Ada');
  });
});
