import type { Attachment } from '@/api/types';
import { FileTile } from './AttachmentsSection';
import { LinkCard } from './LinkCard';
import { useOpenAttachment } from './viewerContext';

/** A posted comment's attachments, under its body (oldest first, as the server sends them). */
export function CommentAttachments({ attachments }: { attachments: Attachment[] | undefined }) {
  const open = useOpenAttachment();
  if (!attachments?.length) return null;
  return (
    <ul aria-label="Attachments in this comment" className="mt-1.5 grid max-w-xl grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
      {attachments.map((a) => (
        <li key={a.id}>
          {a.kind === 'FILE' ? (
            <FileTile a={a} onOpen={() => open(a.id)} />
          ) : a.kind === 'LINK' ? (
            <LinkCard a={a} compact />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
