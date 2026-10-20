// Mock implementation of the token endpoints (SPEC §14): config, list / create / revoke. There's no
// MCP server behind it; a created token is just shown once.
import type { ApiTokenInfo } from '@/api/types';
import { uid, type ApiTokenRow, type MockDb } from './db';
import { HttpError, invalid, notFound, nowIso, type Handler } from './shared';

/** §14: at most 20 active PATs per user. */
export const MOCK_MAX_ACTIVE_PATS = 20;
const EXPIRY_DAYS = new Set([30, 90, 365]);

function table(db: MockDb) {
  db.apiTokens ??= [];
  return db.apiTokens;
}

export function mockConfig(db: MockDb) {
  return {
    appUrl: db.config?.appUrl ?? globalThis.location?.origin ?? 'https://project.example.com',
    mcpEnabled: db.config?.mcpEnabled ?? true,
  };
}

const active = (t: ApiTokenRow) => !t.revokedAt && (!t.expiresAt || new Date(t.expiresAt) > new Date());

const serialize = (t: ApiTokenRow): ApiTokenInfo => ({
  id: t.id,
  name: t.name,
  source: t.source,
  scope: t.scope,
  prefix: t.prefix,
  createdAt: t.createdAt,
  lastUsedAt: t.lastUsedAt,
  expiresAt: t.expiresAt,
});

/** 32 random bytes, base64url, after the type prefix (the server's format). */
function secret(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${prefix}${b64}`;
}

/** Changing a password revokes every token and grant (§14). */
export function revokeAllTokens(db: MockDb, userId: string) {
  const now = nowIso();
  table(db).forEach((t) => {
    if (t.userId === userId && !t.revokedAt) t.revokedAt = now;
  });
}

export const tokenRoutes: [string, string, Handler][] = [
  ['GET', '/config', ({ db }) => mockConfig(db)],
  [
    'GET',
    '/me/tokens',
    ({ db, me }) => ({
      data: table(db)
        .filter((t) => t.userId === me!.id && active(t))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(serialize),
    }),
  ],
  [
    'POST',
    '/me/tokens',
    ({ db, me, body }) => {
      if (!mockConfig(db).mcpEnabled) throw notFound();
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (name.length < 1 || name.length > 60) throw invalid('name: must be 1–60 characters');
      if (body?.scope !== 'READ' && body?.scope !== 'WRITE') throw invalid('scope: must be READ or WRITE');
      const days = body?.expiresInDays;
      if (days !== null && !EXPIRY_DAYS.has(days)) throw invalid('expiresInDays: must be 30, 90, 365 or null');
      const pats = table(db).filter((t) => t.userId === me!.id && t.source === 'PAT' && active(t));
      if (pats.length >= MOCK_MAX_ACTIVE_PATS)
        throw new HttpError(409, 'CONFLICT', `You can have up to ${MOCK_MAX_ACTIVE_PATS} active tokens. Revoke one first.`);
      const token = secret('mpat_');
      const row: ApiTokenRow = {
        id: uid(db, 'tokn'),
        userId: me!.id,
        name,
        source: 'PAT',
        scope: body.scope,
        prefix: token.slice(0, 12),
        createdAt: nowIso(),
        lastUsedAt: null,
        expiresAt: days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString(),
        revokedAt: null,
      };
      table(db).push(row);
      return { status: 201, body: { token, info: serialize(row) } };
    },
  ],
  [
    'DELETE',
    '/me/tokens/:id',
    ({ db, me, params }) => {
      const t = table(db).find((x) => x.id === params.id && x.userId === me!.id && !x.revokedAt);
      if (!t) throw notFound();
      t.revokedAt = nowIso();
      return { status: 204 };
    },
  ],
];
