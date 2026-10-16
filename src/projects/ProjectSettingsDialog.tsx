import clsx from 'clsx';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Privacy, ProjectDetail, ProjectRole, ProjectView } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { ColorPicker } from '@/components/ColorPicker';
import { Modal } from '@/components/Modal';
import { Popover } from '@/components/Popover';
import { PlusIcon } from '@/components/icons';
import { errorMessage } from '@/lib/errors';
import { canManageProject } from '@/lib/permissions';
import { UserPickerList } from '@/tasks/fields';
import { useProjectMutations } from './useProjectMutations';

const ROLE_LABEL: Record<ProjectRole, string> = { OWNER: 'Owner', EDITOR: 'Editor', COMMENTER: 'Commenter' };

function GeneralTab({ project, canManage, onDeleted }: { project: ProjectDetail; canManage: boolean; onDeleted: () => void }) {
  const m = useProjectMutations(project.id);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [color, setColor] = useState(project.color);
  const [privacy, setPrivacy] = useState<Privacy>(project.privacy);
  const [view, setView] = useState<ProjectView>(project.defaultView);
  const [saved, setSaved] = useState(false);
  const dirty =
    name.trim() !== project.name ||
    (description.trim() || null) !== project.description ||
    color !== project.color ||
    privacy !== project.privacy ||
    view !== project.defaultView;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    m.update.mutate(
      { name: name.trim(), description: description.trim() || null, color, privacy, defaultView: view },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-4" onChange={() => setSaved(false)}>
        <fieldset disabled={!canManage} className="space-y-4">
          <div>
            <label htmlFor="ps-name" className="label">Project name</label>
            <input id="ps-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="ps-desc" className="label">Description</label>
            <textarea id="ps-desc" rows={3} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ps-privacy" className="label">Privacy</label>
              <select id="ps-privacy" className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)}>
                <option value="TEAM">Team members</option>
                <option value="PUBLIC">Everyone</option>
                <option value="PRIVATE">Only invited members</option>
              </select>
            </div>
            <div>
              <label htmlFor="ps-view" className="label">Default view</label>
              <select id="ps-view" className="input" value={view} onChange={(e) => setView(e.target.value as ProjectView)}>
                <option value="LIST">List</option>
                <option value="BOARD">Board</option>
                <option value="CALENDAR">Calendar</option>
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="label">Color</legend>
            <ColorPicker value={color} onChange={(c) => { setColor(c); setSaved(false); }} />
          </fieldset>
        </fieldset>
        {m.update.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(m.update.error)}</p>}
        {canManage && (
          <div className="flex items-center justify-end gap-3">
            {saved && !dirty && <span role="status" className="text-sm text-green-700">Saved</span>}
            <button type="submit" className="btn-primary" disabled={!dirty || m.update.isPending}>Save changes</button>
          </div>
        )}
        {!canManage && <p className="text-sm text-gray-500">Only the project owner or an admin can change settings.</p>}
      </form>

      {canManage && (
        <div className="space-y-3 rounded-lg border border-red-200 p-4">
          <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-gray-600">
              {project.archived ? 'This project is archived and hidden from the sidebar.' : 'Archive to hide it from the sidebar. You can restore it later.'}
            </p>
            <button type="button" className="btn-secondary" onClick={() => m.update.mutate({ archived: !project.archived })}>
              {project.archived ? 'Unarchive' : 'Archive'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-gray-600">Delete the project and all of its tasks. This can’t be undone.</p>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" and all its tasks? This can’t be undone.`)) {
                  m.remove.mutate(undefined, { onSuccess: onDeleted });
                }
              }}
            >
              Delete project
            </button>
          </div>
          {m.remove.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(m.remove.error)}</p>}
        </div>
      )}
    </div>
  );
}

function MembersTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const m = useProjectMutations(project.id);
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState<ProjectRole>('EDITOR');
  const error = m.addMember.error ?? m.updateMember.error ?? m.removeMember.error;
  const clearErrors = () => {
    m.addMember.reset();
    m.updateMember.reset();
    m.removeMember.reset();
  };

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        {project.privacy === 'PRIVATE'
          ? 'Only these members can see this project.'
          : project.privacy === 'TEAM'
            ? `Everyone in ${project.team.name} can see this project. Members below have explicit roles.`
            : 'Everyone can see this project. Members below have explicit roles.'}
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(error)}
        </p>
      )}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" aria-label="Project members">
        {project.members.map(({ user, role }) => (
          <li key={user.id} className="flex items-center gap-3 px-3 py-2">
            <Avatar user={user} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-gray-500">{user.email}</div>
            </div>
            {canManage ? (
              <>
                <select
                  aria-label={`Role for ${user.name}`}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                  value={role}
                  onChange={(e) => {
                    clearErrors();
                    m.updateMember.mutate({ userId: user.id, role: e.target.value as ProjectRole });
                  }}
                >
                  {(Object.keys(ROLE_LABEL) as ProjectRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  aria-label={`Remove ${user.name}`}
                  onClick={() => {
                    clearErrors();
                    m.removeMember.mutate(user.id);
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="text-sm text-gray-600">{ROLE_LABEL[role]}</span>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="mt-3 flex items-center gap-2">
          <span className="relative">
            <button type="button" className="btn-secondary" onClick={() => setAdding((a) => !a)}>
              <PlusIcon className="h-3.5 w-3.5" /> Add member
            </button>
            <Popover open={adding} onClose={() => setAdding(false)} placement="top">
              <UserPickerList
                allowNone={false}
                excludeIds={project.members.map((x) => x.user.id)}
                onPick={(u) => {
                  setAdding(false);
                  clearErrors();
                  if (u) m.addMember.mutate({ userId: u.id, role: newRole });
                }}
              />
            </Popover>
          </span>
          <label className="flex items-center gap-1 text-sm text-gray-600">
            as
            <select aria-label="Role for new member" className="rounded border border-gray-300 px-2 py-1 text-sm" value={newRole} onChange={(e) => setNewRole(e.target.value as ProjectRole)}>
              {(Object.keys(ROLE_LABEL) as ProjectRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

export function ProjectSettingsDialog({
  project,
  open,
  onClose,
  initialTab = 'general',
}: {
  project: ProjectDetail;
  open: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'members';
}) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const canManage = canManageProject(project, me);
  const [tab, setTab] = useState(initialTab);
  return (
    <Modal open={open} onClose={onClose} title="Project settings" className="max-w-lg">
      <div className="px-5 pb-5">
        <div role="tablist" aria-label="Settings sections" className="mb-4 flex gap-4 border-b border-gray-200">
          {(['general', 'members'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={clsx('-mb-px border-b-2 px-1 pb-2 pt-2 text-sm', tab === t ? 'border-gray-900 font-medium' : 'border-transparent text-gray-500')}
            >
              {t === 'general' ? 'General' : `Members (${project.members.length})`}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'general' ? (
            <GeneralTab
              project={project}
              canManage={canManage}
              onDeleted={() => {
                onClose();
                navigate('/', { replace: true });
              }}
            />
          ) : (
            <MembersTab project={project} canManage={canManage} />
          )}
        </div>
      </div>
    </Modal>
  );
}
