import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useProject, useProjectTasks } from '@/api/hooks';
import type { ProjectDetail, ProjectView, Task } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { BoardIcon, CalendarIcon, ListIcon, PlusIcon } from '@/components/icons';
import { EmptyState, ErrorState } from '@/components/PageHeader';
import { FullPageSpinner } from '@/components/Spinner';
import { canEditProjectContent } from '@/lib/permissions';
import type { CompletionFilter } from '@/lib/taskFilters';
import { ListView } from './ListView';

const VIEWS: { key: Lowercase<ProjectView>; label: string; icon: ReactNode }[] = [
  { key: 'list', label: 'List', icon: <ListIcon className="h-3.5 w-3.5" /> },
  { key: 'board', label: 'Board', icon: <BoardIcon className="h-3.5 w-3.5" /> },
  { key: 'calendar', label: 'Calendar', icon: <CalendarIcon className="h-3.5 w-3.5" /> },
];

export type ProjectViewProps = {
  project: ProjectDetail;
  tasks: Task[];
  canEdit: boolean;
  filter: CompletionFilter;
  addingTo: string | null;
  setAddingTo: (id: string | null) => void;
};

function ProjectHeader({ project }: { project: ProjectDetail }) {
  return (
    <header className="border-b border-gray-200 px-6 pt-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: project.color }}
          aria-hidden
        >
          {project.name[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-gray-500">{project.team.name}</p>
          <h1 className="truncate text-xl font-semibold text-gray-900">{project.name}</h1>
        </div>
        <div className="hidden -space-x-1.5 sm:flex" aria-label="Project members">
          {project.members.slice(0, 5).map((m) => (
            <Avatar key={m.user.id} user={m.user} size="sm" className="ring-2 ring-white" />
          ))}
          {project.members.length > 5 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] ring-2 ring-white">
              +{project.members.length - 5}
            </span>
          )}
        </div>
      </div>
      <nav aria-label="Project views" className="mt-3 flex gap-4">
        {VIEWS.map((v) => (
          <NavLink
            key={v.key}
            to={`/projects/${project.id}/${v.key}`}
            className={({ isActive }) =>
              clsx(
                '-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm',
                isActive ? 'border-gray-900 font-medium text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800',
              )
            }
          >
            {v.icon}
            {v.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

export function ProjectPage() {
  const { projectId, view } = useParams();
  const user = useCurrentUser();
  const project = useProject(projectId);
  const tasks = useProjectTasks(projectId);
  const [filter, setFilter] = useState<CompletionFilter>('incomplete');
  const [addingTo, setAddingTo] = useState<string | null>(null);

  if (project.isLoading) return <FullPageSpinner />;
  if (project.isError) {
    if (project.error instanceof ApiError && project.error.status === 404) {
      return <EmptyState title="Project not found">It may have been deleted, or you don’t have access.</EmptyState>;
    }
    return <ErrorState error={project.error} />;
  }
  const p = project.data!;
  if (!view || !VIEWS.some((v) => v.key === view)) {
    return <Navigate to={`/projects/${p.id}/${p.defaultView.toLowerCase()}`} replace />;
  }
  const canEdit = canEditProjectContent(p, user);
  const props: ProjectViewProps = {
    project: p,
    tasks: tasks.data ?? [],
    canEdit,
    filter,
    addingTo,
    setAddingTo,
  };

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={p} />
      <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-2">
        {canEdit && (
          <button
            type="button"
            className="btn-primary py-1"
            onClick={() => setAddingTo(p.sections[0]?.id ?? '')}
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add task
          </button>
        )}
        {!canEdit && <span className="text-xs text-gray-500">You can comment on tasks in this project.</span>}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Show</span>
          <select
            className="rounded border border-gray-300 px-1.5 py-1 text-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value as CompletionFilter)}
          >
            <option value="incomplete">Incomplete tasks</option>
            <option value="completed">Completed tasks</option>
            <option value="all">All tasks</option>
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tasks.isLoading ? (
          <FullPageSpinner />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} />
        ) : view === 'list' ? (
          <ListView {...props} />
        ) : (
          <EmptyState title={`${view[0].toUpperCase()}${view.slice(1)} view`}>Coming soon.</EmptyState>
        )}
      </div>
    </div>
  );
}
