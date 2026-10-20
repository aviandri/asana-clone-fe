import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { usersApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { Me } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { ColorPicker } from '@/components/ColorPicker';
import { KeyIcon } from '@/components/icons';
import { Modal } from '@/components/Modal';
import { setCelebrationsEnabled, useCelebrationsEnabled } from '@/lib/celebrations';
import { errorMessage } from '@/lib/errors';
import { WorkspaceMenuContent } from '@/workspace/WorkspaceMenu';

/** Saved immediately (per device, localStorage) — independent of the profile Save button. */
function CelebrationsToggle() {
  const on = useCelebrationsEnabled();
  return (
    <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
        checked={on}
        onChange={(e) => setCelebrationsEnabled(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-gray-900">Celebrations</span>
        <span className="block text-xs text-gray-500">
          A quick burst of petals when you clear a section or hit a goal. Always off when your system asks for reduced motion.
        </span>
      </span>
    </label>
  );
}

export function ProfileDialog({ onClose, onCreateWorkspace }: { onClose: () => void; onCreateWorkspace: () => void }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const [name, setName] = useState(me.name);
  const [color, setColor] = useState(me.avatarColor);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: usersApi.updateMe,
    onSuccess: (u) => {
      // PATCH /users/me returns a User; keep the workspace fields of Me.
      qc.setQueryData<Me>(qk.me, (prev) => (prev ? { ...prev, ...u } : prev));
      void qc.invalidateQueries({ queryKey: ['users'] });
      // A new password revoked every token and connected app (SPEC §14).
      void qc.invalidateQueries({ queryKey: qk.tokens });
      onClose();
    },
    meta: { quiet: true },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newPassword && newPassword.length < 8) return setLocalError('New password must be at least 8 characters.');
    if (newPassword && !currentPassword) return setLocalError('Enter your current password to change it.');
    save.mutate({
      ...(name.trim() !== me.name && { name: name.trim() }),
      ...(color !== me.avatarColor && { avatarColor: color }),
      ...(newPassword && { currentPassword, newPassword }),
    });
  };

  return (
    <Modal open onClose={onClose} title="My profile">
      <form onSubmit={submit} className="space-y-4 px-5 pb-5 pt-3">
        <div className="flex items-center gap-3">
          <Avatar user={{ name: name || me.name, avatarColor: color }} size="lg" />
          <div className="text-sm text-gray-500">{me.email}</div>
        </div>
        <div>
          <label htmlFor="pf-name" className="label">Full name</label>
          <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <fieldset>
          <legend className="label">Avatar color</legend>
          <ColorPicker value={color} onChange={setColor} />
        </fieldset>
        <CelebrationsToggle />
        <section aria-label="Workspaces" className="rounded-lg border border-gray-200 p-1">
          <WorkspaceMenuContent label="Your workspaces" onDone={onClose} onCreate={onCreateWorkspace} />
        </section>
        <Link
          to="/settings/tokens"
          onClick={onClose}
          className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50"
        >
          <KeyIcon className="h-4 w-4 text-gray-500" />
          <span>
            <span className="block font-medium text-gray-900">API tokens & connected apps</span>
            <span className="block text-xs text-gray-500">Connect Claude, and manage what can act as you.</span>
          </span>
        </Link>
        <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-sm font-medium text-gray-700">Change password</legend>
          <p className="text-xs text-gray-500">Changing it also revokes your API tokens and disconnects your apps.</p>
          <input aria-label="Current password" type="password" autoComplete="current-password" placeholder="Current password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <input aria-label="New password" type="password" autoComplete="new-password" placeholder="New password (min. 8 characters)" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </fieldset>
        {(localError || save.isError) && (
          <p role="alert" className="text-sm text-red-600">
            {localError ?? errorMessage(save.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || save.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
