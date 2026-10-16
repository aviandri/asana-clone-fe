# E2E smoke tests (Playwright)

Five specs covering the golden path: login/logout, create project, add task (list view), move a
task across board columns (drag and drop), comment on a task. Chromium only, `workers: 1`.

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
Specs create their own uniquely named projects through the API and delete them afterwards, so
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
| List view | add task | button matching `/add task/i` → textbox named `/task name/i`, saved on Enter |
| Board view | columns | each section is `role="region"` with `aria-label` = section name; cards show the task title |
| | drag & drop | dnd-kit PointerSensor; an activation distance of 10px or less is fine |
| Task detail | panel | opened by clicking the task title; `role="dialog"` with accessible name = task title |
| | comment | textbox named `/comment/i` and a button named exactly `Comment` |

Login and shell are already implemented this way. The rest is the contract for the upcoming
project, list, board and task-detail screens. If the UI ends up differing, update the spec
selectors in the same PR.
