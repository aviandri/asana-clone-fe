import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { celebrate, celebrationsEnabled, setCelebrationsEnabled } from '@/lib/celebrations';
import { setReducedMotion } from '@/test/setup';
import { ADMIN, ALICE, BOB, renderApp, setupMockApi } from '@/test/utils';
import { useCountUp } from './useCountUp';

const user = () => userEvent.setup();
const bursts = () => screen.queryAllByTestId('celebration-burst');

/** Website Redesign → leave exactly one open task in "In progress". */
function oneOpenInProgress() {
  const db = setupMockApi(ADMIN);
  const p = db.projects.find((x) => x.name === 'Website Redesign')!;
  const sec = db.sections.find((s) => s.projectId === p.id && s.name === 'In progress')!;
  const inSec = db.tasks.filter((t) => t.sectionId === sec.id);
  inSec.slice(1).forEach((t) => {
    t.completed = true;
    t.completedAt = new Date().toISOString();
  });
  return { db, p, last: inSec[0] };
}

describe('task completion delight', () => {
  it('shows an Undo toast that reverts the completion', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/list`, { db });
    const u = user();
    await u.click(await screen.findByRole('checkbox', { name: 'Mark "Collect customer logos" complete' }));
    const toast = (await screen.findByText('Completed “Collect customer logos”')).closest('[role="status"]') as HTMLElement;
    expect(toast).toBeInTheDocument();
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Collect customer logos')!.completed).toBe(true));
    await u.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(db.tasks.find((t) => t.title === 'Collect customer logos')!.completed).toBe(false));
    expect(await screen.findByRole('checkbox', { name: 'Mark "Collect customer logos" complete' })).not.toBeChecked();
  });

  it('celebrates when the last open task in a section is completed', async () => {
    const { db, p, last } = oneOpenInProgress();
    renderApp(`/projects/${p.id}/list`, { db });
    expect(bursts()).toHaveLength(0);
    await user().click(await screen.findByRole('checkbox', { name: `Mark "${last.title}" complete` }));
    expect(bursts()).toHaveLength(1);
    expect(screen.getByTestId('celebration-layer')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not celebrate an ordinary completion', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/list`, { db });
    await user().click(await screen.findByRole('checkbox', { name: 'Mark "Collect customer logos" complete' }));
    expect(bursts()).toHaveLength(0);
  });

  it('never celebrates with prefers-reduced-motion', async () => {
    setReducedMotion(true);
    const { db, p, last } = oneOpenInProgress();
    renderApp(`/projects/${p.id}/list`, { db });
    await user().click(await screen.findByRole('checkbox', { name: `Mark "${last.title}" complete` }));
    await waitFor(() => expect(db.tasks.find((t) => t.id === last.id)!.completed).toBe(true));
    expect(bursts()).toHaveLength(0);
  });

  it('respects the Celebrations profile toggle (persisted)', async () => {
    const { db, p, last } = oneOpenInProgress();
    renderApp(`/projects/${p.id}/list`, { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'My profile' }));
    const dialog = await screen.findByRole('dialog', { name: 'My profile' });
    const toggle = within(dialog).getByRole('checkbox', { name: /celebrations/i });
    expect(toggle).toBeChecked();
    await u.click(toggle);
    expect(celebrationsEnabled()).toBe(false);
    expect(localStorage.getItem('mekari-project:celebrations')).toBe('off');
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await u.click(await screen.findByRole('checkbox', { name: `Mark "${last.title}" complete` }));
    await waitFor(() => expect(db.tasks.find((t) => t.id === last.id)!.completed).toBe(true));
    expect(bursts()).toHaveLength(0);
  });

  it('celebrates when a goal is marked ACHIEVED', async () => {
    const db = setupMockApi(BOB);
    const g = db.goals!.find((x) => x.title === 'Make the app fast')!;
    renderApp(`/goals/${g.id}`, { db });
    const u = user();
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Status' }), 'ACHIEVED');
    await u.click(screen.getByRole('button', { name: 'Post update' }));
    await waitFor(() => expect(bursts()).toHaveLength(1));
  });
});

describe('celebration bus', () => {
  it('is a no-op when disabled', () => {
    setCelebrationsEnabled(false);
    renderApp('/login');
    act(() => celebrate());
    expect(bursts()).toHaveLength(0);
  });
});

describe('count-up', () => {
  it('shows the final value on first render and animates changes', async () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v, 50), { initialProps: { v: 10 } });
    expect(result.current).toBe(10);
    rerender({ v: 20 });
    await waitFor(() => expect(result.current).toBe(20));
  });

  it('jumps straight to the value with reduced motion', () => {
    setReducedMotion(true);
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), { initialProps: { v: 1 } });
    rerender({ v: 99 });
    expect(result.current).toBe(99);
  });
});

describe('loading & empty states', () => {
  it('shows a skeleton (announced once) while tasks load', async () => {
    const db = setupMockApi(ALICE);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/list`, { db });
    // The project skeleton or the task skeleton renders before data arrives.
    expect(await screen.findByRole('status', { name: /loading (project|tasks)/i })).toHaveAttribute('aria-busy', 'true');
    await screen.findByRole('table', { name: /website redesign tasks/i });
  });

  it('renders a friendly empty state with an illustration', async () => {
    const db = setupMockApi(ALICE);
    db.notifications = [];
    renderApp('/inbox', { db });
    expect(await screen.findByText('Your inbox is empty')).toBeInTheDocument();
    expect(screen.getByText(/We’ll let you know/)).toBeInTheDocument();
  });
});

describe('panels & dialogs', () => {
  it('opens and closes the task panel and the ⌘K palette (exit completes)', async () => {
    const db = setupMockApi(ADMIN);
    const p = db.projects.find((x) => x.name === 'Website Redesign')!;
    renderApp(`/projects/${p.id}/list`, { db });
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Set up analytics' }));
    const panel = await screen.findByRole('dialog', { name: 'Set up analytics' });
    await u.click(within(panel).getByRole('button', { name: /close task details/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set up analytics' })).not.toBeInTheDocument());

    await u.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('combobox', { name: /search/i })).toHaveFocus();
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox', { name: /search/i })).not.toBeInTheDocument());
  });
});
