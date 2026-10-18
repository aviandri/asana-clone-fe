# E2E smoke tests (Playwright)

Nine specs covering the golden path: login/logout, create project, add task (list view), move a
task across board columns (drag and drop), comment on a task, and for v1.1 create an aligned goal
and update a key result, then open the project Dashboard and export CSV. For v1.2: switch
workspace (menu, rail, shortcuts, deep link) and the guest experience.
Specs are named `*.e2e.ts` (not `*.spec.ts`) so vitest's default glob in `npm test` skips them.
Chromium only, `workers: 1`, `reducedMotion: 'reduce'` (the UI animates; this keeps assertions and
drag-and-drop from racing transitions).

## Running locally
```sh
# 1. Postgres (shared dev DB) and a seeded backend on :3000
/home/claude/projects/asana-clone/devdb/start.sh
cd ../asana-clone-be && npm run seed && npm run dev   # or: npm run build && npm start

# 2. One-time: browser binary (~150 MB download, about 300 MB RAM while running)
npx playwright install chromium

# 3. Run (starts vite on :5173 if nothing is listening there)
/home/claude/projects/asana-clone/heavy.sh npm run e2e
# against another deployment, e.g. the compose stack:
E2E_BASE_URL=http://localhost:8080 npm run e2e
```
Global setup logs in once as the seed admin (login is rate-limited to 10/min per IP) and every
spec reuses that session, except `01-auth`, which starts logged out. Specs create their own uniquely named projects through the API and delete them afterwards, so
they can run repeatedly against the same seeded DB. On failure, traces land in
`e2e/test-results/`; open them with `npx playwright show-trace <zip>`.

## Selector contract
The tests use accessible roles and names, not CSS classes or test ids. The UI must expose:

| Where | Element | Accessible role / name |
|---|---|---|
| Login | fields, submit | labels `Email address`, `Password`; button `Log in`; error `role="alert"` |
| Shell | sidebar | `<nav aria-label="Main">` containing a link per project (name = project name); button `Log out` |
| Create project | trigger | button matching `/new project/i` (first one on `/` is used) |
| | form | `role="dialog"` with a field labelled `/name/i` and a button matching `/create/i` |
| Project page | title | `<h1>` = project name; URL `/projects/:id[/:view]`, views `list` and `board` |
| List view | table | `role="table"` named `<project name> tasks`; each task title is a button (name = title) in its row |
| | add task | toolbar button `Add task` (exact) → textbox `New task name`, saved on Enter |
| Board view | columns | each section is `role="region"` with `aria-label` = section name; cards show the task title |
| | drag & drop | dnd-kit PointerSensor; an activation distance of 10px or less is fine |
| Task detail | panel | opened by a single click on the title (or `?task=<id>`); `role="dialog"` named by task title |
| | comment | textbox named `/comment/i` and a button named exactly `Comment` |
| **v1.1** Goals `/goals` | new goal | button `New goal` → `role="dialog"` named `New goal` with fields labelled `Goal title` and `Parent goal` (a `<select>`, options = goal titles; time period defaults to the current quarter) and button `Create goal` |
| | tree | `role="tree"` named `Goals`; each goal is a `treeitem` named by its title, children nested inside their parent's `treeitem` |
| Goal detail `/goals/:id` | KR value | input labelled `<KR title> current value`, saved on Enter (or blur) |
| **v1.1** Project dashboard | tab | link `Dashboard` in `<nav aria-label="Project views">` → `/projects/:id/dashboard` |
| | KPI tiles | each tile `role="group"` named exactly `Total tasks` / `Completed` / `Overdue` (more allowed), containing the number |
| | export | link or button `Export CSV` that triggers a file download |
| **v1.2** Workspace switcher | trigger | button named exactly `Workspace menu` inside `<nav aria-label="Main">`, its text showing the current workspace name |
| | menu | `role="menu"`; each workspace a `menuitemradio` named by workspace name, `aria-checked="true"` on the current one; `menuitem` `Create workspace` |
| | toast | `role="status"` containing `Switched to <name>` (also after a deep-link switch) |
| Workspace rail | rail | `<nav aria-label="Workspaces">` (only with ≥ 2 workspaces); a button per workspace named by its name, `aria-current="true"` on the current one; `Ctrl/⌘+n` = n-th tile in `Me.workspaces` order |
| Guest | sidebar | text `Guest` (exact) and `You're a guest in <name>` inside Main nav; no `Goals` link, no `Browse` (teams) link, no `New project` button; `/reporting` has no `Workload` link |

Everything up to the v1.1 rows is implemented on FE `main`. The v1.2 rows (specs 08–09) are the
proposed contract for the workspace screens (SPEC §12), which aren't built yet; they're skipped unless `E2E_WORKSPACES=1` is set, and they need the full
seed (`Mekari` + `Acme Pilot` + `guest@partner.test`). If the UI ends up differing, update the spec
selectors in the same PR.
