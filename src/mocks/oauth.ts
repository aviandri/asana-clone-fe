// Mock of the consent page's endpoints (SPEC §14, M7, M11, M12, M28). There's no real authorization
// server: an approved request becomes a connected app on the tokens page, and the redirect carries a
// fake code.
import type { OAuthConsentRequest } from '@/api/types';
import { uid, type MockDb, type OAuthRequestRow } from './db';
import { HttpError, invalid, myWorkspaces, notFound, nowIso, resolveWorkspace, serializeMe, serializeWorkspace, type Handler } from './shared';

function table(db: MockDb) {
  db.oauthRequests ??= [];
  return db.oauthRequests;
}

const isLoopback = (uri: string) => {
  const u = new URL(uri);
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
};

/**
 * 404 unknown, 410 expired (M7). Already decided: 410 when reading it (M30), 409 only for a second
 * decision.
 */
function pending(db: MockDb, id: string, deciding = false): OAuthRequestRow {
  const r = table(db).find((x) => x.id === id);
  if (!r) throw notFound();
  if (new Date(r.expiresAt) <= new Date()) throw new HttpError(410, 'GONE', 'This request has expired');
  if (r.decidedAt) {
    if (deciding) throw new HttpError(409, 'CONFLICT', 'This request has already been decided');
    throw new HttpError(410, 'GONE', 'This request has already been used');
  }
  return r;
}

export const oauthRoutes: [string, string, Handler][] = [
  [
    'GET',
    '/oauth/requests/:id',
    ({ db, me, params, header }): OAuthConsentRequest => {
      const r = pending(db, params.id);
      return {
        client: { name: r.clientName, redirectHost: new URL(r.redirectUri).host, clientIdHost: r.clientIdHost },
        requestedScopes: r.scope === 'read' ? ['read'] : ['read', 'write'],
        isLocalRedirect: isLoopback(r.redirectUri),
        expiresAt: r.expiresAt,
        user: serializeMe(db, me!, resolveWorkspace(db, me!, header, true)),
        workspaces: myWorkspaces(db, me!.id).map((w) => serializeWorkspace(db, w, me!.id)),
      };
    },
  ],
  [
    'POST',
    '/oauth/requests/:id/decision',
    ({ db, me, params, body }) => {
      const r = pending(db, params.id, true);
      if (typeof body?.approve !== 'boolean') throw invalid('approve: must be a boolean');
      const scope = body.scope ?? (r.scope === 'read' ? 'READ' : 'WRITE');
      if (scope !== 'READ' && scope !== 'WRITE') throw invalid('scope: must be READ or WRITE');
      if (scope === 'WRITE' && r.scope === 'read') throw invalid('scope: only read access was requested');
      r.decidedAt = nowIso();
      r.userId = me!.id;
      const back = new URL(r.redirectUri);
      if (body.approve) {
        db.apiTokens ??= [];
        db.apiTokens.push({
          id: uid(db, 'tokn'),
          userId: me!.id,
          name: r.clientName,
          source: 'OAUTH',
          scope,
          prefix: 'mpor_Mock123',
          createdAt: nowIso(),
          lastUsedAt: null,
          expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          revokedAt: null,
        });
        back.searchParams.set('code', `mock_code_${r.id}`);
      } else {
        back.searchParams.set('error', 'access_denied');
      }
      back.searchParams.set('state', r.state);
      return { redirectUrl: back.toString() };
    },
  ],
];
