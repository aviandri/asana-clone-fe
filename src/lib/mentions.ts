// Comment bodies are user-controlled: we never render them as HTML. They're tokenised into plain
// text, @mentions (`@[Name](userId)`, SPEC §1) and http(s) links, and rendered as React elements.

export type BodyToken =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; name: string; userId: string }
  | { kind: 'link'; href: string };

const TOKEN_RE = /@\[([^\]\n]+)\]\(([0-9a-zA-Z-]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function tokenizeBody(body: string): BodyToken[] {
  const out: BodyToken[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: 'text', text: body.slice(last, i) });
    if (m[1] !== undefined) out.push({ kind: 'mention', name: m[1], userId: m[2] });
    else out.push({ kind: 'link', href: m[3] });
    last = i + m[0].length;
  }
  if (last < body.length) out.push({ kind: 'text', text: body.slice(last) });
  return out;
}

/** Serialise a mention for the API. Brackets/parens in names would break the syntax. */
export function mentionMarkup(user: { id: string; name: string }) {
  return `@[${user.name.replace(/[[\]()]/g, '')}](${user.id})`;
}

/**
 * If the caret is right after an `@query` (start of text or after whitespace), return the query
 * and where it starts — used to open the mention picker while typing.
 */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@[\]()]{0,30})$/.exec(before);
  if (!m) return null;
  return { query: m[2], start: caret - m[2].length - 1 };
}

/** Plain-text preview of a body (mentions shown as @Name). */
export function bodyPreview(body: string) {
  return body.replace(/@\[([^\]\n]+)\]\([0-9a-zA-Z-]+\)/g, '@$1');
}
