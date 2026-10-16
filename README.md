# asana-clone-fe

Web frontend for the internal Asana clone. See [docs/SPEC.md](docs/SPEC.md) (mirrored from the BE repo; the BE copy is canonical).

Stack: React 18 · Vite 5 · TypeScript (strict) · React Router 6 · TanStack Query 5 · Tailwind 3 · dnd-kit · date-fns · Vitest + Testing Library.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173, proxies /api → http://localhost:3000 (real backend)
npm run dev:mock   # same, but the API is served by an in-browser mock backend (no BE needed)
```

Mock mode logs: `admin@example.com` / `password123` (also `alice@`, `bob@`, `carol@example.com`).
Mock data persists in `localStorage`; run `__resetMockDb()` in the devtools console to reseed.
The mock is only enabled when `VITE_MOCK=true`, and is tree-shaken out of production builds.

## Scripts

| | |
|---|---|
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm test` | Vitest (jsdom), single worker |
| `npm run build` | typecheck + production build to `dist/` |

On the shared dev box, wrap heavy commands with `/home/claude/projects/asana-clone/heavy.sh`.

## Layout

```
src/
  api/        types.ts (SPEC §5 shapes), client.ts (fetch wrapper + ApiError), endpoints.ts, hooks.ts, queryKeys.ts
  auth/       AuthProvider (session via GET /auth/me), route guards
  layout/     AppShell + Sidebar
  pages/      route components
  components/ shared UI
  mocks/      in-memory implementation of the API contract (dev mock mode + tests)
  test/       test setup and helpers (renderApp, setupMockApi)
```
