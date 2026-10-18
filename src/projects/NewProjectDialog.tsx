import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Privacy, ProjectView } from '@/api/types';
import { Modal } from '@/components/Modal';
import { ColorPicker } from '@/components/ColorPicker';
import { PROJECT_COLORS } from '@/lib/colors';
import { errorMessage } from '@/lib/errors';
import { useCreatableTeams } from '@/teams/useCreatableTeams';
import { useCreateProject } from './useProjectMutations';

export function NewProjectDialog({ open, onClose, teamId }: { open: boolean; onClose: () => void; teamId?: string }) {
  const navigate = useNavigate();
  const teams = useCreatableTeams();
  const create = useCreateProject();
  const [name, setName] = useState('');
  const [team, setTeam] = useState(teamId ?? '');
  const [color, setColor] = useState(PROJECT_COLORS[8]);
  const [privacy, setPrivacy] = useState<Privacy>('TEAM');
  const [view, setView] = useState<ProjectView>('LIST');
  const [description, setDescription] = useState('');
  const selectedTeam = team || teams.data?.[0]?.id || '';

  const reset = () => {
    setName('');
    setDescription('');
    create.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedTeam) return;
    create.mutate(
      { teamId: selectedTeam, name: name.trim(), description: description.trim() || undefined, color, privacy, defaultView: view },
      {
        onSuccess: (p) => {
          close();
          navigate(`/projects/${p.id}/${p.defaultView.toLowerCase()}`);
        },
      },
    );
  };

  const noTeams = teams.isSuccess && teams.data.length === 0;
  return (
    <Modal open={open} onClose={close} title="New project">
      <form onSubmit={onSubmit} className="space-y-4 px-5 pb-5 pt-3">
        <div>
          <label htmlFor="np-name" className="label">
            Project name
          </label>
          <input id="np-name" className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="np-team" className="label">
            Team
          </label>
          <select id="np-team" className="input" value={selectedTeam} onChange={(e) => setTeam(e.target.value)} disabled={noTeams}>
            {(teams.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {noTeams && <p className="mt-1 text-xs text-gray-500">Join or create a team first.</p>}
        </div>
        <div>
          <label htmlFor="np-desc" className="label">
            Description <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <textarea id="np-desc" rows={2} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="np-privacy" className="label">
              Privacy
            </label>
            <select id="np-privacy" className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)}>
              <option value="TEAM">Team members</option>
              <option value="PUBLIC">Everyone</option>
              <option value="PRIVATE">Only invited members</option>
            </select>
          </div>
          <div>
            <label htmlFor="np-view" className="label">
              Default view
            </label>
            <select id="np-view" className="input" value={view} onChange={(e) => setView(e.target.value as ProjectView)}>
              <option value="LIST">List</option>
              <option value="BOARD">Board</option>
              <option value="CALENDAR">Calendar</option>
            </select>
          </div>
        </div>
        <fieldset>
          <legend className="label">Color</legend>
          <ColorPicker value={color} onChange={setColor} />
        </fieldset>
        {create.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(create.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || !selectedTeam || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
