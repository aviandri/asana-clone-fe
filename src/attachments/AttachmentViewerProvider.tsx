import { useState, type ReactNode } from 'react';
import type { Project, TaskDetail } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { AttachmentViewer } from './AttachmentViewer';
import { canDeleteAttachment, useAttachmentActions } from './useAttachments';
import { OpenAttachmentContext } from './viewerContext';

/**
 * One viewer per task panel. The task's attachment list (task-level and comment ones) is what it
 * arrows through, wherever a file was opened from.
 */
export function AttachmentViewerProvider({
  task,
  project,
  children,
}: {
  task: TaskDetail;
  project: Project | null | undefined;
  children: ReactNode;
}) {
  const me = useCurrentUser();
  const { remove } = useAttachmentActions(task);
  const [viewing, setViewing] = useState<string | null>(null);
  const files = (task.attachments ?? []).filter((a) => a.kind === 'FILE');
  return (
    <OpenAttachmentContext.Provider value={setViewing}>
      {children}
      <AttachmentViewer
        files={files}
        viewingId={viewing}
        onNavigate={setViewing}
        onClose={() => setViewing(null)}
        canDelete={(a) => canDeleteAttachment(a, task, project, me)}
        onDelete={(a) => {
          setViewing(null);
          remove.mutate(a);
        }}
      />
    </OpenAttachmentContext.Provider>
  );
}
