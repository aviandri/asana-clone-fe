import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useProjects } from '@/api/hooks';
import type { GoalDetail, GoalStatus, KeyResult, MetricType, ProgressSource, UpdateKeyResultInput } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { InlineText } from '@/components/InlineText';
import { EmptyState, ErrorState } from '@/components/PageHeader';
import { FullPageSpinner } from '@/components/Spinner';
import { PlusIcon } from '@/components/icons';
import { timeAgo } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatMetric, GOAL_STATUS, GOAL_STATUSES, goalLevelLabel, PROGRESS_SOURCE_LABEL } from '@/lib/goals';
import { periodLabel } from '@/lib/periods';
import { celebrate } from '@/lib/celebrations';
import { AssigneeField } from '@/tasks/fields';
import { ProgressBar, StatusPill } from './GoalBits';
import { NewGoalDialog } from './NewGoalDialog';
import { useGoal, useGoalMutations, useGoals, useGoalUpdates, useKeyResultMutations } from './useGoals';
import { useFollowWorkspace } from '@/workspace/useWorkspace';

function Section({ title, action, children, label }: { title: string; action?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-700">
      {errorMessage(error)}
    </p>
  );
}

/** Numeric current-value editor: commits on Enter or blur, Escape reverts. */
function KrValueInput({ kr, onCommit, disabled }: { kr: KeyResult; onCommit: (v: number) => void; disabled: boolean }) {
  const [draft, setDraft] = useState(String(kr.currentValue));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(String(kr.currentValue));
  }, [kr.currentValue]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) return setDraft(String(kr.currentValue));
    if (n !== kr.currentValue) onCommit(n);
  };
  return (
    <input
      ref={ref}
      type="number"
      step="any"
      inputMode="decimal"
      aria-label={`${kr.title} current value`}
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(String(kr.currentValue));
          ref.current?.blur();
        }
      }}
      className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums focus:border-primary-500 focus:outline-none disabled:border-transparent disabled:bg-transparent"
    />
  );
}

function KeyResultRow({ kr, goal }: { kr: KeyResult; goal: GoalDetail }) {
  const me = useCurrentUser();
  const m = useKeyResultMutations(goal.id);
  const canEditAll = goal.canEdit;
  const canUpdateValue = goal.canEdit || kr.owner?.id === me.id;
  const update = (patch: UpdateKeyResultInput) => m.update.mutate({ id: kr.id, ...patch });
  return (
    <li className="group border-b border-gray-100 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <InlineText
            label={`Key result title: ${kr.title}`}
            value={kr.title}
            disabled={!canEditAll}
            onCommit={(title) => update({ title })}
            className="-ml-1 w-full text-sm font-medium"
          />
          <div className="text-xs text-gray-500">
            {kr.metricType === 'BOOLEAN'
              ? 'Done / not done'
              : `${formatMetric(kr.startValue, kr)} → ${formatMetric(kr.targetValue, kr)}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {kr.metricType === 'BOOLEAN' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`${kr.title} current value`}
                className="h-4 w-4 rounded border-gray-300"
                checked={kr.currentValue >= 1}
                disabled={!canUpdateValue}
                onChange={(e) => update({ currentValue: e.target.checked ? 1 : 0 })}
              />
              <span aria-hidden>{kr.currentValue >= 1 ? 'Done' : 'Not done'}</span>
            </label>
          ) : (
            <>
              <KrValueInput kr={kr} disabled={!canUpdateValue} onCommit={(currentValue) => update({ currentValue })} />
              <span className="text-xs text-gray-500">/ {formatMetric(kr.targetValue, kr)}</span>
            </>
          )}
        </div>
        <span className="w-32">
          <ProgressBar value={kr.progress} label={`${kr.title} progress`} />
        </span>
        {canEditAll ? (
          <AssigneeField assignee={kr.owner} onChange={(u) => m.update.mutateAsync({ id: kr.id, ownerId: u?.id ?? null })} />
        ) : (
          <Avatar user={kr.owner} size="sm" />
        )}
        {canEditAll && (
          <button
            type="button"
            aria-label={`Delete key result ${kr.title}`}
            className="text-xs text-red-600 opacity-0 hover:underline focus:opacity-100 group-hover:opacity-100"
            onClick={() => window.confirm(`Delete key result “${kr.title}”?`) && m.remove.mutate(kr.id)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function AddKeyResultForm({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const m = useKeyResultMutations(goalId);
  const [title, setTitle] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('NUMBER');
  const [start, setStart] = useState('0');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const boolean = metricType === 'BOOLEAN';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || (!boolean && target === '')) return;
    m.add.mutate(
      {
        title: title.trim(),
        metricType,
        ...(boolean ? { targetValue: 1 } : { startValue: Number(start) || 0, targetValue: Number(target), unit: unit.trim() || (metricType === 'PERCENT' ? '%' : null) }),
      },
      { onSuccess: onDone },
    );
  };
  return (
    <form onSubmit={submit} aria-label="New key result" className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <div>
          <label htmlFor="kr-title" className="label">Key result</label>
          <input id="kr-title" autoFocus className="input bg-white" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Weekly active users" />
        </div>
        <div>
          <label htmlFor="kr-type" className="label">Measured as</label>
          <select id="kr-type" className="input bg-white" value={metricType} onChange={(e) => setMetricType(e.target.value as MetricType)}>
            <option value="NUMBER">Number</option>
            <option value="PERCENT">Percent</option>
            <option value="CURRENCY">Currency</option>
            <option value="BOOLEAN">Done / not done</option>
          </select>
        </div>
      </div>
      {!boolean && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="kr-start" className="label">Start</label>
            <input id="kr-start" type="number" step="any" className="input bg-white" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label htmlFor="kr-target" className="label">Target</label>
            <input id="kr-target" type="number" step="any" className="input bg-white" value={target} onChange={(e) => setTarget(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="kr-unit" className="label">Unit</label>
            <input
              id="kr-unit"
              className="input bg-white"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={metricType === 'CURRENCY' ? 'USD' : metricType === 'PERCENT' ? '%' : 'e.g. users'}
            />
          </div>
        </div>
      )}
      <InlineError error={m.add.error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!title.trim() || (!boolean && target === '') || m.add.isPending}>
          Add key result
        </button>
      </div>
    </form>
  );
}

function StatusUpdates({ goal, canPost }: { goal: GoalDetail; canPost: boolean }) {
  const updates = useGoalUpdates(goal.id);
  const { postUpdate } = useGoalMutations(goal.id);
  const [status, setStatus] = useState<GoalStatus>(goal.status === 'NO_STATUS' ? 'ON_TRACK' : goal.status);
  const [body, setBody] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    postUpdate.mutate({ status, body: body.trim() || null }, { onSuccess: () => setBody('') });
  };
  return (
    <Section title="Status updates">
      {canPost && (
        <form onSubmit={submit} aria-label="Post a status update" className="mb-4 space-y-2 rounded-lg border border-gray-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="gu-status" className="text-sm text-gray-600">
              Status
            </label>
            <select id="gu-status" className="rounded border border-gray-300 px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
              {GOAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {GOAL_STATUS[s].label}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">Progress {Math.round(goal.progress)}% will be recorded.</span>
          </div>
          <textarea
            aria-label="Status update"
            rows={2}
            className="input"
            placeholder="What changed since the last update?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <InlineError error={postUpdate.error} />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={postUpdate.isPending}>
              Post update
            </button>
          </div>
        </form>
      )}
      {updates.isLoading ? null : (updates.data ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">No status updates yet.</p>
      ) : (
        <ol aria-label="Update history" className="space-y-3">
          {updates.data!.map((u) => (
            <li key={u.id} className="flex gap-3">
              <Avatar user={u.author} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{u.author.name}</span>
                  <StatusPill status={u.status} />
                  <span className="text-xs text-gray-500">{Math.round(u.progress)}% · {timeAgo(u.createdAt)}</span>
                </div>
                {u.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800">{u.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function LinkedProjects({ goal }: { goal: GoalDetail }) {
  const m = useGoalMutations(goal.id);
  const projects = useProjects({ archived: false });
  const linkable = (projects.data ?? []).filter((p) => !goal.projects.some((l) => l.project.id === p.id));
  const [pick, setPick] = useState('');
  return (
    <Section title="Linked projects" label="Linked projects">
      {goal.projects.length === 0 && goal.hiddenProjectCount === 0 ? (
        <p className="text-sm text-gray-500">No linked projects.{goal.progressSource === 'PROJECTS' && ' Progress is 0% until a project is linked.'}</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {goal.projects.map(({ project, total, completed }) => (
            <li key={project.id} className="flex items-center gap-3 px-3 py-2">
              <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: project.color }} aria-hidden />
              <Link to={`/projects/${project.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {project.name}
              </Link>
              <span className="text-xs text-gray-500">
                {completed}/{total} tasks
              </span>
              <span className="w-28">
                <ProgressBar value={total ? (completed / total) * 100 : 0} label={`${project.name} completion`} />
              </span>
              {goal.canEdit && (
                <button type="button" className="text-xs text-red-600 hover:underline" aria-label={`Unlink ${project.name}`} onClick={() => m.unlinkProject.mutate(project.id)}>
                  Unlink
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {goal.hiddenProjectCount > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          + {goal.hiddenProjectCount} linked project{goal.hiddenProjectCount === 1 ? '' : 's'} you don’t have access to (still counted in progress).
        </p>
      )}
      {goal.canEdit && linkable.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select aria-label="Project to link" className="rounded border border-gray-300 px-2 py-1 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a project…</option>
            {linkable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary py-1" disabled={!pick} onClick={() => m.linkProject.mutate(pick, { onSuccess: () => setPick('') })}>
            Link project
          </button>
        </div>
      )}
      <InlineError error={m.linkProject.error ?? m.unlinkProject.error} />
    </Section>
  );
}

function ManualProgressInput({ goal, onCommit }: { goal: GoalDetail; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(goal.progress));
  useEffect(() => setDraft(String(goal.progress)), [goal.progress]);
  const commit = () => {
    const n = Math.max(0, Math.min(100, Number(draft)));
    if (Number.isFinite(n) && n !== goal.progress) onCommit(n);
    else setDraft(String(goal.progress));
  };
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      Manual progress
      <input
        type="number"
        min={0}
        max={100}
        step="any"
        aria-label="Manual progress"
        className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      %
    </label>
  );
}

function ParentPicker({ goal }: { goal: GoalDetail }) {
  const goals = useGoals(goal.timePeriod);
  const { update } = useGoalMutations(goal.id);
  // Exclude the goal itself and its descendants (would create a cycle).
  const options = useMemo(() => {
    const list = goals.data ?? [];
    const banned = new Set([goal.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of list) {
        if (g.parentId && banned.has(g.parentId) && !banned.has(g.id)) {
          banned.add(g.id);
          grew = true;
        }
      }
    }
    return list.filter((g) => !banned.has(g.id));
  }, [goals.data, goal.id]);
  return (
    <select
      aria-label="Parent goal"
      className="max-w-[16rem] rounded border border-gray-300 px-2 py-0.5 text-xs"
      value={goal.parentId ?? ''}
      onChange={(e) => update.mutate({ parentId: e.target.value || null })}
    >
      <option value="">No parent (top-level)</option>
      {goal.parent && !options.some((o) => o.id === goal.parent!.id) && <option value={goal.parent.id}>{goal.parent.title}</option>}
      {options.map((g) => (
        <option key={g.id} value={g.id}>
          {g.title}
        </option>
      ))}
    </select>
  );
}

export function GoalDetailPage() {
  const { goalId } = useParams();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const goal = useGoal(goalId);
  const m = useGoalMutations(goalId);
  useFollowWorkspace(goal.data?.workspaceId, 'goal');
  const [addingKr, setAddingKr] = useState(false);
  const [addingSub, setAddingSub] = useState(false);

  // Celebrate when a goal crosses into 100% or ACHIEVED while you're looking at it (not on load).
  const seen = useRef<{ id: string; progress: number; status: string } | null>(null);
  const data = goal.data;
  useEffect(() => {
    if (!data) return;
    const prev = seen.current;
    seen.current = { id: data.id, progress: data.progress, status: data.status };
    if (!prev || prev.id !== data.id) return;
    if ((prev.progress < 100 && data.progress >= 100) || (prev.status !== 'ACHIEVED' && data.status === 'ACHIEVED')) celebrate();
  }, [data]);

  if (goal.isLoading) return <FullPageSpinner />;
  if (goal.isError) {
    return goal.error instanceof ApiError && goal.error.status === 404 ? (
      <EmptyState illustration="search" title="Goal not found">
        <Link to="/goals" className="btn-secondary mt-2">
          Back to goals
        </Link>
      </EmptyState>
    ) : (
      <ErrorState error={goal.error} />
    );
  }
  const g = goal.data!;
  const canPost = g.canEdit || g.keyResults.some((k) => k.owner?.id === me.id);

  return (
    <div className="h-full overflow-y-auto">
      {addingSub && <NewGoalDialog defaultPeriod={g.timePeriod} defaultParentId={g.id} onClose={() => setAddingSub(false)} />}
      <div className="mx-auto max-w-4xl px-6 py-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
          <Link to={`/goals?period=${encodeURIComponent(g.timePeriod)}`} className="hover:underline">
            Goals
          </Link>
          <span aria-hidden>›</span>
          {g.canEdit ? (
            <span className="flex items-center gap-1">
              Aligned to <ParentPicker goal={g} />
            </span>
          ) : g.parent ? (
            <Link to={`/goals/${g.parent.id}`} className="hover:underline">
              {g.parent.title}
            </Link>
          ) : (
            <span>Top-level goal</span>
          )}
          {g.parent && g.canEdit && (
            <Link to={`/goals/${g.parent.id}`} className="ml-1 text-xs hover:underline">
              Open parent ›
            </Link>
          )}
        </nav>

        <div className="mt-2 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="sr-only">{g.title}</h1>
            <InlineText label="Goal title" value={g.title} disabled={!g.canEdit} onCommit={(title) => m.update.mutate({ title })} className="-ml-1 w-full text-2xl font-semibold" />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{goalLevelLabel(g)}</span>
              <span>{periodLabel(g.timePeriod)}</span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                Owner
                {g.canEdit ? (
                  <AssigneeField variant="field" assignee={g.owner} onChange={(u) => u && m.update.mutateAsync({ ownerId: u.id })} />
                ) : (
                  <>
                    <Avatar user={g.owner} size="xs" /> {g.owner.name}
                  </>
                )}
              </span>
            </div>
          </div>
          {g.canEdit && (
            <button
              type="button"
              className="btn-ghost text-red-600"
              onClick={() => {
                const kids = g.childCount ? ` Its ${g.childCount} sub-goal(s) will become top-level.` : '';
                if (window.confirm(`Delete “${g.title}”?${kids}`)) m.remove.mutate(undefined, { onSuccess: () => navigate(`/goals?period=${encodeURIComponent(g.timePeriod)}`) });
              }}
            >
              Delete goal
            </button>
          )}
        </div>

        {g.description !== null || g.canEdit ? (
          <InlineText
            label="Goal description"
            value={g.description ?? ''}
            allowEmpty
            disabled={!g.canEdit}
            placeholder="Add a description"
            onCommit={(d) => m.update.mutate({ description: d || null })}
            className="-ml-1 mt-2 w-full text-sm text-gray-700"
          />
        ) : null}

        <div className="mt-6 rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={g.status} />
            <ProgressBar value={g.progress} label="Goal progress" size="lg" className="min-w-[12rem] flex-1" delayMs={120} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Measure progress by
              <select
                aria-label="Measure progress by"
                className="rounded border border-gray-300 px-2 py-1 text-sm"
                value={g.progressSource}
                disabled={!g.canEdit}
                onChange={(e) => m.update.mutate({ progressSource: e.target.value as ProgressSource })}
              >
                {(Object.keys(PROGRESS_SOURCE_LABEL) as ProgressSource[]).map((s) => (
                  <option key={s} value={s}>
                    {PROGRESS_SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            {g.progressSource === 'MANUAL' && g.canEdit && <ManualProgressInput goal={g} onCommit={(manualProgress) => m.update.mutate({ manualProgress })} />}
            {g.parent && (
              <label className="flex items-center gap-2 text-sm text-gray-600" title="How much this goal counts toward its parent when the parent rolls up sub-goals">
                Weight
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="Weight"
                  disabled={!g.canEdit}
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                  defaultValue={g.weight}
                  key={g.weight}
                  onBlur={(e) => {
                    const w = Math.max(1, Math.round(Number(e.target.value)));
                    if (w !== g.weight) m.update.mutate({ weight: w });
                  }}
                />
              </label>
            )}
          </div>
          <InlineError error={m.update.error} />
          {!g.canEdit && <p className="mt-2 text-xs text-gray-500">Only the owner, the goal’s team or an admin can edit this goal.</p>}
        </div>

        <Section
          title="Key results"
          action={
            g.canEdit && !addingKr ? (
              <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setAddingKr(true)}>
                <PlusIcon className="h-3.5 w-3.5" /> Add key result
              </button>
            ) : undefined
          }
        >
          {g.keyResults.length === 0 && !addingKr ? (
            <p className="text-sm text-gray-500">
              No key results yet.{g.progressSource === 'KEY_RESULTS' && ' Add measurable outcomes to track progress.'}
            </p>
          ) : (
            <ul aria-label="Key results" className={clsx(g.keyResults.length > 0 && 'rounded-lg border border-gray-200 px-3')}>
              {g.keyResults.map((kr) => (
                <KeyResultRow key={kr.id} kr={kr} goal={g} />
              ))}
            </ul>
          )}
          {addingKr && <AddKeyResultForm goalId={g.id} onDone={() => setAddingKr(false)} />}
        </Section>

        <Section
          title="Sub-goals"
          action={
            <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setAddingSub(true)}>
              <PlusIcon className="h-3.5 w-3.5" /> Add sub-goal
            </button>
          }
        >
          {g.children.length === 0 ? (
            <p className="text-sm text-gray-500">No sub-goals aligned to this goal.</p>
          ) : (
            <ul aria-label="Sub-goals" className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {g.children.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <Link to={`/goals/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                    {c.title}
                  </Link>
                  <Avatar user={c.owner} size="xs" />
                  <span className="hidden w-32 sm:block">
                    <ProgressBar value={c.progress} label={`${c.title} progress`} />
                  </span>
                  <StatusPill status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <LinkedProjects goal={g} />
        <StatusUpdates key={g.id} goal={g} canPost={canPost} />
      </div>
    </div>
  );
}
