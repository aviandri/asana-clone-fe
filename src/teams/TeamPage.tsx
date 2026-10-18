import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { teamsApi } from '@/api/endpoints';
import { useProjects } from '@/api/hooks';
import { qk } from '@/api/queryKeys';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { InlineText } from '@/components/InlineText';
import { EmptyState, ErrorState } from '@/components/PageHeader';
import { Popover } from '@/components/Popover';
import { FullPageSpinner } from '@/components/Spinner';
import { PlusIcon } from '@/components/icons';
import { errorMessage } from '@/lib/errors';
import { NewProjectDialog } from '@/projects/NewProjectDialog';
import { UserPickerList } from '@/tasks/fields';
import { useTeamMutations } from './useTeamMutations';

export function TeamPage() {
  const { teamId = '' } = useParams();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const team = useQuery({ queryKey: qk.team(teamId), queryFn: () => teamsApi.get(teamId) });
  const projects = useProjects({ teamId, archived: false });
  const m = useTeamMutations(teamId);
  const [adding, setAdding] = useState(false);
  const [newProject, setNewProject] = useState(false);

  if (team.isLoading) return <FullPageSpinner />;
  if (team.isError) {
    return team.error instanceof ApiError && team.error.status === 404 ? <EmptyState illustration="search" title="Team not found" /> : <ErrorState error={team.error} />;
  }
  const t = team.data!;
  const isMember = t.members.some((u) => u.id === me.id);
  const canEdit = isMember || me.role === 'ADMIN';
  const error = m.update.error ?? m.addMember.error ?? m.removeMember.error ?? m.remove.error;

  return (
    <div className="h-full overflow-y-auto">
      {newProject && <NewProjectDialog open teamId={t.id} onClose={() => setNewProject(false)} />}
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <InlineText label="Team name" value={t.name} disabled={!canEdit} onCommit={(name) => m.update.mutate({ name })} className="-ml-1 w-full text-2xl font-semibold" />
            <InlineText
              label="Team description"
              value={t.description ?? ''}
              allowEmpty
              placeholder={canEdit ? 'Add a description' : ''}
              disabled={!canEdit}
              onCommit={(d) => m.update.mutate({ description: d || null })}
              className="-ml-1 mt-1 w-full text-sm text-gray-600"
            />
          </div>
          {!isMember && (
            <button type="button" className="btn-secondary" onClick={() => m.addMember.mutate(me.id)}>
              Join team
            </button>
          )}
          {isMember && (
            <button type="button" className="btn-ghost" onClick={() => window.confirm(`Leave ${t.name}?`) && m.removeMember.mutate(me.id)}>
              Leave team
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(error)}</p>}

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_18rem]">
          <section aria-labelledby="team-projects">
            <div className="mb-3 flex items-center">
              <h2 id="team-projects" className="flex-1 font-semibold">Projects</h2>
              {(isMember || me.role === 'ADMIN') && (
                <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setNewProject(true)}>
                  <PlusIcon className="h-3.5 w-3.5" /> New project
                </button>
              )}
            </div>
            {(projects.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No projects you can see in this team.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {projects.data!.map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                      <span className="h-8 w-8 shrink-0 rounded-lg" style={{ backgroundColor: p.color }} aria-hidden />
                      <span className="truncate text-sm font-medium">{p.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="team-members">
            <div className="mb-3 flex items-center">
              <h2 id="team-members" className="flex-1 font-semibold">Members ({t.members.length})</h2>
              {canEdit && (
                <span className="relative">
                  <button type="button" aria-label="Add team member" className="btn-ghost p-1" onClick={() => setAdding((a) => !a)}>
                    <PlusIcon />
                  </button>
                  <Popover open={adding} onClose={() => setAdding(false)} align="right">
                    <UserPickerList
                      noGuests
                      allowNone={false}
                      excludeIds={t.members.map((u) => u.id)}
                      onPick={(u) => {
                        setAdding(false);
                        if (u) m.addMember.mutate(u.id);
                      }}
                    />
                  </Popover>
                </span>
              )}
            </div>
            <ul className="space-y-1" aria-label="Team members">
              {t.members.map((u) => (
                <li key={u.id} className="group flex items-center gap-2 rounded px-1 py-1">
                  <Avatar user={u} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                  {canEdit && u.id !== me.id && (
                    <button type="button" aria-label={`Remove ${u.name}`} className="text-xs text-red-600 opacity-0 hover:underline focus:opacity-100 group-hover:opacity-100" onClick={() => m.removeMember.mutate(u.id)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {me.role === 'ADMIN' && (
          <div className="mt-10 border-t border-gray-200 pt-6">
            <button
              type="button"
              className="btn-danger"
              onClick={() => window.confirm(`Delete team ${t.name}?`) && m.remove.mutate(undefined, { onSuccess: () => navigate('/teams') })}
            >
              Delete team
            </button>
            <p className="mt-1 text-xs text-gray-500">Teams that still have projects can’t be deleted.</p>
          </div>
        )}
      </div>
    </div>
  );
}
