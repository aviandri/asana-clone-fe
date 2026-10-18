# Mekari Project — web frontend

Web frontend for **Mekari Project**, Mekari's internal project-management tool (repo: `asana-clone-fe`). See [docs/SPEC.md](docs/SPEC.md) (mirrored from the BE repo; the BE copy is canonical).

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
| `npm run test:contract` | FE↔BE contract smoke test against a running backend (`BASE_URL`, seed users; see header of `scripts/contract-smoke.mjs`) |

On the shared dev box, wrap heavy commands with `/home/claude/projects/asana-clone/heavy.sh`.

## Layout

```
src/
  api/        types.ts (SPEC §5 shapes), client.ts (fetch wrapper + ApiError), endpoints.ts, hooks.ts, queryKeys.ts
  auth/       AuthProvider (session via GET /auth/me), route guards
  layout/     AppShell (task panel host, ⌘K search, toasts), Sidebar, ProfileDialog
  pages/      Home, Login, AcceptInvite, MyTasks, Inbox
  projects/   ProjectPage + List/Board/Calendar views, DnD hook, settings & new-project dialogs
  tasks/      TaskPanel (?task=<id>), fields, stories/comments + @mention composer, mutations
  teams/      Teams browse + team page
  admin/      Users & invites
  search/     ⌘K / Ctrl+K palette
  components/ shared UI (Modal, Popover, InlineText, Avatar, …)
  lib/        dates, positions, buckets, mentions (safe tokeniser), permissions, toasts
  mocks/      in-memory implementation of the API contract (dev mock mode + tests)
  test/       test setup and helpers (renderApp, setupMockApi)
scripts/      contract-smoke.mjs (FE↔BE contract test against a running backend; on the PR 3 stack)
```

Keyboard: `⌘K`/`Ctrl+K` search · `Esc` closes the task panel/dialogs · double-click or `F2` renames a task in a list ·
`Space` picks up/drops a focused board card (arrows move) · `⌘/Ctrl+Enter` posts a comment.

## Brand

- Product name: **Mekari Project**. Lockup and app icon live in `src/components/brand/Brand.tsx`;
  favicons in `public/` (`favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`).
- The Mekari mark/wordmark paths come from Mekari's official logo (internal Mekari tool).
- Product accent (app icon only): magenta `#B0136B → #E0257F → #FF5FA2`.
- Design tokens are CSS variables in `src/index.css` (Mekari purple primary `#651FFF`, neutrals,
  sidebar), exposed as Tailwind scales in `tailwind.config.js`. Contrast ratios are documented there.


## Motion

Fast, friendly, never in the way (Slack as the reference). `motion` via `LazyMotion` with the
`domMin` feature set loaded asynchronously (`src/motion/`), plus CSS keyframes in `tailwind.config.js`.
Rules: 120–220ms, ease-out in / ease-in out, springs for panels and drops, transform/opacity only,
list stagger ≤ 10 items × 20ms, nothing blocks input. `prefers-reduced-motion`: fades only — no
movement, no celebrations, count-ups jump. Celebrations can be turned off in **My profile**.
