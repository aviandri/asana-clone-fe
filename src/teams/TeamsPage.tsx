import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTeams } from '@/api/hooks';
import { Modal } from '@/components/Modal';
import { EmptyState, ErrorState, PageHeader } from '@/components/PageHeader';
import { FullPageSpinner } from '@/components/Spinner';
import { PlusIcon, UsersIcon } from '@/components/icons';
import { errorMessage } from '@/lib/errors';
import { useTeamMutations } from './useTeamMutations';

function NewTeamDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { create } = useTeamMutations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      { onSuccess: (t) => { onClose(); navigate(`/teams/${t.id}`); } },
    );
  };
  return (
    <Modal open onClose={onClose} title="New team">
      <form onSubmit={submit} className="space-y-4 px-5 pb-5 pt-3">
        <div>
          <label htmlFor="nt-name" className="label">Team name</label>
          <input id="nt-name" autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="nt-desc" className="label">Description <span className="font-normal text-gray-500">(optional)</span></label>
          <textarea id="nt-desc" rows={2} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {create.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(create.error)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}>Create team</button>
        </div>
      </form>
    </Modal>
  );
}

export function TeamsPage() {
  const teams = useTeams();
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Teams"
        icon={<UsersIcon className="h-6 w-6 text-gray-500" />}
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon className="h-3.5 w-3.5" /> New team
          </button>
        }
      />
      {creating && <NewTeamDialog onClose={() => setCreating(false)} />}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {teams.isLoading ? (
          <FullPageSpinner />
        ) : teams.isError ? (
          <ErrorState error={teams.error} />
        ) : teams.data!.length === 0 ? (
          <EmptyState title="No teams yet">Create a team to start organising projects.</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.data!.map((t) => (
              <li key={t.id}>
                <Link to={`/teams/${t.id}`} className="block h-full rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm">
                  <div className="font-semibold">{t.name}</div>
                  {t.description && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{t.description}</p>}
                  <p className="mt-3 text-xs text-gray-500">{t.memberCount} member{t.memberCount === 1 ? '' : 's'}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
