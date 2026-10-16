import { useMemo, useState, type FormEvent } from 'react';
import type { GoalDetail, ProgressSource } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Modal } from '@/components/Modal';
import { errorMessage } from '@/lib/errors';
import { depthOf, MAX_GOAL_DEPTH, PROGRESS_SOURCE_LABEL } from '@/lib/goals';
import { currentQuarter, defaultPeriods, periodLabel, sortPeriods } from '@/lib/periods';
import { useCreatableTeams } from '@/teams/useCreatableTeams';
import { useGoalMutations, useGoals, useTimePeriods } from './useGoals';

/** "personal" | "company" | "team:<id>" */
type Level = string;

export function NewGoalDialog({
  onClose,
  onCreated,
  defaultPeriod,
  defaultParentId,
}: {
  onClose: () => void;
  onCreated?: (g: GoalDetail) => void;
  defaultPeriod?: string;
  defaultParentId?: string;
}) {
  const me = useCurrentUser();
  const teams = useCreatableTeams();
  const periods = useTimePeriods();
  const { create } = useGoalMutations();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState(defaultPeriod ?? currentQuarter());
  const [parentId, setParentId] = useState(defaultParentId ?? '');
  const [level, setLevel] = useState<Level>('personal');
  const [source, setSource] = useState<ProgressSource>('KEY_RESULTS');
  const goals = useGoals(period);

  const periodOptions = useMemo(
    () => sortPeriods([...(periods.data ?? []), ...defaultPeriods(), period]),
    [periods.data, period],
  );
  const parentOptions = useMemo(() => {
    const list = goals.data ?? [];
    return list.map((g) => ({ goal: g, tooDeep: depthOf(list, g.id) >= MAX_GOAL_DEPTH }));
  }, [goals.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        timePeriod: period,
        parentId: parentId || null,
        isCompany: level === 'company',
        teamId: level.startsWith('team:') ? level.slice(5) : null,
        progressSource: source,
      },
      {
        onSuccess: (g) => {
          onCreated?.(g);
          onClose();
        },
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="New goal" className="max-w-lg">
      <form onSubmit={submit} className="space-y-4 px-5 pb-5 pt-3">
        <div>
          <label htmlFor="ng-title" className="label">Goal title</label>
          <input id="ng-title" autoFocus className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Grow weekly active users" />
        </div>
        <div>
          <label htmlFor="ng-desc" className="label">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea id="ng-desc" rows={2} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ng-level" className="label">Level</label>
            <select id="ng-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="personal">Personal</option>
              {(teams.data ?? []).map((t) => (
                <option key={t.id} value={`team:${t.id}`}>
                  Team: {t.name}
                </option>
              ))}
              {me.role === 'ADMIN' && <option value="company">Company</option>}
            </select>
          </div>
          <div>
            <label htmlFor="ng-period" className="label">Time period</label>
            <select
              id="ng-period"
              className="input"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setParentId(''); // parents are listed per period
              }}
            >
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="ng-parent" className="label">Parent goal</label>
          <select id="ng-parent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">No parent (top-level)</option>
            {parentOptions.map(({ goal, tooDeep }) => (
              <option key={goal.id} value={goal.id} disabled={tooDeep}>
                {tooDeep ? `${goal.title} (max depth)` : goal.title}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Align this goal to a parent to cascade progress upward.</p>
        </div>
        <div>
          <label htmlFor="ng-source" className="label">Measure progress by</label>
          <select id="ng-source" className="input" value={source} onChange={(e) => setSource(e.target.value as ProgressSource)}>
            {(Object.keys(PROGRESS_SOURCE_LABEL) as ProgressSource[]).map((s) => (
              <option key={s} value={s}>
                {PROGRESS_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {create.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(create.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create goal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
