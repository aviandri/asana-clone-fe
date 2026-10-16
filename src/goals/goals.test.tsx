import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { periodLabel } from '@/lib/periods';
import { ADMIN, ALICE, BOB, renderApp, setupMockApi } from '@/test/utils';

const user = () => userEvent.setup();
const year = String(new Date().getFullYear());

async function goalsPage(loginAs = ADMIN, path = '/goals') {
  const utils = renderApp(path, { loginAs });
  const tree = await screen.findByRole('tree', { name: 'Goals' });
  return { ...utils, tree };
}
async function goalDetail(title: string, loginAs = ADMIN) {
  const db = setupMockApi(loginAs);
  const g = db.goals!.find((x) => x.title === title)!;
  const utils = renderApp(`/goals/${g.id}`, { db });
  await screen.findByRole('textbox', { name: 'Goal title' });
  return { ...utils, goal: g };
}

describe('goals page', () => {
  it('shows the current quarter cascade as a nested tree (e2e contract)', async () => {
    const { tree } = await goalsPage();
    const company = within(tree).getByRole('treeitem', { name: 'Become the go-to tool for internal planning' });
    const eng = within(company).getByRole('treeitem', { name: 'Ship a delightful v1.1' });
    expect(within(eng).getByRole('treeitem', { name: 'Make the app fast' })).toHaveAttribute('aria-level', '3');
    expect(within(company).getByRole('treeitem', { name: 'Grow internal adoption' })).toBeInTheDocument();
    expect(within(eng).getByRole('progressbar', { name: 'Make the app fast progress' })).toHaveAttribute('aria-valuenow', '36.7');
    expect(within(eng).getAllByText('Off track')[0]).toBeInTheDocument();
    // year-level goals aren't in the quarter view
    expect(within(tree).queryByRole('treeitem', { name: 'Cut infra spend' })).not.toBeInTheDocument();
  });

  it('switches period and filters', async () => {
    const { tree } = await goalsPage(BOB);
    const u = user();
    await u.click(screen.getByRole('button', { name: 'Mine' }));
    await waitFor(() => expect(within(tree).getAllByRole('treeitem').map((t) => t.getAttribute('aria-labelledby') && t.textContent)).toHaveLength(1));
    expect(within(tree).getByRole('treeitem', { name: 'Make the app fast' })).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Company' }));
    expect(within(tree).getByRole('treeitem', { name: 'Become the go-to tool for internal planning' })).toBeInTheDocument();
    expect(within(tree).queryByRole('treeitem', { name: 'Make the app fast' })).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'All' }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Time period' }), periodLabel(year));
    expect(await screen.findByRole('treeitem', { name: 'Cut infra spend' })).toBeInTheDocument();
  });

  it('collapses and expands with the keyboard', async () => {
    const { tree } = await goalsPage();
    const u = user();
    const company = within(tree).getByRole('treeitem', { name: 'Become the go-to tool for internal planning' });
    company.focus();
    await u.keyboard('{ArrowLeft}');
    expect(company).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree).queryByRole('treeitem', { name: 'Ship a delightful v1.1' })).not.toBeInTheDocument();
    await u.keyboard('{ArrowRight}{ArrowRight}');
    expect(within(tree).getByRole('treeitem', { name: 'Ship a delightful v1.1' })).toHaveFocus();
    await u.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(company).toHaveFocus();
  });

  it('creates a goal aligned to a parent via the New goal dialog (e2e contract)', async () => {
    const { tree, db } = await goalsPage(ALICE);
    const u = user();
    await u.click(screen.getByRole('button', { name: 'New goal' }));
    const dialog = await screen.findByRole('dialog', { name: 'New goal' });
    expect(within(dialog).queryByRole('option', { name: 'Company' })).not.toBeInTheDocument(); // members can't create company goals
    await u.type(within(dialog).getByRole('textbox', { name: 'Goal title' }), 'Write the onboarding guide');
    const parent = within(dialog).getByRole('combobox', { name: 'Parent goal' });
    await waitFor(() => expect(within(parent).getByRole('option', { name: 'Publish API docs' })).toBeInTheDocument());
    await u.selectOptions(parent, 'Publish API docs');
    await u.click(within(dialog).getByRole('button', { name: 'Create goal' }));

    const docs = await within(tree).findByRole('treeitem', { name: 'Publish API docs' });
    expect(await within(docs).findByRole('treeitem', { name: 'Write the onboarding guide' })).toBeInTheDocument();
    const created = db.goals!.find((g) => g.title === 'Write the onboarding guide')!;
    expect(created.parentId).toBe(db.goals!.find((g) => g.title === 'Publish API docs')!.id);
    expect(created.ownerId).toBe(db.users.find((x) => x.email === ALICE)!.id);
  });

  it('shows create errors inline', async () => {
    const db = setupMockApi(BOB);
    const mkt = db.teams.find((t) => t.name === 'Marketing')!;
    db.teamMembers.push({ teamId: mkt.id, userId: db.users.find((x) => x.email === BOB)!.id });
    renderApp('/goals', { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'New goal' }));
    const dialog = await screen.findByRole('dialog', { name: 'New goal' });
    await u.type(within(dialog).getByRole('textbox', { name: 'Goal title' }), 'Sneaky');
    // membership revoked server-side after the dialog loaded
    db.teamMembers = db.teamMembers.filter((m) => !(m.teamId === mkt.id && m.userId === db.users.find((x) => x.email === BOB)!.id));
    await u.selectOptions(within(dialog).getByRole('combobox', { name: 'Level' }), 'Team: Marketing');
    await u.click(within(dialog).getByRole('button', { name: 'Create goal' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/forbidden/i);
  });
});

describe('goal detail', () => {
  it('updates a KR current value on Enter with optimistic progress (e2e contract)', async () => {
    const { db } = await goalDetail('Make the app fast', BOB);
    const u = user();
    const input = screen.getByRole('spinbutton', { name: 'p95 page load (ms) current value' });
    await u.clear(input);
    await u.type(input, '1200{Enter}');
    expect(screen.getByRole('progressbar', { name: 'p95 page load (ms) progress' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar', { name: 'Goal progress' })).toHaveAttribute('aria-valuenow', '70');
    await waitFor(() => expect(db.keyResults!.find((k) => k.title === 'p95 page load (ms)')!.currentValue).toBe(1200));
  });

  it('renders BOOLEAN KRs as a checkbox', async () => {
    const { db } = await goalDetail('Publish API docs', ALICE);
    const box = screen.getByRole('checkbox', { name: 'Docs site live current value' });
    expect(box).not.toBeChecked();
    await user().click(box);
    expect(box).toBeChecked();
    await waitFor(() => expect(db.keyResults!.find((k) => k.title === 'Docs site live')!.currentValue).toBe(1));
  });

  it('lets a KR owner update only the value; the rest is read-only', async () => {
    const db = setupMockApi(BOB);
    const wau = db.keyResults!.find((k) => k.title === 'Weekly active users')!;
    wau.ownerId = db.users.find((x) => x.email === BOB)!.id;
    const g = db.goals!.find((x) => x.title === 'Grow internal adoption')!;
    renderApp(`/goals/${g.id}`, { db });
    expect(await screen.findByRole('textbox', { name: 'Goal title' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Weekly active users current value' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Teams onboarded current value' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Key result title: Weekly active users' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /add key result/i })).not.toBeInTheDocument();
    // KR owners may post status updates
    const u = user();
    await u.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'ON_TRACK');
    await u.type(screen.getByRole('textbox', { name: 'Status update' }), 'Recovering');
    await u.click(screen.getByRole('button', { name: 'Post update' }));
    const history = await screen.findByRole('list', { name: 'Update history' });
    expect(await within(history).findByText('Recovering')).toBeInTheDocument();
    await waitFor(() => expect(db.goals!.find((x) => x.id === g.id)!.status).toBe('ON_TRACK'));
  });

  it('adds a key result and switches the progress source to manual', async () => {
    const { db, goal } = await goalDetail('Publish API docs', ALICE);
    const u = user();
    await u.click(screen.getByRole('button', { name: /add key result/i }));
    const form = screen.getByRole('form', { name: 'New key result' });
    await u.type(within(form).getByRole('textbox', { name: 'Key result' }), 'Guides written');
    await u.type(within(form).getByRole('spinbutton', { name: 'Target' }), '5');
    await u.click(within(form).getByRole('button', { name: 'Add key result' }));
    expect(await screen.findByRole('spinbutton', { name: 'Guides written current value' })).toHaveValue(0);

    await u.selectOptions(screen.getByRole('combobox', { name: 'Measure progress by' }), 'MANUAL');
    const manual = await screen.findByRole('spinbutton', { name: 'Manual progress' });
    await u.clear(manual);
    await u.type(manual, '60{Enter}');
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Goal progress' })).toHaveAttribute('aria-valuenow', '60'));
    expect(db.goals!.find((x) => x.id === goal.id)!.progressSource).toBe('MANUAL');
  });

  it('lists linked projects, notes hidden ones, and links another', async () => {
    const db = setupMockApi(BOB);
    const g = db.goals!.find((x) => x.title === 'Launch the redesigned website')!;
    const api = db.projects.find((p) => p.name === 'API v2')!;
    const launch = db.projects.find((p) => p.name === 'Q4 Launch Campaign')!;
    launch.privacy = 'PRIVATE';
    db.goalProjects!.push({ goalId: g.id, projectId: launch.id });
    g.ownerId = db.users.find((x) => x.email === BOB)!.id; // bob can edit
    renderApp(`/goals/${g.id}`, { db });
    const section = await screen.findByRole('region', { name: 'Linked projects' });
    expect(within(section).getByRole('link', { name: 'Website Redesign' })).toBeInTheDocument();
    expect(within(section).getByText(/1 linked project you don’t have access to/)).toBeInTheDocument();

    const u = user();
    await u.selectOptions(within(section).getByRole('combobox', { name: 'Project to link' }), api.id);
    await u.click(within(section).getByRole('button', { name: 'Link project' }));
    expect(await within(section).findByRole('link', { name: 'API v2' })).toBeInTheDocument();
  });

  it('adds a sub-goal from the detail page and deletes a goal', async () => {
    const { db, goal, router } = await goalDetail('Ship a delightful v1.1', ALICE);
    const u = user();
    await u.click(screen.getByRole('button', { name: /add sub-goal/i }));
    const dialog = await screen.findByRole('dialog', { name: 'New goal' });
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Parent goal' })).toHaveValue(goal.id));
    await u.type(within(dialog).getByRole('textbox', { name: 'Goal title' }), 'Accessibility pass');
    await u.click(within(dialog).getByRole('button', { name: 'Create goal' }));
    const subs = screen.getByRole('list', { name: 'Sub-goals' });
    expect(await within(subs).findByRole('link', { name: 'Accessibility pass' })).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await u.click(screen.getByRole('button', { name: 'Delete goal' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/goals'));
    expect(db.goals!.some((x) => x.id === goal.id)).toBe(false);
    expect(db.goals!.find((x) => x.title === 'Accessibility pass')!.parentId).toBeNull();
  });

  it('shows not found for unknown goals', async () => {
    renderApp('/goals/nope', { loginAs: ADMIN });
    expect(await screen.findByText('Goal not found')).toBeInTheDocument();
  });
});

describe('sidebar', () => {
  it('has a Goals entry', async () => {
    renderApp('/', { loginAs: ALICE });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Goals' })).toHaveAttribute('href', '/goals');
  });
});
