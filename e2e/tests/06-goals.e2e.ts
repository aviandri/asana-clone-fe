import { currentQuarter, expect, test, uniq } from '../fixtures';

test('creates a goal aligned to a parent and updates a key result', async ({ authedPage: page, api }) => {
  const period = currentQuarter();
  // Personal goals: any user may create them (SPEC §10 permissions).
  const parent = await api.createGoal({ title: uniq('E2E objective'), timePeriod: period });
  const childTitle = uniq('E2E sub-goal');
  let childId: string | undefined;

  try {
    // ---- Create a sub-goal from the UI, aligned to the parent ----
    await page.goto('/goals');
    await page.getByRole('button', { name: 'New goal', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New goal' });
    await dialog.getByLabel('Goal title').fill(childTitle);
    // Time period defaults to the current quarter, like the page filter.
    await dialog.getByLabel('Parent goal').selectOption({ label: parent.title });
    await dialog.getByRole('button', { name: 'Create goal', exact: true }).click();
    await expect(dialog).toBeHidden();

    // The tree nests the new goal under its parent.
    const tree = page.getByRole('tree', { name: 'Goals' });
    const parentItem = tree.getByRole('treeitem', { name: parent.title, exact: true });
    await expect(parentItem.getByRole('treeitem', { name: childTitle, exact: true })).toBeVisible();

    const child = await api.findGoalByTitle(childTitle);
    expect(child?.parentId).toBe(parent.id);
    childId = child!.id;

    // ---- Update a key result's current value on the goal detail ----
    const kr = await api.createKeyResult(childId, {
      title: uniq('Signups'),
      metricType: 'NUMBER',
      startValue: 0,
      targetValue: 200,
    });
    await page.goto(`/goals/${childId}`);
    const current = page.getByLabel(`${kr.title} current value`);
    await current.fill('50');
    await current.press('Enter');

    // KEY_RESULTS progress = mean KR progress = (50 - 0) / (200 - 0) = 25%.
    await expect
      .poll(async () => {
        const g = await api.getGoal(childId!);
        return [g.keyResults[0]?.currentValue, g.progress];
      })
      .toEqual([50, 25]);
    await page.reload();
    await expect(page.getByLabel(`${kr.title} current value`)).toHaveValue('50');
  } finally {
    if (childId) await api.deleteGoal(childId);
    await api.deleteGoal(parent.id);
  }
});
