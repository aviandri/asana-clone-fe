import { useMutation } from '@tanstack/react-query';
import { workspacesApi } from '@/api/endpoints';
import { Link } from 'react-router-dom';
import type { Workspace } from '@/api/types';
import { Modal } from '@/components/Modal';
import { errorMessage } from '@/lib/errors';
import { useExitWorkspace } from './useWorkspace';

/** Confirm leaving a workspace (SPEC §12). The last active admin gets a 409, shown inline. */
export function LeaveWorkspaceDialog({
  workspace,
  open,
  onClose: close,
}: {
  workspace: Pick<Workspace, 'id' | 'name' | 'myRole' | 'memberCount'>;
  open: boolean;
  onClose: () => void;
}) {
  const exit = useExitWorkspace();
  // A sole admin who is also the only member can't leave (409): deleting is the way out.
  const onlyMember = workspace.myRole === 'ADMIN' && workspace.memberCount <= 1;
  const leave = useMutation({
    mutationFn: () => workspacesApi.leave(workspace.id),
    onSuccess: async () => {
      close();
      await exit(`You left ${workspace.name}`);
    },
    meta: { quiet: true },
  });
  const onClose = () => {
    leave.reset(); // don't show a stale 409 next time
    close();
  };
  if (onlyMember) {
    return (
      <Modal open={open} onClose={onClose} title={`Leave ${workspace.name}?`}>
        <div className="space-y-4 px-5 pb-5 pt-2 text-sm text-gray-600">
          <p>You’re the only member of {workspace.name}, so there’s no one to hand it over to. To close it, delete the workspace instead.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <Link to="/workspace/settings?tab=danger" className="btn-danger" onClick={onClose}>
              Go to Danger zone
            </Link>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} title={`Leave ${workspace.name}?`}>
      <div className="space-y-4 px-5 pb-5 pt-2 text-sm text-gray-600">
        <p>You’ll lose access to its teams, projects and goals, and leave the teams and projects you’re in. Tasks assigned to you stay assigned.</p>
        <p>To come back, someone has to invite you again.</p>
        {leave.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">
            {errorMessage(leave.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={leave.isPending} onClick={() => leave.mutate()}>
            Leave workspace
          </button>
        </div>
      </div>
    </Modal>
  );
}
