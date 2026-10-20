import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '@/api/client';
import { setUploadTransport, type UploadTransport } from '@/api/upload';
import { createMockFetch, createMockUploadTransport } from '@/mocks/backend';
import type { AttachmentRow } from '@/mocks/db';
import { ADMIN, BOB, renderApp, setupMockApi } from '@/test/utils';
import { linkUrlProblem } from './fileTypes';
import { resetUploads } from './uploads';

vi.mock('./PdfViewer', () => ({ default: () => <div role="img" aria-label="PDF" /> }));

const user = () => userEvent.setup();
const HEADER = 'Build responsive header';

afterEach(() => {
  cleanup();
  resetUploads();
  vi.restoreAllMocks();
});

const file = (name: string, type = 'text/plain') => new File(['hello'], name, { type });

async function openTask(loginAs = ADMIN, prepare?: (db: ReturnType<typeof setupMockApi>) => void) {
  const db = setupMockApi(loginAs);
  prepare?.(db);
  const task = db.tasks.find((t) => t.title === HEADER)!;
  const utils = renderApp(`/projects/${task.projectId}/list?task=${task.id}`, { db });
  const dialog = await screen.findByRole('dialog', { name: HEADER });
  const composer = () => within(within(dialog).getByRole('textbox', { name: 'Add a comment' }).closest('div.relative.flex') as HTMLElement);
  return { ...utils, task, dialog, composer };
}

/** Uploads wait until the test lets them through; the mock stores them then. */
function gatedTransport(getDb: () => ReturnType<typeof setupMockApi>) {
  const real = createMockUploadTransport(getDb);
  const gates: { url: string; release: () => Promise<void>; progress: (f: number) => Promise<void>; signal?: AbortSignal }[] = [];
  const transport: UploadTransport = (url, f, opts) =>
    new Promise((resolve, reject) => {
      opts.signal?.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
      gates.push({
        url,
        signal: opts.signal,
        progress: (p) => act(async () => opts.onProgress?.(p)),
        release: () => act(async () => resolve(await real(url, f, { headers: opts.headers }))),
      });
    });
  return { transport, gates };
}

describe('comment composer attachments', () => {
  it('uploads drafts, holds Send until they finish, and posts them with an empty body', async () => {
    const { db, task, dialog, composer } = await openTask();
    const { transport, gates } = gatedTransport(() => db);
    setUploadTransport(transport);
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('notes.txt'));

    await waitFor(() => expect(gates).toHaveLength(1));
    expect(gates[0].url).toBe(`/api/v1/tasks/${task.id}/attachments?draft=true`);
    expect(composer().getByRole('progressbar', { name: 'Uploading notes.txt' })).toBeInTheDocument();
    expect(composer().getByText('Waiting for uploads…')).toBeInTheDocument();
    expect(composer().getByRole('button', { name: 'Comment' })).toBeDisabled();

    await gates[0].release();
    expect(await composer().findByRole('button', { name: 'Remove notes.txt' })).toBeInTheDocument();
    const draft = db.attachments!.find((a) => a.name === 'notes.txt')!;
    expect(draft.draft).toBe(true);
    // Drafts aren't the task's yet: not in its list, no activity.
    expect(within(within(dialog).getByRole('region', { name: 'Attachments' })).queryByRole('button', { name: /^Attachment, notes\.txt/ })).toBeNull();

    await u.click(composer().getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(draft.draft).toBe(false));
    const comment = db.comments.find((c) => c.taskId === task.id)!;
    expect(comment.body).toBe('');
    expect(draft.commentId).toBe(comment.id);
    expect(db.activities.some((a) => a.type === 'ATTACHMENT_ADDED' && (a.data as { name: string }).name === 'notes.txt')).toBe(false);

    const inComment = await within(dialog).findByRole('list', { name: 'Attachments in this comment' });
    expect(within(inComment).getByRole('button', { name: /Attachment, notes\.txt/ })).toBeInTheDocument();
    expect(composer().queryByRole('button', { name: 'Remove notes.txt' })).toBeNull();
    // Comment attachments are part of the task's list too (§13).
    await waitFor(() =>
      expect(within(within(dialog).getByRole('region', { name: 'Attachments' })).getByRole('button', { name: /^Attachment, notes\.txt/ })).toBeInTheDocument(),
    );
  });

  it('deletes a draft when its chip is removed, and all drafts when the composer goes away', async () => {
    const { db, task, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), [file('a.txt'), file('b.txt')]);
    await composer().findByRole('button', { name: 'Remove b.txt' });
    await u.click(composer().getByRole('button', { name: 'Remove a.txt' }));
    await waitFor(() => expect(db.attachments!.some((a) => a.name === 'a.txt')).toBe(false));

    // An upload still in flight when the panel closes is cancelled.
    const { transport, gates } = gatedTransport(() => db);
    setUploadTransport(transport);
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('c.txt'));
    await waitFor(() => expect(gates).toHaveLength(1));
    await u.click(within(dialog).getByRole('button', { name: 'Close task details' }));
    await waitFor(() => expect(db.attachments!.some((a) => a.taskId === task.id && a.name === 'b.txt')).toBe(false));
    expect(gates[0].signal?.aborted).toBe(true);
  });

  it('deletes a draft that finishes uploading after the composer went away', async () => {
    const { db, dialog, composer } = await openTask();
    const { transport, gates } = gatedTransport(() => db);
    setUploadTransport(transport);
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('late.txt'));
    await waitFor(() => expect(gates).toHaveLength(1));
    await gates[0].progress(1);
    expect(composer().getByText('Finishing…')).toBeInTheDocument();
    expect(composer().queryByRole('button', { name: 'Cancel uploading late.txt' })).toBeNull();
    expect(composer().getByRole('button', { name: 'Comment' })).toBeDisabled();

    await u.click(within(dialog).getByRole('button', { name: 'Close task details' }));
    // Too late to abort: it lands, and is deleted rather than left as an orphan draft.
    expect(gates[0].signal?.aborted).toBe(false);
    await gates[0].release();
    await waitFor(() => expect(db.attachments!.some((a) => a.name === 'late.txt')).toBe(false));
  });

  it('adds a link to a comment, checking it first', async () => {
    const { db, task, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.click(composer().getByRole('button', { name: 'Add link to comment' }));
    const form = composer().getByRole('form', { name: 'Add link to comment' });
    await u.type(within(form).getByRole('textbox', { name: 'Link URL' }), 'javascript:alert(1)');
    await u.click(within(form).getByRole('button', { name: 'Add link' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Only http:// and https:// links can be added.');
    expect(db.attachments!.filter((a) => a.taskId === task.id)).toHaveLength(3);

    await u.clear(within(form).getByRole('textbox', { name: 'Link URL' }));
    await u.type(within(form).getByRole('textbox', { name: 'Link URL' }), 'https://www.youtube.com/watch?v=demo');
    await u.click(within(form).getByRole('button', { name: 'Add link' }));
    expect(await composer().findByRole('button', { name: 'Remove youtube.com' })).toBeInTheDocument();
    await u.type(within(dialog).getByRole('textbox', { name: 'Add a comment' }), 'Walkthrough');
    await u.click(composer().getByRole('button', { name: 'Comment' }));

    const inComment = await within(dialog).findByRole('list', { name: 'Attachments in this comment' });
    const card = within(inComment).getByRole('link', { name: 'Link, youtube.com' });
    expect(card).toHaveAttribute('href', 'https://www.youtube.com/watch?v=demo');
    expect(within(card).getByText('Yt')).toBeInTheDocument();
  });

  it('takes files dropped on the composer as drafts, not task attachments', async () => {
    const { db, task, dialog, composer } = await openTask();
    const box = within(dialog).getByRole('textbox', { name: 'Add a comment' });
    const dataTransfer = { types: ['Files'], files: [file('dropped.txt')], dropEffect: 'none' };
    fireEvent.dragEnter(box, { dataTransfer });
    expect(composer().getByText('Drop to attach to your comment')).toBeInTheDocument();
    expect(within(dialog).queryByText('Drop to attach to this task')).toBeNull();
    fireEvent.drop(box, { dataTransfer });
    expect(await composer().findByRole('button', { name: 'Remove dropped.txt' })).toBeInTheDocument();
    expect(db.attachments!.find((a) => a.taskId === task.id && a.name === 'dropped.txt')?.draft).toBe(true);
  });

  it('takes a file pasted into the comment box as a draft', async () => {
    const { db, dialog, composer } = await openTask();
    fireEvent.paste(within(dialog).getByRole('textbox', { name: 'Add a comment' }), { clipboardData: { files: [file('shot.png', 'image/png')] } });
    expect(await composer().findByRole('button', { name: 'Remove shot.png' })).toBeInTheDocument();
    expect(db.attachments!.find((a) => a.name === 'shot.png')?.draft).toBe(true);
  });

  it('lets COMMENTERs attach to comments (but not to the task)', async () => {
    const { db, dialog, composer } = await openTask(BOB, (d) => {
      const task = d.tasks.find((t) => t.title === HEADER)!;
      const bob = d.users.find((x) => x.email === BOB)!;
      d.projectMembers.push({ projectId: task.projectId!, userId: bob.id, role: 'COMMENTER' });
    });
    expect(within(within(dialog).getByRole('region', { name: 'Attachments' })).queryByRole('button', { name: 'Add link' })).toBeNull();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('review.txt'));
    await u.click(await composer().findByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(db.attachments!.find((a) => a.name === 'review.txt')?.draft).toBe(false));
  });

  it('leaves out files beyond 20 per comment, saying so', async () => {
    const { db, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(
      composer().getByLabelText('Choose files for the comment'),
      Array.from({ length: 22 }, (_, i) => file(`f${i}.txt`)),
    );
    expect(await screen.findByText('A comment can have up to 20 attachments; 2 files were left out.')).toBeInTheDocument();
    await waitFor(() => expect(db.attachments!.filter((a) => a.draft)).toHaveLength(20));
    expect(composer().getByRole('button', { name: 'Attach files to comment' })).toBeDisabled();
  });
});

describe('links on the task', () => {
  it('adds a link from the section after checking it, with activity', async () => {
    const { db, task, dialog } = await openTask();
    const section = within(within(dialog).getByRole('region', { name: 'Attachments' }));
    const u = user();
    await u.click(section.getByRole('button', { name: 'Add link' }));
    const form = section.getByRole('form', { name: 'Add link' });
    await u.type(within(form).getByRole('textbox', { name: 'Link URL' }), 'https://me:secret@example.com/x');
    await u.click(within(form).getByRole('button', { name: 'Add link' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Links can’t contain a username or password.');

    await u.clear(within(form).getByRole('textbox', { name: 'Link URL' }));
    await u.type(within(form).getByRole('textbox', { name: 'Link URL' }), 'https://www.figma.com/file/nav');
    await u.type(within(form).getByRole('textbox', { name: 'Link title (optional)' }), 'Nav spec');
    await u.click(within(form).getByRole('button', { name: 'Add link' }));
    expect(await section.findByRole('link', { name: 'Link, Nav spec' })).toHaveAttribute('href', 'https://www.figma.com/file/nav');
    expect(section.queryByRole('form', { name: 'Add link' })).toBeNull();
    expect(db.attachments!.find((a) => a.taskId === task.id && a.title === 'Nav spec')?.draft).toBe(false);
    expect(await within(dialog).findByText(/added the link “Nav spec”/)).toBeInTheDocument();
  });

  it('shows a failed preview by its domain, and refreshes previews', async () => {
    const { db, dialog } = await openTask(ADMIN, (d) => {
      const link = d.attachments!.find((a) => a.kind === 'LINK')!;
      Object.assign(link, { title: null, siteName: null, provider: null, previewStatus: 'FAILED', url: 'https://docs.example.org/page' } satisfies Partial<AttachmentRow>);
    });
    const section = within(within(dialog).getByRole('region', { name: 'Attachments' }));
    const card = section.getByRole('link', { name: 'Link, https://docs.example.org/page' });
    // No fetched title or site: the domain stands in, once.
    expect(within(card).getAllByText('docs.example.org')).toHaveLength(1);
    const u = user();
    await u.click(section.getByRole('button', { name: 'More actions for https://docs.example.org/page' }));
    await u.click(screen.getByRole('button', { name: 'Refresh preview' }));
    await waitFor(() => expect(db.attachments!.find((a) => a.kind === 'LINK')?.previewStatus).toBe('READY'));
  });

  it('labels a pending preview', async () => {
    const { dialog } = await openTask(ADMIN, (d) => {
      d.attachments!.find((a) => a.kind === 'LINK')!.previewStatus = 'PENDING';
    });
    expect(within(dialog).getByText('Fetching preview…')).toBeInTheDocument();
  });

  it('checks link URLs like the server', () => {
    expect(linkUrlProblem('https://figma.com/file/x')).toBeNull();
    expect(linkUrlProblem('figma.com')).toMatch(/full link/);
    expect(linkUrlProblem(`https://x.com/${'a'.repeat(2048)}`)).toMatch(/2048/);
    expect(linkUrlProblem('data:text/html,hi')).toMatch(/Only http/);
  });
});

describe('comment attachments in the viewer', () => {
  it('opens a comment’s image in the shared viewer, arrowing through all the task’s images', async () => {
    const { dialog } = await openTask(ADMIN, (d) => {
      const task = d.tasks.find((t) => t.title === HEADER)!;
      const png = d.attachments!.find((a) => a.name === 'header-mock.png')!;
      d.comments.push({ id: 'cmnt0000-0000-4000-8000-0000000000ff', taskId: task.id, authorId: png.uploaderId, body: 'Option B', createdAt: '2001-01-01T00:00:00.000Z', editedAt: null });
      d.attachments!.push({ ...png, id: 'atch0000-0000-4000-8000-0000000000ff', name: 'option-b.png', commentId: 'cmnt0000-0000-4000-8000-0000000000ff', createdAt: '2001-01-01T00:00:00.000Z' });
    });
    const inComment = await within(dialog).findByRole('list', { name: 'Attachments in this comment' });
    const u = user();
    await u.click(within(inComment).getByRole('button', { name: /Attachment, option-b\.png/ }));
    const viewer = await screen.findByRole('dialog', { name: 'option-b.png' });
    await u.click(within(viewer).getByRole('button', { name: 'Previous image' }));
    expect(await screen.findByRole('dialog', { name: 'header-mock.png' })).toBeInTheDocument();
  });
});

/** Holds `POST /tasks/:id/comments` until released; everything else goes straight to the mock. */
function gateComments(db: ReturnType<typeof setupMockApi>, opts: { fail?: boolean } = {}) {
  const base = createMockFetch(() => db);
  let open: () => void = () => undefined;
  const held = new Promise<void>((r) => (open = r));
  const deleted: string[] = [];
  setFetch(async (input, init) => {
    if (init?.method === 'DELETE') deleted.push(input);
    if (init?.method === 'POST' && /\/tasks\/[^/]+\/comments$/.test(input)) {
      await held;
      if (opts.fail) return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }), { status: 500 });
    }
    return base(input, init);
  });
  return { release: () => act(async () => open()), deleted };
}

describe('posting with drafts (#30 review)', () => {
  it('keeps a draft added during a slow post, and won’t remove the ones being sent', async () => {
    const { db, task, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('sent.txt'));
    await composer().findByRole('button', { name: 'Remove sent.txt' });
    const gate = gateComments(db);
    await u.click(composer().getByRole('button', { name: 'Comment' }));
    expect(composer().getByRole('button', { name: 'Remove sent.txt' })).toBeDisabled();

    // Attaching stays open while the post is in flight.
    await u.click(composer().getByRole('button', { name: 'Add link to comment' }));
    const form = composer().getByRole('form', { name: 'Add link to comment' });
    await u.type(within(form).getByRole('textbox', { name: 'Link URL' }), 'https://www.figma.com/file/later');
    await u.click(within(form).getByRole('button', { name: 'Add link' }));
    await composer().findByRole('button', { name: 'Remove figma.com' });

    await gate.release();
    await waitFor(() => expect(composer().queryByRole('button', { name: 'Remove sent.txt' })).toBeNull());
    const comment = db.comments.find((c) => c.taskId === task.id)!;
    expect(db.attachments!.find((a) => a.name === 'sent.txt')?.commentId).toBe(comment.id);
    // The late one is still a draft, still shown, and still cleaned up on leaving.
    expect(composer().getByRole('button', { name: 'Remove figma.com' })).toBeEnabled();
    const late = db.attachments!.find((a) => a.url === 'https://www.figma.com/file/later')!;
    expect(late.draft).toBe(true);
    await u.click(within(dialog).getByRole('button', { name: 'Close task details' }));
    await waitFor(() => expect(db.attachments!.some((a) => a.id === late.id)).toBe(false));
  });

  it('posts the drafts being sent when the panel closes mid-post', async () => {
    const { db, task, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.type(within(dialog).getByRole('textbox', { name: 'Add a comment' }), 'see attached');
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('kept.txt'));
    await composer().findByRole('button', { name: 'Remove kept.txt' });
    const draft = db.attachments!.find((a) => a.name === 'kept.txt')!;
    const gate = gateComments(db);
    await u.click(composer().getByRole('button', { name: 'Comment' }));
    await u.click(within(dialog).getByRole('button', { name: 'Close task details' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: HEADER })).toBeNull());

    await gate.release();
    await waitFor(() => expect(db.comments.some((c) => c.taskId === task.id && c.body === 'see attached')).toBe(true));
    const comment = db.comments.find((c) => c.taskId === task.id && c.body === 'see attached')!;
    await waitFor(() => expect(db.attachments!.find((a) => a.id === draft.id)?.commentId).toBe(comment.id));
    expect(gate.deleted.filter((url) => url.includes(draft.id))).toEqual([]);
  });

  it('deletes the drafts of a post that fails after the panel closed', async () => {
    const { db, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('orphan.txt'));
    await composer().findByRole('button', { name: 'Remove orphan.txt' });
    const draft = db.attachments!.find((a) => a.name === 'orphan.txt')!;
    const gate = gateComments(db, { fail: true });
    await u.click(composer().getByRole('button', { name: 'Comment' }));
    await u.click(within(dialog).getByRole('button', { name: 'Close task details' }));
    expect(gate.deleted).toEqual([]);

    // Nobody can send it again, so it doesn't wait for the sweeper.
    await gate.release();
    await waitFor(() => expect(db.attachments!.some((a) => a.id === draft.id)).toBe(false));
  });

  it('keeps the chips when the server rejects attachmentIds', async () => {
    const { db, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), file('gone.txt'));
    await composer().findByRole('button', { name: 'Remove gone.txt' });
    // Swept on the server meanwhile: the post fails with 400 on attachmentIds.
    db.attachments = db.attachments!.filter((a) => a.name !== 'gone.txt');
    await u.click(composer().getByRole('button', { name: 'Comment' }));
    expect(await composer().findByText('Couldn’t post comment.')).toBeInTheDocument();
    expect(composer().getByRole('button', { name: 'Remove gone.txt' })).toBeEnabled();
    expect(db.comments.some((c) => c.body === '')).toBe(false);
  });

  it('clears failed upload chips once the comment is posted', async () => {
    const { db, dialog, composer } = await openTask();
    const real = createMockUploadTransport(() => db);
    setUploadTransport(async (url, f, opts) =>
      f.name === 'bad.txt' ? { status: 500, text: JSON.stringify({ error: { code: 'INTERNAL', message: 'Disk error' } }) } : real(url, f, opts),
    );
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), [file('good.txt'), file('bad.txt')]);
    await composer().findByRole('button', { name: 'Remove good.txt' });
    expect(await composer().findByRole('alert')).toHaveTextContent('Disk error');
    await u.click(composer().getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(composer().queryByRole('button', { name: 'Remove good.txt' })).toBeNull());
    expect(composer().queryByRole('button', { name: 'Dismiss bad.txt' })).toBeNull();
  });

  it('refuses a 21st attachment through Add link too', async () => {
    const { db, dialog, composer } = await openTask();
    const u = user();
    await u.click(within(dialog).getByRole('textbox', { name: 'Add a comment' }));
    await u.upload(composer().getByLabelText('Choose files for the comment'), Array.from({ length: 20 }, (_, i) => file(`n${i}.txt`)));
    await waitFor(() => expect(db.attachments!.filter((a) => a.draft)).toHaveLength(20));
    expect(composer().getByRole('button', { name: 'Add link to comment' })).toBeDisabled();
    expect(db.attachments!.filter((a) => a.draft && a.kind === 'LINK')).toHaveLength(0);
  });

  it('keeps a paste that carries text as text in the comment box', async () => {
    const { db, dialog } = await openTask();
    const before = db.attachments!.length;
    fireEvent.paste(within(dialog).getByRole('textbox', { name: 'Add a comment' }), {
      clipboardData: { types: ['text/plain', 'Files'], files: [file('cells.png', 'image/png')], getData: () => 'A1\tB1' },
    });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(db.attachments!.length).toBe(before);
  });

  it('never links a non-http(s) link card in a comment', async () => {
    const { dialog } = await openTask(ADMIN, (d) => {
      const task = d.tasks.find((t) => t.title === HEADER)!;
      const link = d.attachments!.find((a) => a.kind === 'LINK')!;
      d.comments.push({ id: 'cmnt0000-0000-4000-8000-0000000000aa', taskId: task.id, authorId: link.uploaderId, body: 'see', createdAt: '2001-01-01T00:00:00.000Z', editedAt: null });
      d.attachments!.push({ ...link, id: 'atch0000-0000-4000-8000-0000000000aa', url: ' JavaScript:alert(1)', title: 'Evil', commentId: 'cmnt0000-0000-4000-8000-0000000000aa' });
    });
    const inComment = await within(dialog).findByRole('list', { name: 'Attachments in this comment' });
    expect(within(inComment).getByLabelText('Link, Evil').closest('a')).toBeNull();
  });
});
