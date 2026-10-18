import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { workspacesApi } from '@/api/endpoints';
import { ColorPicker } from '@/components/ColorPicker';
import { Modal } from '@/components/Modal';
import { errorMessage } from '@/lib/errors';
import { useSwitchWorkspace } from './useWorkspace';
import { WorkspaceTile } from './WorkspaceTile';

export function CreateWorkspaceForm({ onCreated, onCancel }: { onCreated?: () => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4573d2');
  const switchTo = useSwitchWorkspace();
  const create = useMutation({
    mutationFn: () => workspacesApi.create({ name: name.trim(), color }),
    // POST /workspaces makes it current on the server already.
    onSuccess: async (ws) => {
      onCreated?.();
      await switchTo(ws, {
        alreadyCurrent: true,
        message: `Created ${ws.name}`,
      });
    },
    meta: { quiet: true },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-end gap-3">
        <WorkspaceTile workspace={{ name: name || 'W', color }} size="lg" />
        <div className="flex-1">
          <label htmlFor="ws-name" className="label">
            Workspace name
          </label>
          <input
            id="ws-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Pilot"
            maxLength={80}
            required
          />
        </div>
      </div>
      <fieldset>
        <legend className="label">Workspace color</legend>
        <ColorPicker value={color} onChange={setColor} />
      </fieldset>
      {create.isError && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}>
          Create workspace
        </button>
      </div>
    </form>
  );
}

export function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Create workspace">
      <div className="px-5 pb-5 pt-3">
        <p className="mb-4 text-sm text-gray-600">A workspace has its own people, teams, projects and goals. You’ll be its admin.</p>
        <CreateWorkspaceForm onCreated={onClose} onCancel={onClose} />
      </div>
    </Modal>
  );
}
