import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { setUploadTransport, uploadFile, type UploadTransport } from '@/api/upload';
import type { AttachmentRow } from '@/mocks/db';
import { createMockUploadTransport } from '@/mocks/backend';
import { ADMIN, ALICE, BOB, renderApp, setupMockApi } from '@/test/utils';
import { attachmentLabel, fileFamily, formatBytes, isHttpUrl, MAX_UPLOAD_BYTES, previewKind } from './fileTypes';
import { resetUploads } from './uploads';
import { canDeleteAttachment } from './useAttachments';

// pdf.js needs a real canvas; the viewer's wiring is what's tested here.
vi.mock('./PdfViewer', () => ({
  default: ({ url, name }: { url: string; name: string }) => <div role="img" aria-label={`PDF ${name}`} data-url={url} />,
}));

const user = () => userEvent.setup();
const HEADER = 'Build responsive header';

afterEach(() => {
  cleanup(); // unmount before dropping leftover (failed) uploads
  resetUploads();
  vi.restoreAllMocks();
});

function file(name: string, type: string, body = 'hello') {
  return new File([body], name, { type });
}

async function openTask(title = HEADER, loginAs = ADMIN, prepare?: (db: ReturnType<typeof setupMockApi>) => void) {
  const db = setupMockApi(loginAs);
  prepare?.(db);
  const task = db.tasks.find((t) => t.title === title)!;
  const utils = renderApp(`/projects/${task.projectId}/list?task=${task.id}`, { db });
  const dialog = await screen.findByRole('dialog', { name: title });
  return { ...utils, task, dialog };
}

const section = (dialog: HTMLElement) => within(within(dialog).getByRole('region', { name: 'Attachments' }));

/** An upload transport the test resolves (or fails) by hand. */
function manualTransport() {
  const calls: { url: string; file: File; signal?: AbortSignal; resolve: (status: number, body?: unknown) => Promise<void>; progress: (f: number) => void }[] = [];
  const transport: UploadTransport = (url, f, { onProgress, signal }) =>
    new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
      calls.push({
        url,
        file: f,
        signal,
        // In act(): settling an upload updates the store the panel renders from.
        resolve: (status, body) => act(async () => resolve({ status, text: body === undefined ? '' : JSON.stringify(body) })),
        progress: (p) => act(() => onProgress?.(p)),
      });
    });
  return { transport, calls };
}

describe('attachments section', () => {
  it('lists the task’s attachments newest first with accessible names', async () => {
    const { dialog } = await openTask();
    const s = section(dialog);
    expect(s.getByRole('heading', { name: /Attachments\s*3/ })).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'Attachment, header-mock.png, 127 B' })).toBeInTheDocument();
    expect(s.getByRole('button', { name: /Attachment, header-notes\.txt/ })).toBeInTheDocument();
    const link = s.getByRole('link', { name: 'Link, Header explorations' });
    expect(link).toHaveAttribute('href', 'https://www.figma.com/file/mekari-header');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('never turns a non-http(s) link into a link', async () => {
    const { dialog } = await openTask(HEADER, ADMIN, (db) => {
      const link = db.attachments!.find((a) => a.kind === 'LINK')!;
      link.url = 'javascript:alert(1)';
      link.title = 'Sneaky';
    });
    const s = section(dialog);
    expect(s.queryByRole('link', { name: /Sneaky/ })).toBeNull();
    expect(s.getByLabelText('Link, Sneaky').closest('a')).toBeNull();
  });

  it('uploads a picked file with progress, then shows it, its activity and the count', async () => {
    const { transport, calls } = manualTransport();
    const { dialog, db, task } = await openTask();
    setUploadTransport(transport);
    const u = user();
    await u.upload(within(dialog).getByLabelText('Choose files to attach'), file('brief.pdf', 'application/pdf'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(`/api/v1/tasks/${task.id}/attachments`);
    calls[0].progress(0.4);
    const bar = await section(dialog).findByRole('progressbar', { name: 'Uploading brief.pdf' });
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '40'));

    // The server stores it: answer with what the mock would.
    const real = await createMockUploadTransport(() => db)(calls[0].url, calls[0].file, { headers: {} });
    await calls[0].resolve(real.status, JSON.parse(real.text));

    expect(await section(dialog).findByRole('button', { name: /Attachment, brief\.pdf/ })).toBeInTheDocument();
    expect(section(dialog).queryByRole('progressbar')).toBeNull();
    expect(await within(dialog).findByText(/attached “brief\.pdf”/)).toBeInTheDocument();
    expect(db.attachments!.filter((a) => a.taskId === task.id)).toHaveLength(4);
  });

  it('rejects files over 100 MB before uploading, with no request and no retry', async () => {
    const { transport, calls } = manualTransport();
    const { dialog } = await openTask();
    setUploadTransport(transport);
    const big = file('video.mov', 'video/quicktime');
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    await user().upload(within(dialog).getByLabelText('Choose files to attach'), big);
    expect(await section(dialog).findByRole('alert')).toHaveTextContent('video.mov is larger than 100 MB.');
    expect(section(dialog).queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(calls).toHaveLength(0);
    await user().click(section(dialog).getByRole('button', { name: 'Dismiss video.mov' }));
    expect(section(dialog).queryByRole('alert')).toBeNull();
  });

  it('shows the server’s 413 without offering a retry', async () => {
    const { transport, calls } = manualTransport();
    const { dialog } = await openTask();
    setUploadTransport(transport);
    await user().upload(within(dialog).getByLabelText('Choose files to attach'), file('a.zip', 'application/zip'));
    await waitFor(() => expect(calls).toHaveLength(1));
    await calls[0].resolve(413);
    expect(await section(dialog).findByRole('alert')).toHaveTextContent('a.zip is larger than 100 MB.');
    expect(section(dialog).queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('cancels an upload in flight, and retries a failed one', async () => {
    const { transport, calls } = manualTransport();
    const { dialog, db, task } = await openTask();
    setUploadTransport(transport);
    const u = user();
    await u.upload(within(dialog).getByLabelText('Choose files to attach'), [file('one.txt', 'text/plain'), file('two.txt', 'text/plain')]);
    await waitFor(() => expect(calls).toHaveLength(2));

    await u.click(section(dialog).getByRole('button', { name: 'Cancel uploading one.txt' }));
    expect(calls[0].signal?.aborted).toBe(true);
    expect(section(dialog).queryByRole('progressbar', { name: 'Uploading one.txt' })).toBeNull();

    await calls[1].resolve(500, { error: { code: 'INTERNAL', message: 'Disk full' } });
    expect(await section(dialog).findByRole('alert')).toHaveTextContent('Disk full');
    await u.click(section(dialog).getByRole('button', { name: 'Retry uploading two.txt' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    const real = await createMockUploadTransport(() => db)(calls[2].url, calls[2].file, { headers: {} });
    await calls[2].resolve(real.status, JSON.parse(real.text));
    expect(await section(dialog).findByRole('button', { name: /Attachment, two\.txt/ })).toBeInTheDocument();
    expect(db.attachments!.filter((a) => a.taskId === task.id).map((a) => a.name)).not.toContain('one.txt');
  });

  it('attaches files dropped on the task panel, highlighting it while they hover', async () => {
    const { dialog, db, task } = await openTask();
    const dropped = file('drop.png', 'image/png');
    const dataTransfer = { types: ['Files'], files: [dropped], dropEffect: 'none' };
    fireEvent.dragEnter(dialog, { dataTransfer });
    expect(within(dialog).getByText('Drop to attach to this task')).toBeInTheDocument();
    fireEvent.dragOver(dialog, { dataTransfer });
    fireEvent.drop(dialog, { dataTransfer });
    expect(within(dialog).queryByText('Drop to attach to this task')).toBeNull();
    expect(await section(dialog).findByRole('button', { name: /Attachment, drop\.png/ })).toBeInTheDocument();
    expect(db.attachments!.some((a) => a.taskId === task.id && a.name === 'drop.png' && !a.draft)).toBe(true);
  });

  it('attaches a pasted screenshot, but leaves text pastes in fields alone', async () => {
    const { dialog, db, task } = await openTask();
    const shot = file('Screenshot.png', 'image/png');
    fireEvent.paste(within(dialog).getByRole('textbox', { name: 'Task title' }), { clipboardData: { files: [shot] } });
    fireEvent.paste(dialog, { clipboardData: { files: [shot] } });
    expect(await section(dialog).findByRole('button', { name: /Attachment, Screenshot\.png/ })).toBeInTheDocument();
    expect(db.attachments!.filter((a) => a.taskId === task.id && a.name === 'Screenshot.png')).toHaveLength(1);
  });

  it('is read-only for COMMENTERs: no Attach file, no drop target, no Delete on others’ files', async () => {
    const { dialog } = await openTask(HEADER, BOB, (db) => {
      const task = db.tasks.find((t) => t.title === HEADER)!;
      const bob = db.users.find((x) => x.email === BOB)!;
      db.projectMembers.push({ projectId: task.projectId!, userId: bob.id, role: 'COMMENTER' });
    });
    const s = section(dialog);
    expect(s.queryByRole('button', { name: 'Attach file' })).toBeNull();
    fireEvent.dragEnter(dialog, { dataTransfer: { types: ['Files'], files: [] } });
    expect(within(dialog).queryByText('Drop to attach to this task')).toBeNull();
    await user().click(s.getByRole('button', { name: 'More actions for header-mock.png' }));
    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('deletes after confirming, with an activity story', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { dialog, db, task } = await openTask();
    const u = user();
    await u.click(section(dialog).getByRole('button', { name: 'More actions for header-notes.txt' }));
    await u.click(screen.getByRole('button', { name: 'Delete' }));
    expect(window.confirm).toHaveBeenCalledWith('Delete “header-notes.txt”? This can’t be undone.');
    await waitFor(() => expect(section(dialog).queryByRole('button', { name: /header-notes\.txt/ })).toBeNull());
    expect(db.attachments!.some((a) => a.taskId === task.id && a.name === 'header-notes.txt')).toBe(false);
    expect(await within(dialog).findByText(/removed the attachment “header-notes\.txt”/)).toBeInTheDocument();
  });
});

describe('attachment viewer', () => {
  it('previews plain text in a <pre>, never as HTML', async () => {
    const { dialog } = await openTask(HEADER, ADMIN, (db) => {
      const text = db.attachments!.find((a) => a.name === 'header-notes.txt')!;
      text.contentUrl = `data:text/plain;charset=utf-8,${encodeURIComponent('<img src=x onerror=alert(1)> plain')}`;
    });
    await user().click(section(dialog).getByRole('button', { name: /Attachment, header-notes\.txt/ }));
    const viewer = await screen.findByRole('dialog', { name: 'header-notes.txt' });
    const pre = await within(viewer).findByText(/plain$/);
    expect(pre.tagName).toBe('PRE');
    expect(pre.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(viewer.querySelector('pre img')).toBeNull();
    expect(within(viewer).getByRole('link', { name: /Download/ })).toHaveAttribute('download', 'header-notes.txt');
  });

  it('zooms images and arrows through the task’s images only', async () => {
    const { dialog } = await openTask(HEADER, ADMIN, (db) => {
      const png = db.attachments!.find((a) => a.name === 'header-mock.png')!;
      db.attachments!.push({ ...png, id: `${png.id.slice(0, -1)}f`, name: 'second.png', createdAt: '2000-01-01T00:00:00.000Z' } as AttachmentRow);
    });
    const u = user();
    await u.click(section(dialog).getByRole('button', { name: /Attachment, header-mock\.png/ }));
    let viewer = await screen.findByRole('dialog', { name: 'header-mock.png' });
    expect(within(viewer).queryByRole('button', { name: 'Previous image' })).toBeNull();
    await u.click(within(viewer).getByRole('button', { name: 'Zoom in' }));
    expect(within(viewer).getByText('150%')).toBeInTheDocument();
    await u.keyboard('{ArrowRight}');
    viewer = await screen.findByRole('dialog', { name: 'second.png' });
    expect(within(viewer).getByText('100%')).toBeInTheDocument();
    expect(within(viewer).getByRole('img', { name: 'second.png' })).toBeInTheDocument();
    // The text file and the link aren't images: the end of the run.
    expect(within(viewer).queryByRole('button', { name: 'Next image' })).toBeNull();
    await u.click(within(viewer).getByRole('button', { name: 'Previous image' }));
    expect(await screen.findByRole('dialog', { name: 'header-mock.png' })).toBeInTheDocument();
  });

  it('loads the PDF viewer for PDFs and offers Download for types it can’t show', async () => {
    const { dialog } = await openTask(HEADER, ADMIN, (db) => {
      const base = db.attachments!.find((a) => a.name === 'header-notes.txt')!;
      db.attachments!.push(
        { ...base, id: `${base.id.slice(0, -1)}a`, name: 'spec.pdf', mimeType: 'application/pdf', contentUrl: 'data:application/pdf;base64,JVBERi0=' },
        { ...base, id: `${base.id.slice(0, -1)}b`, name: 'page.html', mimeType: 'application/octet-stream', contentUrl: null },
      );
    });
    const u = user();
    await u.click(section(dialog).getByRole('button', { name: /Attachment, spec\.pdf/ }));
    let viewer = await screen.findByRole('dialog', { name: 'spec.pdf' });
    expect(await within(viewer).findByRole('img', { name: 'PDF spec.pdf' })).toHaveAttribute('data-url', 'data:application/pdf;base64,JVBERi0=');
    await u.click(within(viewer).getByRole('button', { name: 'Close' }));

    await u.click(section(dialog).getByRole('button', { name: /Attachment, page\.html/ }));
    viewer = await screen.findByRole('dialog', { name: 'page.html' });
    expect(within(viewer).getByText('There’s no preview for this type of file.')).toBeInTheDocument();
    expect(within(viewer).getAllByRole('link', { name: /Download/ })[0]).toHaveAttribute('href', expect.stringContaining('download=1'));
  });
});

describe('attachment rules', () => {
  it('previews only the server’s inline allowlist', () => {
    const f = (mimeType: string) => ({ kind: 'FILE', mimeType, contentPath: '/x' });
    expect(previewKind(f('image/png'))).toBe('image');
    expect(previewKind(f('application/pdf'))).toBe('pdf');
    expect(previewKind(f('video/quicktime'))).toBe('video');
    expect(previewKind(f('text/plain; charset=utf-8'))).toBe('text');
    for (const unsafe of ['image/svg+xml', 'text/html', 'application/xml', 'application/javascript', 'image/heic']) {
      expect(previewKind(f(unsafe))).toBeNull();
    }
    expect(previewKind({ kind: 'LINK', mimeType: null, contentPath: null })).toBeNull();
  });

  it('formats sizes and labels', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2.3 * 1024 * 1024)).toBe('2.3 MB');
    expect(formatBytes(MAX_UPLOAD_BYTES)).toBe('100 MB');
    expect(attachmentLabel({ kind: 'FILE', name: 'report.pdf', size: 2.3 * 1024 * 1024, title: null, url: null })).toBe(
      'Attachment, report.pdf, 2.3 MB',
    );
    expect(fileFamily('application/octet-stream', 'budget.xlsx')).toBe('spreadsheet');
    expect(fileFamily('image/svg+xml', 'logo.svg')).toBe('code');
  });

  it('accepts only http(s) URLs', () => {
    expect(isHttpUrl('https://figma.com/x')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x', 'not a url', null]) {
      expect(isHttpUrl(bad)).toBe(false);
    }
  });

  it('lets the uploader, admins, project owners and (personal tasks) creators delete', () => {
    const me = { id: 'me', role: 'MEMBER' as const };
    const mine = { uploader: { id: 'me', name: '', email: '', avatarColor: '' } };
    const theirs = { uploader: { id: 'them', name: '', email: '', avatarColor: '' } };
    const projectTask = { projectId: 'p', creator: { id: 'me', name: '', email: '', avatarColor: '' } };
    const personal = { projectId: null, creator: { id: 'me', name: '', email: '', avatarColor: '' } };
    expect(canDeleteAttachment(mine, projectTask, { myRole: 'EDITOR' }, me)).toBe(true);
    expect(canDeleteAttachment(theirs, projectTask, { myRole: 'EDITOR' }, me)).toBe(false);
    expect(canDeleteAttachment(theirs, projectTask, { myRole: 'OWNER' }, me)).toBe(true);
    expect(canDeleteAttachment(theirs, projectTask, { myRole: 'EDITOR' }, { id: 'me', role: 'ADMIN' })).toBe(true);
    expect(canDeleteAttachment(theirs, personal, null, me)).toBe(true);
    expect(canDeleteAttachment(theirs, { ...personal, creator: theirs.uploader }, null, me)).toBe(false);
  });

  it('marks drafts in the query and maps a bodiless 413 to PAYLOAD_TOO_LARGE', async () => {
    setupMockApi(ALICE);
    const seen: string[] = [];
    setUploadTransport(async (url) => {
      seen.push(url);
      return { status: 413, text: '<html>Request Entity Too Large</html>' };
    });
    const err = await uploadFile('/tasks/t1/attachments', file('x.bin', ''), { draft: true }).catch((e: unknown) => e);
    expect(seen).toEqual(['/api/v1/tasks/t1/attachments?draft=true']);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('review fixes (#29)', () => {
  it('never links javascript: URLs in any disguise', async () => {
    const variants = [' javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', '\u0000javascript:alert(1)', 'javascript&colon;alert(1)'];
    for (const v of variants) expect(isHttpUrl(v)).toBe(false);
    const { dialog } = await openTask(HEADER, ADMIN, (db) => {
      Object.assign(db.attachments!.find((a) => a.kind === 'LINK')!, { url: 'JaVa\tScRiPt:alert(1)', title: 'Sneaky' });
    });
    expect(within(dialog).getByLabelText('Link, Sneaky').closest('a')).toBeNull();
  });

  it('keeps keyboard focus in the viewer while the panel re-renders', async () => {
    const { transport, calls } = manualTransport();
    const { dialog } = await openTask();
    setUploadTransport(transport);
    const u = user();
    await u.upload(within(dialog).getByLabelText('Choose files to attach'), file('slow.txt', 'text/plain'));
    await waitFor(() => expect(calls).toHaveLength(1));
    await u.click(section(dialog).getByRole('button', { name: /Attachment, header-mock\.png/ }));
    const viewer = await screen.findByRole('dialog', { name: 'header-mock.png' });
    const zoomIn = within(viewer).getByRole('button', { name: 'Zoom in' });
    zoomIn.focus();
    // Upload progress re-renders the section (and the viewer's parent) with a new onClose.
    await calls[0].progress(0.3);
    await calls[0].progress(0.6);
    expect(document.activeElement).toBe(zoomIn);
  });

  it('closes the viewer on Escape, traps Tab, and gives focus back to the tile', async () => {
    const { dialog } = await openTask();
    const u = user();
    const tile = section(dialog).getByRole('button', { name: /Attachment, header-notes\.txt/ });
    await u.click(tile);
    const viewer = await screen.findByRole('dialog', { name: 'header-notes.txt' });
    const focusables = [...viewer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    focusables[focusables.length - 1].focus();
    await u.tab();
    expect(document.activeElement).toBe(focusables[0]);
    await u.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'header-notes.txt' })).toBeNull());
    expect(document.activeElement).toBe(tile);
    // Escape closed only the viewer, not the task panel.
    expect(screen.getByRole('dialog', { name: HEADER })).toBeInTheDocument();
  });

  it('offers Delete in the viewer only to those allowed', async () => {
    const asCommenter = await openTask(HEADER, BOB, (db) => {
      const task = db.tasks.find((t) => t.title === HEADER)!;
      const bob = db.users.find((x) => x.email === BOB)!;
      db.projectMembers.push({ projectId: task.projectId!, userId: bob.id, role: 'COMMENTER' });
    });
    await user().click(section(asCommenter.dialog).getByRole('button', { name: /Attachment, header-notes\.txt/ }));
    const viewer = await screen.findByRole('dialog', { name: 'header-notes.txt' });
    expect(within(viewer).getByRole('link', { name: /Download/ })).toBeInTheDocument();
    expect(within(viewer).queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('ignores pasted files for COMMENTERs', async () => {
    const { dialog, db } = await openTask(HEADER, BOB, (d) => {
      const task = d.tasks.find((t) => t.title === HEADER)!;
      const bob = d.users.find((x) => x.email === BOB)!;
      d.projectMembers.push({ projectId: task.projectId!, userId: bob.id, role: 'COMMENTER' });
    });
    const before = db.attachments!.length;
    fireEvent.paste(dialog, { clipboardData: { files: [file('x.png', 'image/png')] } });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(db.attachments!.length).toBe(before);
    expect(section(dialog).queryByRole('progressbar')).toBeNull();
  });

  it('shows “Finishing…” without Cancel once the whole file is sent', async () => {
    const { transport, calls } = manualTransport();
    const { dialog } = await openTask();
    setUploadTransport(transport);
    await user().upload(within(dialog).getByLabelText('Choose files to attach'), file('big.txt', 'text/plain'));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(section(dialog).getByRole('button', { name: 'Cancel uploading big.txt' })).toBeInTheDocument();
    await calls[0].progress(1);
    expect(section(dialog).getByText('Finishing…')).toBeInTheDocument();
    expect(section(dialog).queryByRole('button', { name: 'Cancel uploading big.txt' })).toBeNull();
    expect(calls[0].signal?.aborted).toBe(false);
  });

  it('ignores files dropped or pasted on the open viewer (they bubble through the portal)', async () => {
    const { dialog, db, task } = await openTask();
    await user().click(section(dialog).getByRole('button', { name: /Attachment, header-mock\.png/ }));
    const viewer = await screen.findByRole('dialog', { name: 'header-mock.png' });
    const dataTransfer = { types: ['Files'], files: [file('stray.png', 'image/png')], dropEffect: 'none' };
    fireEvent.dragEnter(viewer, { dataTransfer });
    expect(screen.queryByText('Drop to attach to this task')).toBeNull();
    fireEvent.drop(viewer, { dataTransfer });
    fireEvent.paste(viewer, { clipboardData: { files: [file('stray2.png', 'image/png')] } });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(db.attachments!.filter((a) => a.taskId === task.id)).toHaveLength(3);
  });

  it('asks for the first 1 MB of text and stops reading there', async () => {
    const { dialog } = await openTask(HEADER, ADMIN, (db) => {
      Object.assign(db.attachments!.find((a) => a.name === 'header-notes.txt')!, { contentUrl: 'http://files.test/big.txt', size: 3 * 1024 * 1024 });
    });
    let range: string | null = null;
    let sent = 0;
    let cancelled = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      range = (init?.headers as Record<string, string> | undefined)?.Range ?? null;
      const chunk = new TextEncoder().encode('a'.repeat(64 * 1024));
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= 3 * 1024 * 1024) return controller.close();
          sent += chunk.length;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, { status: 200 });
    });
    await user().click(section(dialog).getByRole('button', { name: /Attachment, header-notes\.txt/ }));
    const viewer = await screen.findByRole('dialog', { name: 'header-notes.txt' });
    expect(await within(viewer).findByText('Showing the first 1 MB. Download the file to see all of it.')).toBeInTheDocument();
    expect(range).toBe('bytes=0-1048575');
    expect(viewer.querySelector('pre')!.textContent).toHaveLength(1024 * 1024);
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(2 * 1024 * 1024);
  });

  it('shows an empty file as empty, without asking for a byte range', async () => {
    const { dialog } = await openTask(HEADER, ADMIN, (db) => {
      Object.assign(db.attachments!.find((a) => a.name === 'header-notes.txt')!, { size: 0 });
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await user().click(section(dialog).getByRole('button', { name: /Attachment, header-notes\.txt/ }));
    const viewer = await screen.findByRole('dialog', { name: 'header-notes.txt' });
    expect(within(viewer).getByText('This file is empty.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends at most 3 uploads at once and queues the rest (§13 A12)', async () => {
    const { transport, calls } = manualTransport();
    const { dialog, db } = await openTask();
    setUploadTransport(transport);
    const u = user();
    await u.upload(within(dialog).getByLabelText('Choose files to attach'), [1, 2, 3, 4, 5].map((n) => file(`q${n}.txt`, 'text/plain')));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(section(dialog).getAllByText('Waiting to upload…')).toHaveLength(2);
    // A queued upload cancels without ever being sent.
    await u.click(section(dialog).getByRole('button', { name: 'Cancel uploading q5.txt' }));
    const real = await createMockUploadTransport(() => db)(calls[0].url, calls[0].file, { headers: {} });
    await calls[0].resolve(real.status, JSON.parse(real.text));
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls[3].file.name).toBe('q4.txt');
    // A cancelled one frees its slot too.
    await u.click(section(dialog).getByRole('button', { name: 'Cancel uploading q2.txt' }));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(calls).toHaveLength(4);
    expect(section(dialog).queryByText('Waiting to upload…')).toBeNull();
  });

  it('shows the server’s words for 429 and 507, and lets 507 be retried', async () => {
    const { transport, calls } = manualTransport();
    const { dialog } = await openTask();
    setUploadTransport(transport);
    await user().upload(within(dialog).getByLabelText('Choose files to attach'), [file('r.txt', 'text/plain'), file('s.txt', 'text/plain')]);
    await waitFor(() => expect(calls).toHaveLength(2));
    await calls[0].resolve(429, { error: { code: 'RATE_LIMITED', message: 'You have 1 GiB of unposted drafts. Post or remove some first.' } });
    await calls[1].resolve(507, { error: { code: 'INSUFFICIENT_STORAGE', message: 'The server is almost out of space.' } });
    const alerts = await section(dialog).findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual([
      'You have 1 GiB of unposted drafts. Post or remove some first.',
      'The server is almost out of space.',
    ]);
    expect(section(dialog).getByRole('button', { name: 'Retry uploading s.txt' })).toBeInTheDocument();
  });
});
