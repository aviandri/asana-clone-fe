import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/** Seed users from docs/SPEC.md §7. */
export const ADMIN = { email: 'admin@example.com', password: 'password123' };

type Section = { id: string; name: string; position: number };
type ProjectDetail = { id: string; name: string; sections: Section[] };
type Task = { id: string; title: string; sectionId: string | null };
type Story = { kind: string; body?: string };

/** Thin client over /api/v1 sharing the page's cookie jar (page.request), for setup and asserts. */
export class Api {
  constructor(private readonly request: APIRequestContext) {}

  private async json<T>(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
    expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }

  async firstTeamId(): Promise<string> {
    const { data } = await this.json<{ data: { id: string }[] }>(await this.request.get('/api/v1/teams'));
    expect(data.length, 'seed data should include at least one team').toBeGreaterThan(0);
    return data[0].id;
  }

  async createProject(name: string): Promise<ProjectDetail> {
    const teamId = await this.firstTeamId();
    return this.json(await this.request.post('/api/v1/projects', { data: { teamId, name } }));
  }

  async getProject(id: string): Promise<ProjectDetail> {
    return this.json(await this.request.get(`/api/v1/projects/${id}`));
  }

  async listProjectTasks(projectId: string): Promise<Task[]> {
    return (await this.json<{ data: Task[] }>(await this.request.get(`/api/v1/projects/${projectId}/tasks`))).data;
  }

  async createTask(input: { title: string; projectId: string; sectionId?: string }): Promise<Task> {
    return this.json(await this.request.post('/api/v1/tasks', { data: input }));
  }

  async getTask(id: string): Promise<Task> {
    return this.json(await this.request.get(`/api/v1/tasks/${id}`));
  }

  async stories(taskId: string): Promise<Story[]> {
    return (await this.json<{ data: Story[] }>(await this.request.get(`/api/v1/tasks/${taskId}/stories`))).data;
  }

  async deleteProject(id: string) {
    await this.request.delete(`/api/v1/projects/${id}`);
  }
}

/** Unique per run so reruns against the same DB don't collide. */
export const uniq = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

export async function loginViaUi(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

// Fixture callbacks name the continuation `provide`, not `use`: eslint-plugin-react-hooks
// would otherwise flag `use(...)` as a hook call.
export const test = base.extend<{ api: Api; authedPage: Page }>({
  api: async ({ page }, provide) => {
    await provide(new Api(page.request));
  },
  /** The default page, already logged in as the seed admin via the global-setup storage state. */
  authedPage: async ({ page }, provide) => {
    await provide(page);
  },
});

export { expect };
